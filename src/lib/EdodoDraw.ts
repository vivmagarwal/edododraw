/**
 * EdodoDraw — the framework-agnostic embedding facade.
 *
 * One class that mounts a diagram into any DOM element and exposes the full
 * feature set (render, camera magic-move, timeline, live annotations, export)
 * behind a small, stable API. The React wrapper and the playground both build
 * on this, so the published package is exactly what we dogfood.
 *
 *   const edd = new EdodoDraw(document.getElementById("diagram"));
 *   await edd.render(`scene { a[Hello] --> b[World] }`);
 *   edd.play();
 */

import { AnnotationLayer } from "../engine/annotate/layer.js";
import { LiveAnnotationController, type LiveState, type Tool } from "../engine/annotate/interact.js";
import { EditController, type EditState, type EditTool } from "../engine/edit/controller.js";
import { CameraController } from "../engine/camera/controller.js";
import { cameraForBBox } from "../engine/camera/fit.js";
import { compileEdd } from "../engine/dsl/index.js";
import type { Diagnostic } from "../engine/dsl/diagnostics.js";
import { downloadJSON, downloadPNG, downloadSVG, exportPNGBlob, exportSVGString } from "../engine/export.js";
import type { Point } from "../engine/geometry.js";
import { SvgRenderer } from "../engine/render/svgRenderer.js";
import { sceneBBox } from "../engine/scene/query.js";
import { applyOverrides } from "../engine/scene/overrides.js";
import type { Scene } from "../engine/scene/types.js";
import { TimelinePlayer, type PlayerState } from "../engine/timeline/player.js";
import { resolveCameraDirective, stepStateAt, type StepState } from "../engine/timeline/stepState.js";
import { convertMermaid, extractMermaidBlocks, injectMermaid } from "../engine/import/mermaid.js";

export interface EdodoDrawOptions {
  /** Enable pan (drag) + zoom (wheel) + live-annotation pointer handling. */
  interactive?: boolean;
  /** Draw a dotted grid that pans/zooms with the camera. Default true. */
  grid?: boolean;
  /** Fit the whole diagram after each render. Default true. */
  autoFit?: boolean;
  /** Padding (screen px) used when fitting. */
  padding?: number;
  /**
   * Deterministic frame rendering for screenshot/video consumers: disables
   * ALL wall-clock CSS (visibility transitions, animated arrows, reveal
   * animations). Drive motion explicitly — stepState()/applyStepState(),
   * setRevealProgress(), camera. See docs/INTEGRATION_GUIDE.
   */
  static?: boolean;
  /**
   * Mount with every node/edge hidden (and no annotations) so choreographed
   * embeds never flash the full diagram before the host applies its first
   * state. Reveal via applyStepState()/timeline or applyVisibility.
   */
  startHidden?: boolean;
}

export type EdodoEvent = "render" | "state" | "live" | "diagnostics" | "edit" | "editstate";

/** Tools: diagram-edit tools go to the EditController; annotation tools to the
 *  LiveAnnotationController. */
const EDIT_TOOLS = new Set<string>(["select", "hand", "rect", "ellipse", "diamond", "text", "arrow"]);
const ANNOT_MAP: Record<string, Tool> = {
  highlight: "highlight",
  underline: "underline",
  "mark-box": "box",
  "mark-circle": "circle",
  point: "arrow",
  note: "text",
};

export interface RenderResult {
  scene: Scene;
  diagnostics: Diagnostic[];
}

export class EdodoDraw {
  readonly container: HTMLElement;
  private opts: Required<EdodoDrawOptions>;
  private renderer: SvgRenderer;
  private controller: CameraController;
  private annotations: AnnotationLayer;
  private player: TimelinePlayer;
  private live: LiveAnnotationController;
  private edit: EditController;
  private mode: "edit" | "annotate" = "edit";
  private scene: Scene;
  private source = "";
  private renderSeq = 0;
  private hasFitted = false;
  private fitOnce = false;
  private listeners = new Map<EdodoEvent, Set<(payload: unknown) => void>>();
  private textInput: HTMLInputElement | null = null;
  private closeInput: ((commit: boolean) => void) | null = null;
  private colorScheme: "light" | "dark" | null = null;
  private stylePreset: string | null = null;
  private hasRendered = false;
  private cleanup: Array<() => void> = [];
  // Diagram-edit history (source snapshots). Every direct-manipulation edit
  // rounds through the source, so undo/redo is just a stack of past sources.
  private editUndoStack: string[] = [];
  private editRedoStack: string[] = [];

  constructor(container: HTMLElement, options: EdodoDrawOptions = {}) {
    this.container = container;
    this.opts = {
      interactive: options.interactive ?? true,
      grid: options.grid ?? true,
      autoFit: options.autoFit ?? true,
      padding: options.padding ?? 80,
      static: options.static ?? false,
      startHidden: options.startHidden ?? false,
    };
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.style.overflow = "hidden";

    this.renderer = new SvgRenderer(container, { static: this.opts.static });
    this.renderer.mount();
    this.scene = compileEdd("scene {}").scene;
    this.controller = new CameraController(this.renderer);
    this.annotations = new AnnotationLayer(this.renderer);
    this.player = new TimelinePlayer(this.renderer, this.controller, this.annotations);
    this.live = new LiveAnnotationController(this.renderer, () => this.scene);
    this.edit = new EditController(this.renderer, {
      getScene: () => this.scene,
      getSource: () => this.source,
      onSource: (next) => this.applyEdit(next),
      onState: (s) => this.emitEditState(s),
      onRequestRename: (id, current, screen) => this.showRenameInput(id, current, screen),
      onCursor: (c) => { this.container.style.cursor = c; },
    });

    this.player.onChange = (s) => this.emit("state", s);
    this.live.onChange = (s) => this.emit("live", s);
    this.live.onRequestText = (id, world) => this.showTextInput(id, world);
    this.controller.onFrame = (cam) => this.onCameraFrame(cam);
    if (this.opts.interactive) this.bindInteraction();
  }

  private onCameraFrame(cam: { cx: number; cy: number; zoom: number }): void {
    if (this.opts.grid) this.updateGrid(cam);
    this.edit.render();
  }

  /** Apply a source edit from direct manipulation. Records the pre-edit source
   *  on the undo stack, keeps `source` fresh for chained edits, and notifies the
   *  host, which re-renders (single render). */
  private applyEdit(next: string): void {
    if (next === this.source) return;
    this.editUndoStack.push(this.source);
    if (this.editUndoStack.length > 200) this.editUndoStack.shift();
    this.editRedoStack = [];
    this.source = next;
    this.emit("edit", next);
    this.emitEditState();
  }

  /** Undo the last diagram edit (move/resize/add/delete/rename/style/…). */
  editUndo(): boolean {
    const prev = this.editUndoStack.pop();
    if (prev === undefined) return false;
    this.editRedoStack.push(this.source);
    this.source = prev;
    this.emit("edit", prev);
    this.emitEditState();
    return true;
  }
  /** Redo the last undone diagram edit. */
  editRedo(): boolean {
    const next = this.editRedoStack.pop();
    if (next === undefined) return false;
    this.editUndoStack.push(this.source);
    this.source = next;
    this.emit("edit", next);
    this.emitEditState();
    return true;
  }
  /** Clear the diagram-edit history (e.g. when loading a fresh document). */
  clearEditHistory(): void {
    this.editUndoStack = [];
    this.editRedoStack = [];
    this.emitEditState();
  }
  private emitEditState(s?: EditState): void {
    const base = s ?? this.edit.state();
    this.emit("editstate", { ...base, canUndo: this.editUndoStack.length > 0, canRedo: this.editRedoStack.length > 0 });
  }

  // ---- events -------------------------------------------------------------
  on(event: "state", cb: (s: PlayerState) => void): () => void;
  on(event: "live", cb: (s: LiveState) => void): () => void;
  on(event: "diagnostics", cb: (d: Diagnostic[]) => void): () => void;
  on(event: "render", cb: (r: RenderResult) => void): () => void;
  on(event: "edit", cb: (source: string) => void): () => void;
  on(event: "editstate", cb: (s: EditState) => void): () => void;
  on(event: EdodoEvent, cb: (payload: never) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb as (p: unknown) => void);
    return () => this.listeners.get(event)?.delete(cb as (p: unknown) => void);
  }
  private emit(event: EdodoEvent, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  // ---- render -------------------------------------------------------------
  /**
   * Compile + render EDodoDraw source. Async because a `mermaid` block may need
   * the (lazy-loaded) Mermaid runtime. Safe to call on every keystroke; stale
   * runs are discarded.
   */
  async render(source: string): Promise<RenderResult> {
    // A source that didn't come from a direct-manipulation edit / undo / redo
    // (i.e. typing in the code editor or loading a document) invalidates the
    // diagram-edit history — the code editor owns its own text undo.
    if (source !== this.source && (this.editUndoStack.length || this.editRedoStack.length)) {
      this.editUndoStack = [];
      this.editRedoStack = [];
      this.emitEditState();
    }
    this.source = source;
    const seq = ++this.renderSeq;
    const { scene, diagnostics } = compileEdd(source, { mode: this.colorScheme ?? undefined, stylePreset: this.stylePreset ?? undefined });
    let diags = diagnostics.items;

    const blocks = extractMermaidBlocks(source);
    if (blocks.length) {
      diags = diags.filter((d) => d.code !== "W-MERMAID-SYNC");
      for (const body of blocks) {
        try {
          injectMermaid(scene, await convertMermaid(body, scene.theme.mode));
        } catch (err) {
          diags = [...diags, { severity: "error", code: "M-PARSE", message: `mermaid: ${(err as Error).message}`, line: 1, col: 1, start: 0, end: 0 }];
        }
      }
      if (scene.nodes.every((n) => n.pinned)) scene.meta.layout = "manual";
      applyOverrides(scene); // re-apply so imported nodes honor overrides too
    }
    if (seq !== this.renderSeq) return { scene, diagnostics: diags };

    this.scene = scene;
    this.hasRendered = true;
    this.renderer.render(scene);
    this.player.load(scene);
    if (this.opts.startHidden) {
      this.renderer.applyVisibility(new Set([...scene.nodes.map((n) => n.id), ...scene.edges.map((e) => e.id)]));
      this.annotations.clear();
    }
    this.renderer.measure();
    // Fit only on the first render or when explicitly requested — NOT on every
    // edit/keystroke (that would reset the camera while you're working).
    if (this.opts.autoFit && (!this.hasFitted || this.fitOnce)) this.fit(false);
    else this.updateGrid(this.controller.current);
    this.hasFitted = true;
    this.fitOnce = false;
    this.live.render();
    this.edit.render();

    this.emit("diagnostics", diags);
    this.emit("render", { scene, diagnostics: diags });
    return { scene, diagnostics: diags };
  }

  /**
   * Render a programmatic Scene directly (skip the DSL). Pair with
   * `vizToScene()` / `runViz()` / hand-built Scene IR to create diagrams on
   * the fly. Note: direct-manipulation editing round-trips through `.edd`
   * source, so canvas edits are inert for scenes rendered this way — use
   * `render()`/`appendSource()` when you need the code round-trip.
   */
  renderScene(scene: Scene): void {
    this.renderSeq++; // invalidate any in-flight async render()
    this.source = "";
    this.scene = scene;
    this.hasRendered = true;
    this.renderer.render(scene);
    this.player.load(scene);
    if (this.opts.startHidden) {
      this.renderer.applyVisibility(new Set([...scene.nodes.map((n) => n.id), ...scene.edges.map((e) => e.id)]));
      this.annotations.clear();
    }
    this.renderer.measure();
    if (this.opts.autoFit && (!this.hasFitted || this.fitOnce)) this.fit(false);
    else this.updateGrid(this.controller.current);
    this.hasFitted = true;
    this.fitOnce = false;
    this.live.render();
    this.edit.render();
    this.emit("render", { scene, diagnostics: [] });
  }

  /**
   * Append a DSL fragment to the current source and re-render — grow a
   * diagram at runtime while keeping the text as the single source of truth:
   *   await edd.appendSource(`annotate { circle-mark api "hot path" }`);
   */
  appendSource(fragment: string): Promise<RenderResult> {
    const base = this.source.trimEnd();
    return this.render(base ? `${base}\n${fragment}` : fragment);
  }

  getScene(): Scene {
    return this.scene;
  }
  getSource(): string {
    return this.source;
  }

  /**
   * Force light/dark rendering, overriding the diagram's declared theme. Affects
   * the canvas background, the dotted grid, and the diagram's default ink
   * (strokes/text adapt for contrast on the dark canvas; explicit colors are
   * kept). Pass `null` to fall back to the DSL's own theme. Re-renders the
   * current source. Cheap and idempotent — no-ops if the scheme is unchanged.
   */
  setColorScheme(mode: "light" | "dark" | null): void {
    if (this.colorScheme === mode) return;
    this.colorScheme = mode;
    // Re-render if we've rendered at all — including an empty ("") diagram, whose
    // canvas background + grid still need re-theming.
    if (this.hasRendered) void this.render(this.source);
  }
  getColorScheme(): "light" | "dark" | null {
    return this.colorScheme;
  }

  /**
   * Force a style preset by name (see docs/STYLES_GUIDE), overriding the
   * diagram's `meta { style: … }`. Pass `null` to fall back to the source's own
   * declaration. Re-renders the current source; unknown names warn and keep the
   * classic look.
   */
  setStylePreset(name: string | null): void {
    if (this.stylePreset === name) return;
    this.stylePreset = name;
    if (this.hasRendered) void this.render(this.source);
  }
  getStylePreset(): string | null {
    return this.stylePreset;
  }

  // ---- camera -------------------------------------------------------------
  fit(animate = true): void {
    this.renderer.measure();
    const cam = cameraForBBox(sceneBBox(this.scene), this.renderer.getViewportSize(), { padding: this.opts.padding });
    if (animate) void this.controller.animateTo(cam);
    else this.controller.setImmediate(cam);
  }
  focus(ids: string[], opts?: { zoom?: number; padding?: number }): Promise<void> {
    return this.controller.focus(this.scene, ids, opts);
  }
  zoomBy(factor: number): void {
    this.controller.zoomBy(factor);
  }
  reset(): void {
    this.fit(true);
  }
  get camera(): CameraController {
    return this.controller;
  }

  // ---- timeline -----------------------------------------------------------
  play(): void {
    this.player.play();
  }
  pause(): void {
    this.player.pause();
  }
  next(): void {
    this.player.next();
  }
  prev(): void {
    this.player.prev();
  }
  goto(i: number): void {
    void this.player.goto(i);
  }
  restart(): void {
    this.player.restart();
  }
  get timeline(): TimelinePlayer {
    return this.player;
  }

  // ---- frame-driven choreography (video / capture hosts) -------------------
  /** Pure render-state for step `index` (-1 = overview) — no clock, no DOM. */
  stepState(index: number): StepState {
    return stepStateAt(this.scene, index);
  }
  /**
   * Apply a StepState instantly (no tweens): visibility, annotations, and the
   * step's sticky camera. Call per frame with states from stepState() to drive
   * the timeline's own semantics frame-accurately (pair with {static: true};
   * interpolate cameras yourself via mixCameras() for magic-move).
   */
  applyStepState(state: StepState): void {
    this.renderer.applyVisibility(new Set(state.hidden));
    this.annotations.render(this.scene, state.annotations, false);
    if (state.effectiveCamera) {
      const cam = resolveCameraDirective(this.scene, state.effectiveCamera, this.renderer.getViewportSize(), { current: this.controller.current });
      this.controller.setImmediate(cam);
    }
  }
  /**
   * Host-driven draw-on: sweep an element's strokes on, then fade its labels.
   * `id` = node id, edge id, or viz-item key ("block.item"); `p` = 0..1.
   */
  setRevealProgress(id: string, p: number): void {
    this.renderer.setRevealProgress(id, p);
  }
  /** Hide/show elements directly (ids to hide; others become visible). */
  applyVisibility(hiddenIds: Iterable<string>): void {
    this.renderer.applyVisibility(new Set(hiddenIds));
  }

  // ---- tools (diagram-edit + annotation) ----------------------------------
  /** Select the active tool. Edit tools (select/hand/rect/ellipse/diamond/
   *  text/arrow) manipulate the diagram; annotation tools (highlight/underline/
   *  mark-box/mark-circle/point/note) overlay annotations. */
  setTool(tool: string): void {
    if (EDIT_TOOLS.has(tool)) {
      this.mode = "edit";
      this.edit.setTool(tool as EditTool);
      this.container.style.cursor = this.baseCursor();
    } else if (tool in ANNOT_MAP) {
      this.mode = "annotate";
      this.edit.clearSelection();
      this.live.setTool(ANNOT_MAP[tool]);
      this.container.style.cursor = "crosshair";
    }
  }
  /** Resting cursor for the active edit tool (hover overrides it live). */
  private baseCursor(): string {
    const t = this.edit.getTool();
    if (t === "hand") return "grab";
    if (t === "select") return "default";
    return "crosshair";
  }
  /** Fit the whole diagram on the next render (used when loading an example). */
  fitNext(): void {
    this.fitOnce = true;
  }
  get editor(): EditController {
    return this.edit;
  }
  applyStyle(id: string, style: { fill?: string; stroke?: string; shape?: string }): void {
    this.edit.applyStyle(id, style);
  }
  /** Apply a style to several nodes in one undo step. */
  applyStyleMany(ids: string[], style: { fill?: string; stroke?: string; shape?: string }): void {
    this.edit.applyStyleMany(ids, style);
  }
  duplicateSelected(): void {
    this.edit.duplicateSelected();
  }
  deleteSelected(): void {
    this.edit.deleteSelected();
  }
  renameSelected(): void {
    this.edit.requestRenameSelected();
  }

  // ---- undo / redo --------------------------------------------------------
  /** Undo the current mode's last action (diagram edit, or annotation). */
  undo(): void {
    if (this.mode === "edit") this.editUndo();
    else this.live.undo();
  }
  redo(): void {
    if (this.mode === "edit") this.editRedo();
    else this.live.redo();
  }
  clearAnnotations(): void {
    this.live.clear();
  }
  /** Serialize live annotations into an `annotate { … }` block. */
  annotationsToCode(): string {
    return this.live.commitToCode();
  }
  get annotator(): LiveAnnotationController {
    return this.live;
  }

  // ---- export -------------------------------------------------------------
  toSVG(): Promise<string> {
    return exportSVGString(this.renderer, this.scene);
  }
  toPNG(): Promise<Blob> {
    return exportPNGBlob(this.renderer, this.scene);
  }
  toJSON(): Scene {
    return this.scene;
  }
  downloadSVG(): Promise<void> {
    return downloadSVG(this.renderer, this.scene);
  }
  downloadPNG(): Promise<void> {
    return downloadPNG(this.renderer, this.scene);
  }
  downloadJSON(): void {
    downloadJSON(this.scene);
  }

  // ---- lifecycle ----------------------------------------------------------
  resize(): void {
    this.renderer.measure();
    this.renderer.applyCamera(this.renderer.getCamera());
    this.updateGrid(this.controller.current);
    // Re-draw screen-space overlays so the selection box / annotations track the
    // new viewport (e.g. when the code pane collapses and the canvas reflows).
    this.edit.render();
    this.live.render();
  }
  destroy(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.closeInput?.(false);
    this.textInput?.remove();
    this.edit.dispose();
    this.player.dispose();
    this.renderer.destroy();
    this.listeners.clear();
  }

  // ---- internals ----------------------------------------------------------
  private updateGrid(cam: { cx: number; cy: number; zoom: number }): void {
    if (!this.opts.grid) return;
    const { w, h } = this.renderer.getViewportSize();
    const cell = 26 * cam.zoom;
    const c = this.container;
    if (cell < 7) {
      c.style.backgroundImage = "none";
      return;
    }
    const dot = this.scene.theme.gridColor;
    c.style.backgroundImage = `radial-gradient(circle, ${dot} 1px, transparent 1px)`;
    c.style.backgroundSize = `${cell}px ${cell}px`;
    c.style.backgroundPosition = `${-cam.cx * cam.zoom + w / 2}px ${-cam.cy * cam.zoom + h / 2}px`;
  }

  private localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = this.container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private bindInteraction(): void {
    const host = this.container;
    const add = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      host.addEventListener(t, fn as EventListener, opts);
      this.cleanup.push(() => host.removeEventListener(t, fn as EventListener, opts));
    };

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.cleanup.push(() => ro.disconnect());

    add("wheel", (e) => {
      e.preventDefault();
      this.player.pause();
      this.controller.zoomBy(Math.exp(-e.deltaY * 0.0016), this.localPoint(e));
      this.live.render();
    }, { passive: false });

    let dragging = false;
    let lx = 0;
    let ly = 0;
    add("pointerdown", (e) => {
      if (e.button !== 0) return;
      const local = this.localPoint(e);
      const world = this.renderer.screenToWorld(local);
      const handled = this.mode === "edit" ? this.edit.pointerDown(world, local, { shift: e.shiftKey }) : this.live.pointerDown(world, local);
      if (handled) {
        host.setPointerCapture(e.pointerId);
        return;
      }
      dragging = true; // fall through to camera pan
      lx = e.clientX;
      ly = e.clientY;
      host.setPointerCapture(e.pointerId);
      host.style.cursor = "grabbing";
    });
    add("pointermove", (e) => {
      const local = this.localPoint(e);
      const world = this.renderer.screenToWorld(local);
      if (this.mode === "edit") this.edit.pointerMove(world, local);
      else this.live.pointerMove(world);
      if (!dragging) return;
      this.player.pause();
      this.controller.panByScreen(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
      this.live.render();
      this.edit.render();
    });
    add("pointerup", (e) => {
      const world = this.renderer.screenToWorld(this.localPoint(e));
      if (this.mode === "edit") this.edit.pointerUp(world);
      else this.live.pointerUp(world);
      dragging = false;
      try {
        host.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      host.style.cursor = this.mode === "edit" ? this.baseCursor() : "crosshair";
    });
    add("dblclick", (e) => {
      if (this.mode !== "edit") return;
      this.edit.dblclick(this.renderer.screenToWorld(this.localPoint(e)));
    });

    const onKey = (e: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in a field or rich editor
      // (inputs, textareas, and contenteditable code editors like CodeMirror).
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable || t?.closest?.("[contenteditable='true'], .cm-editor")) return;

      // ⌘/Ctrl chords: undo/redo/duplicate/copy/paste/select-all.
      const meta = (e.metaKey || e.ctrlKey) && !e.altKey;
      if (meta) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          if (this.mode === "annotate") { if (this.live.handleKey(e)) e.preventDefault(); return; }
          if (e.shiftKey ? this.editRedo() : this.editUndo()) e.preventDefault();
          return;
        }
        if (k === "y") { if (this.mode === "edit" && this.editRedo()) e.preventDefault(); return; }
        if (this.mode === "edit") {
          if (k === "d") { if (this.edit.duplicateSelected()) e.preventDefault(); return; }
          if (k === "c") { if (this.edit.copySelected()) e.preventDefault(); return; }
          if (k === "v") { if (this.edit.paste()) e.preventDefault(); return; }
          if (k === "a") { this.edit.selectAll(); e.preventDefault(); return; }
        }
        return; // leave other ⌘ chords (⌘B/⌘I handled by the app) alone
      }

      if (this.mode === "edit" && this.edit.handleKey(e)) {
        e.preventDefault();
        return;
      }
      if (this.live.handleKey(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    this.cleanup.push(() => window.removeEventListener("keydown", onKey));
    host.style.cursor = "grab";
  }

  /** Inline text editor for renaming a node (double-click / new node). */
  private showRenameInput(id: string, current: string, screen: Point): void {
    const dark = this.scene.theme.mode === "dark";
    this.openInlineInput({
      value: current,
      placeholder: "label…",
      screen,
      style: {
        background: dark ? "#23262d" : "#ffffff",
        color: dark ? "#e6e7ea" : "#1e1e1e",
        textAlign: "center",
        zIndex: "30",
        minWidth: "80px",
      },
      onCommit: (v) => this.edit.applyRename(id, v),
    });
  }

  private showTextInput(id: string, world: Point): void {
    this.openInlineInput({
      value: "note",
      screen: this.renderer.worldToScreen(world),
      style: { background: "#fff9db", color: "#5c3d00", zIndex: "20" },
      onCommit: (v) => this.live.setText(id, v),
    });
  }

  /**
   * Shared inline text-entry field (used for rename + sticky notes). One code
   * path so the create/focus/commit/teardown lifecycle is race-free: the blur
   * listener is detached before removal and every settle is idempotent, so
   * dismissing one input to open another can't double-remove a DOM node.
   */
  private openInlineInput(opts: {
    value: string;
    screen: Point;
    style?: Record<string, string>;
    placeholder?: string;
    onCommit: (value: string) => void;
  }): void {
    this.closeInput?.(false); // dismiss any open field (no commit) before opening a new one
    const input = this.container.ownerDocument.createElement("input");
    input.value = opts.value;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    Object.assign(
      input.style,
      {
        position: "absolute",
        left: `${opts.screen.x}px`,
        top: `${opts.screen.y}px`,
        transform: "translate(-50%, -50%)",
        font: '16px "Excalifont", "Virgil", cursive',
        padding: "4px 8px",
        border: "2px solid #6741d9",
        borderRadius: "6px",
        outline: "none",
      },
      opts.style ?? {},
    );
    let settled = false;
    const settle = (commit: boolean) => {
      if (settled) return;
      settled = true;
      input.removeEventListener("blur", onBlur); // stop removal from re-triggering commit
      const value = input.value;
      if (this.closeInput === settle) this.closeInput = null;
      if (this.textInput === input) this.textInput = null;
      if (input.parentNode) input.parentNode.removeChild(input);
      if (commit) opts.onCommit(value);
    };
    const onBlur = () => settle(true);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      }
    });
    input.addEventListener("blur", onBlur);
    this.container.appendChild(input);
    this.textInput = input;
    this.closeInput = settle;
    input.focus();
    input.select();
  }
}
