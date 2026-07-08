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
import { CameraController } from "../engine/camera/controller.js";
import { cameraForBBox } from "../engine/camera/fit.js";
import { compileEdd } from "../engine/dsl/index.js";
import type { Diagnostic } from "../engine/dsl/diagnostics.js";
import { downloadJSON, downloadPNG, downloadSVG, exportPNGBlob, exportSVGString } from "../engine/export.js";
import type { Point } from "../engine/geometry.js";
import { SvgRenderer } from "../engine/render/svgRenderer.js";
import { sceneBBox } from "../engine/scene/query.js";
import type { Scene } from "../engine/scene/types.js";
import { TimelinePlayer, type PlayerState } from "../engine/timeline/player.js";
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
}

export type EdodoEvent = "render" | "state" | "live" | "diagnostics";

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
  private scene: Scene;
  private source = "";
  private renderSeq = 0;
  private listeners = new Map<EdodoEvent, Set<(payload: unknown) => void>>();
  private textInput: HTMLInputElement | null = null;
  private cleanup: Array<() => void> = [];

  constructor(container: HTMLElement, options: EdodoDrawOptions = {}) {
    this.container = container;
    this.opts = {
      interactive: options.interactive ?? true,
      grid: options.grid ?? true,
      autoFit: options.autoFit ?? true,
      padding: options.padding ?? 80,
    };
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.style.overflow = "hidden";

    this.renderer = new SvgRenderer(container);
    this.renderer.mount();
    this.scene = compileEdd("scene {}").scene;
    this.controller = new CameraController(this.renderer);
    this.annotations = new AnnotationLayer(this.renderer);
    this.player = new TimelinePlayer(this.renderer, this.controller, this.annotations);
    this.live = new LiveAnnotationController(this.renderer, () => this.scene);

    this.player.onChange = (s) => this.emit("state", s);
    this.live.onChange = (s) => this.emit("live", s);
    this.live.onRequestText = (id, world) => this.showTextInput(id, world);
    if (this.opts.grid) this.controller.onFrame = (cam) => this.updateGrid(cam);
    if (this.opts.interactive) this.bindInteraction();
  }

  // ---- events -------------------------------------------------------------
  on(event: "state", cb: (s: PlayerState) => void): () => void;
  on(event: "live", cb: (s: LiveState) => void): () => void;
  on(event: "diagnostics", cb: (d: Diagnostic[]) => void): () => void;
  on(event: "render", cb: (r: RenderResult) => void): () => void;
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
    this.source = source;
    const seq = ++this.renderSeq;
    const { scene, diagnostics } = compileEdd(source);
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
    }
    if (seq !== this.renderSeq) return { scene, diagnostics: diags };

    this.scene = scene;
    this.renderer.render(scene);
    this.player.load(scene);
    this.renderer.measure();
    if (this.opts.autoFit) this.fit(false);
    else this.updateGrid(this.controller.current);
    this.live.render();

    this.emit("diagnostics", diags);
    this.emit("render", { scene, diagnostics: diags });
    return { scene, diagnostics: diags };
  }

  getScene(): Scene {
    return this.scene;
  }
  getSource(): string {
    return this.source;
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

  // ---- live annotations ---------------------------------------------------
  setTool(tool: Tool): void {
    this.live.setTool(tool);
  }
  undo(): void {
    this.live.undo();
  }
  redo(): void {
    this.live.redo();
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
  }
  destroy(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.textInput?.remove();
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
    c.style.backgroundImage = "radial-gradient(circle, #d5d9e0 1px, transparent 1px)";
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
      if (this.live.pointerDown(this.renderer.screenToWorld(local), local)) {
        host.setPointerCapture(e.pointerId);
        return;
      }
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      host.setPointerCapture(e.pointerId);
      host.style.cursor = "grabbing";
    });
    add("pointermove", (e) => {
      this.live.pointerMove(this.renderer.screenToWorld(this.localPoint(e)));
      if (!dragging) return;
      this.player.pause();
      this.controller.panByScreen(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
      this.live.render();
    });
    add("pointerup", (e) => {
      this.live.pointerUp(this.renderer.screenToWorld(this.localPoint(e)));
      dragging = false;
      try {
        host.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      host.style.cursor = this.live.getTool() === "select" ? "grab" : "crosshair";
    });

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (this.live.handleKey(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    this.cleanup.push(() => window.removeEventListener("keydown", onKey));
    host.style.cursor = "grab";
  }

  private showTextInput(id: string, world: Point): void {
    const s = this.renderer.worldToScreen(world);
    this.textInput?.remove();
    const input = this.container.ownerDocument.createElement("input");
    input.value = "note";
    Object.assign(input.style, {
      position: "absolute",
      left: `${s.x}px`,
      top: `${s.y}px`,
      transform: "translate(-50%, -50%)",
      font: '16px "Excalifont", "Virgil", cursive',
      padding: "4px 8px",
      border: "2px solid #6741d9",
      borderRadius: "6px",
      background: "#fff9db",
      color: "#5c3d00",
      outline: "none",
      zIndex: "20",
    });
    const commit = () => {
      this.live.setText(id, input.value);
      input.remove();
      this.textInput = null;
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") {
        input.remove();
        this.textInput = null;
      }
    });
    input.addEventListener("blur", commit);
    this.container.appendChild(input);
    input.focus();
    input.select();
    this.textInput = input;
  }
}
