/**
 * EditController — direct manipulation of the rendered diagram (Excalidraw-like)
 * with every edit rounding back to the `.edd` source, so code stays the single
 * source of truth. Driven by the EdodoDraw facade, which routes pointer events
 * here when an edit tool is active.
 *
 * Tools: select (marquee/move/resize/rename/delete), hand (pan), rect/ellipse/
 * diamond/text (add nodes), arrow (connect nodes). Move/resize/nudge write an
 * `overrides` block; rename/style/add/delete/duplicate surgically patch source.
 *
 * Selection is a SET of node ids (shift-click toggles, drag-on-empty marquees),
 * so several nodes move, restyle, duplicate and delete together. Resize handles
 * appear only for a single selection.
 */

import type { Point } from "../geometry.js";
import { rectCenter } from "../geometry.js";
import { addEdge, addNode, deleteEdge, deleteElements, reconnectEdge, renameNode, setEdgeLabel, styleNode, writeOverrides, type OverrideEntry } from "../dsl/patch.js";
import { hitTestEdge, hitTestNode } from "../scene/query.js";
import type { Scene, SceneEdge, SceneNode } from "../scene/types.js";
import type { SvgRenderer } from "../render/svgRenderer.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HANDLE = 9; // handle box size (screen px)
const EDGE_TOL = 9; // edge click tolerance (screen px)
const MIN = 24; // minimum node size
const ACCENT = "#6741d9";

export type EditTool = "select" | "hand" | "rect" | "ellipse" | "diamond" | "text" | "arrow";

export interface EditState {
  tool: EditTool;
  /** Selected node ids (ordered; the last one is the "primary"). */
  selected: string[];
  /** Selected edge id (mutually exclusive with node selection). */
  selectedEdge?: string | null;
  /** History availability — filled in by the facade, not the controller. */
  canUndo?: boolean;
  canRedo?: boolean;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** A node snapshot used by copy/paste + duplicate. */
interface NodeSpec {
  shape: string;
  label: string;
  fill: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Callbacks {
  getScene: () => Scene;
  getSource: () => string;
  onSource: (next: string) => void;
  onState: (s: EditState) => void;
  onRequestRename: (id: string, current: string, screen: Point) => void;
  /** Hover/drag cursor feedback (facade sets it on the canvas host). */
  onCursor?: (cursor: string) => void;
}

const SHAPE_FOR: Record<string, string> = { rect: "rect", ellipse: "ellipse", diamond: "diamond", text: "text" };
const ID_PREFIX: Record<string, string> = { rect: "box", ellipse: "oval", diamond: "dec", text: "txt" };
const RESIZE_CURSOR: Record<HandleId, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
};

export class EditController {
  private r: SvgRenderer;
  private cb: Callbacks;
  private overlay: SVGGElement;
  private tool: EditTool = "select";
  private selected: string[] = [];
  private selectedEdge: string | null = null;
  private renamingEdge: { from: string; to: string } | null = null;
  private hoverId: string | null = null;
  private clipboard: NodeSpec[] = [];
  private pasteSeq = 0;

  private drag:
    | null
    | { kind: "move"; ids: string[]; hitId: string; startWorld: Point; orig: Map<string, { x: number; y: number }>; moved: boolean }
    | { kind: "resize"; id: string; handle: HandleId; startWorld: Point; orig: { x: number; y: number; w: number; h: number } }
    | { kind: "create"; startWorld: Point; cur: Point }
    | { kind: "connect"; from: string; cur: Point }
    | { kind: "reconnect"; edgeId: string; end: "from" | "to"; from: string; to: string; anchor: Point; cur: Point }
    | { kind: "marquee"; startWorld: Point; cur: Point; base: string[]; moved: boolean } = null;

  constructor(renderer: SvgRenderer, cb: Callbacks) {
    this.r = renderer;
    this.cb = cb;
    this.overlay = document.createElementNS(SVG_NS, "g") as SVGGElement;
    this.overlay.setAttribute("class", "edd-edit-overlay");
    this.overlay.style.pointerEvents = "none"; // never swallow canvas pointer events
    renderer.screenLayer.appendChild(this.overlay);
  }

  setTool(t: EditTool): void {
    this.tool = t;
    if (t !== "select") {
      this.selected = [];
      this.selectedEdge = null;
    }
    this.hoverId = null;
    this.render();
    this.emit();
  }
  getTool(): EditTool {
    return this.tool;
  }
  /** All selected ids (a copy). */
  getSelected(): string[] {
    return this.selected.slice();
  }
  /** The primary (last-selected) node, used for the inspector + rename. */
  getSelectedNode(): SceneNode | null {
    const id = this.selected[this.selected.length - 1];
    return id ? this.cb.getScene().nodes.find((n) => n.id === id) ?? null : null;
  }
  private selectedNodes(): SceneNode[] {
    const scene = this.cb.getScene();
    return this.selected.map((id) => scene.nodes.find((n) => n.id === id)).filter((n): n is SceneNode => !!n);
  }
  getSelectedEdge(): string | null {
    return this.selectedEdge;
  }
  private selectedEdgeObj(): SceneEdge | null {
    if (!this.selectedEdge) return null;
    return this.cb.getScene().edges.find((e) => e.id === this.selectedEdge) ?? null;
  }
  clearSelection(): void {
    if (!this.selected.length && !this.selectedEdge && !this.hoverId) return;
    this.selected = [];
    this.selectedEdge = null;
    this.hoverId = null;
    this.render();
    this.emit();
  }
  selectAll(): void {
    if (this.tool !== "select") return;
    this.selected = this.cb.getScene().nodes.map((n) => n.id);
    this.render();
    this.emit();
  }

  state(): EditState {
    return { tool: this.tool, selected: this.selected.slice(), selectedEdge: this.selectedEdge };
  }
  private emit(): void {
    this.cb.onState(this.state());
  }
  private cursor(c: string): void {
    this.cb.onCursor?.(c);
  }

  // ---- selection overlay (screen space, constant size) --------------------
  render(): void {
    this.overlay.replaceChildren();
    const d = this.drag;
    if (d?.kind === "create") return this.drawCreatePreview();
    if (d?.kind === "connect") return this.drawConnectPreview();
    if (d?.kind === "reconnect") return this.drawReconnectPreview(d);
    if (d?.kind === "marquee") this.drawMarquee(d);

    // Hover affordance: faint outline on the node under the cursor (when idle).
    if (!d && this.hoverId && !this.selected.includes(this.hoverId)) {
      const hn = this.cb.getScene().nodes.find((n) => n.id === this.hoverId);
      if (hn) this.overlay.appendChild(this.boxFor(hn, ACCENT, "none", undefined, 0.55));
    }

    // Selected edge: a thick translucent trace + two round endpoint handles.
    const edge = this.selectedEdgeObj();
    if (edge) this.drawEdgeSelection(edge);

    const nodes = this.selectedNodes();
    for (const node of nodes) this.overlay.appendChild(this.boxFor(node, ACCENT, "none", "4 3"));
    // Resize handles only make sense for a single node.
    if (nodes.length === 1) {
      const { x, y, w, h } = this.screenRect(nodes[0]);
      for (const [hid, p] of this.handlePoints(x, y, w, h)) {
        const hb = this.rect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE, ACCENT, "#ffffff");
        hb.setAttribute("data-handle", hid);
        this.overlay.appendChild(hb);
      }
    }
  }

  private edgeScreenPoints(edge: SceneEdge): Point[] {
    return (edge.points ?? []).map((p) => this.r.worldToScreen(p));
  }
  private drawEdgeSelection(edge: SceneEdge): void {
    const pts = this.edgeScreenPoints(edge);
    if (pts.length < 2) return;
    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", pts.map((p) => `${p.x},${p.y}`).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", ACCENT);
    line.setAttribute("stroke-width", "6");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("opacity", "0.28");
    this.overlay.appendChild(line);
    for (const end of ["from", "to"] as const) {
      const p = end === "from" ? pts[0] : pts[pts.length - 1];
      const c = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", String(HANDLE / 2 + 1));
      c.setAttribute("stroke", ACCENT);
      c.setAttribute("stroke-width", "1.5");
      c.setAttribute("fill", "#ffffff");
      c.setAttribute("data-edge-handle", end);
      this.overlay.appendChild(c);
    }
  }
  private drawReconnectPreview(d: { anchor: Point; cur: Point }): void {
    const a = this.r.worldToScreen(d.anchor);
    const b = this.r.worldToScreen(d.cur);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", ACCENT);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", "5 4");
    this.overlay.appendChild(line);
    const target = hitTestNode(this.cb.getScene(), d.cur);
    if (target) this.overlay.appendChild(this.boxFor(target, ACCENT, "rgba(103,65,217,0.10)", "4 3"));
  }

  private screenRect(node: SceneNode): { x: number; y: number; w: number; h: number } {
    const a = this.r.worldToScreen({ x: node.x, y: node.y });
    const b = this.r.worldToScreen({ x: node.x + node.w, y: node.y + node.h });
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  private boxFor(node: SceneNode, stroke: string, fill: string, dash?: string, opacity?: number): SVGRectElement {
    const { x, y, w, h } = this.screenRect(node);
    const r = this.rect(x - 2, y - 2, w + 4, h + 4, stroke, fill, dash);
    if (opacity != null) r.setAttribute("opacity", String(opacity));
    return r;
  }

  private handlePoints(x: number, y: number, w: number, h: number): [HandleId, Point][] {
    return [
      ["nw", { x, y }],
      ["n", { x: x + w / 2, y }],
      ["ne", { x: x + w, y }],
      ["e", { x: x + w, y: y + h / 2 }],
      ["se", { x: x + w, y: y + h }],
      ["s", { x: x + w / 2, y: y + h }],
      ["sw", { x, y: y + h }],
      ["w", { x, y: y + h / 2 }],
    ];
  }

  private rect(x: number, y: number, w: number, h: number, stroke: string, fill: string, dash?: string): SVGRectElement {
    const r = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
    r.setAttribute("x", String(x));
    r.setAttribute("y", String(y));
    r.setAttribute("width", String(Math.max(0, w)));
    r.setAttribute("height", String(Math.max(0, h)));
    r.setAttribute("stroke", stroke);
    r.setAttribute("stroke-width", "1.5");
    r.setAttribute("fill", fill);
    if (dash) r.setAttribute("stroke-dasharray", dash);
    return r;
  }

  private drawCreatePreview(): void {
    if (this.drag?.kind !== "create") return;
    const a = this.r.worldToScreen(this.drag.startWorld);
    const b = this.r.worldToScreen(this.drag.cur);
    this.overlay.appendChild(this.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), ACCENT, "rgba(103,65,217,0.08)", "4 3"));
  }
  private drawMarquee(d: { startWorld: Point; cur: Point }): void {
    const a = this.r.worldToScreen(d.startWorld);
    const b = this.r.worldToScreen(d.cur);
    this.overlay.appendChild(this.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), ACCENT, "rgba(103,65,217,0.10)", "4 3"));
  }
  private drawConnectPreview(): void {
    const d = this.drag;
    if (!d || d.kind !== "connect") return;
    const scene = this.cb.getScene();
    const fromNode = scene.nodes.find((n) => n.id === d.from);
    if (!fromNode) return;
    const a = this.r.worldToScreen(rectCenter({ x: fromNode.x, y: fromNode.y, w: fromNode.w, h: fromNode.h }));
    const b = this.r.worldToScreen(d.cur);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", ACCENT);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", "5 4");
    this.overlay.appendChild(line);
  }

  // ---- hit testing --------------------------------------------------------
  /** Which end (if any) of the selected edge is under the cursor. */
  private hitEdgeHandle(screen: Point): "from" | "to" | null {
    const edge = this.selectedEdgeObj();
    const pts = edge ? this.edgeScreenPoints(edge) : [];
    if (pts.length < 2) return null;
    const near = (p: Point) => Math.abs(screen.x - p.x) <= HANDLE && Math.abs(screen.y - p.y) <= HANDLE;
    if (near(pts[0])) return "from";
    if (near(pts[pts.length - 1])) return "to";
    return null;
  }
  private worldTol(px: number): number {
    return px / (this.r.getCamera().zoom || 1);
  }
  private hitHandle(screen: Point): HandleId | null {
    if (this.selected.length !== 1) return null;
    const node = this.getSelectedNode();
    if (!node) return null;
    const { x, y, w, h } = this.screenRect(node);
    for (const [hid, p] of this.handlePoints(x, y, w, h)) {
      if (Math.abs(screen.x - p.x) <= HANDLE && Math.abs(screen.y - p.y) <= HANDLE) return hid;
    }
    return null;
  }

  // ---- pointer ------------------------------------------------------------
  /** returns true if handled (facade should not pan). */
  pointerDown(world: Point, screen: Point, mods: { shift?: boolean } = {}): boolean {
    const scene = this.cb.getScene();
    if (this.tool === "hand") return false;

    if (this.tool === "select") {
      if (!mods.shift) {
        const handle = this.hitHandle(screen);
        if (handle) {
          const n = this.getSelectedNode()!;
          this.drag = { kind: "resize", id: n.id, handle, startWorld: world, orig: { x: n.x, y: n.y, w: n.w, h: n.h } };
          return true;
        }
        // grabbing an endpoint of the selected edge starts a reconnect
        const end = this.hitEdgeHandle(screen);
        const edge = this.selectedEdgeObj();
        if (end && edge && edge.from.node && edge.to.node) {
          const pts = edge.points ?? [];
          const anchor = end === "from" ? pts[pts.length - 1] : pts[0]; // the *fixed* end
          this.drag = { kind: "reconnect", edgeId: edge.id, end, from: edge.from.node, to: edge.to.node, anchor: anchor ?? world, cur: world };
          return true;
        }
      }
      const hit = hitTestNode(scene, world);
      if (hit) {
        this.selectedEdge = null;
        if (mods.shift) {
          // toggle membership; no drag on a shift-click
          this.selected = this.selected.includes(hit.id) ? this.selected.filter((id) => id !== hit.id) : [...this.selected, hit.id];
          this.hoverId = null;
          this.render();
          this.emit();
          return true;
        }
        if (!this.selected.includes(hit.id)) {
          this.selected = [hit.id];
          this.emit();
        }
        // drag the whole current selection together
        const orig = new Map<string, { x: number; y: number }>();
        for (const n of this.selectedNodes()) orig.set(n.id, { x: n.x, y: n.y });
        this.drag = { kind: "move", ids: [...orig.keys()], hitId: hit.id, startWorld: world, orig, moved: false };
        this.hoverId = null;
        this.render();
        return true;
      }
      // no node -> try an edge (unless shift-extending a node marquee)
      if (!mods.shift) {
        const edge = hitTestEdge(scene, world, this.worldTol(EDGE_TOL));
        if (edge) {
          this.selected = [];
          this.selectedEdge = edge.id;
          this.hoverId = null;
          this.render();
          this.emit();
          return true;
        }
      }
      // empty space -> rubber-band marquee (shift keeps the current selection)
      this.selectedEdge = null;
      this.drag = { kind: "marquee", startWorld: world, cur: world, base: mods.shift ? this.selected.slice() : [], moved: false };
      return true;
    }

    if (this.tool === "arrow") {
      const hit = hitTestNode(scene, world);
      if (hit) {
        this.drag = { kind: "connect", from: hit.id, cur: world };
        return true;
      }
      return true;
    }

    // create tools
    this.drag = { kind: "create", startWorld: world, cur: world };
    return true;
  }

  pointerMove(world: Point, screen?: Point): void {
    const d = this.drag;
    if (!d) return this.hover(world, screen);
    const scene = this.cb.getScene();
    if (d.kind === "move") {
      const dx = world.x - d.startWorld.x;
      const dy = world.y - d.startWorld.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) d.moved = true;
      for (const id of d.ids) {
        const n = scene.nodes.find((x) => x.id === id);
        const o = d.orig.get(id);
        if (n && o) {
          n.x = o.x + dx;
          n.y = o.y + dy;
        }
      }
      this.r.render(scene);
      this.render();
    } else if (d.kind === "resize") {
      const n = scene.nodes.find((x) => x.id === d.id);
      if (n) {
        this.applyResize(n, d.handle, d.orig, world);
        this.r.render(scene);
        this.render();
      }
    } else if (d.kind === "marquee") {
      d.cur = world;
      if (Math.abs(world.x - d.startWorld.x) > 3 || Math.abs(world.y - d.startWorld.y) > 3) d.moved = true;
      this.selected = this.marqueeSelection(d);
      this.render();
    } else {
      d.cur = world;
      this.render();
    }
  }

  /** Nearest routed edge to the point, or null (screen-tolerance aware). */
  private edgeAt(world: Point): SceneEdge | null {
    return hitTestEdge(this.cb.getScene(), world, this.worldTol(EDGE_TOL));
  }

  /** Idle hover: set the cursor + a faint outline so the canvas feels alive. */
  private hover(world: Point, screen?: Point): void {
    if (this.tool !== "select") return; // create/arrow keep the facade's crosshair
    let cursor = "default";
    let hover: string | null = null;
    if (screen) {
      const handle = this.hitHandle(screen);
      if (handle) cursor = RESIZE_CURSOR[handle];
      else if (this.hitEdgeHandle(screen)) cursor = "move"; // edge endpoint
    }
    if (cursor === "default") {
      const hit = hitTestNode(this.cb.getScene(), world);
      if (hit) {
        cursor = "move";
        hover = this.selected.includes(hit.id) ? null : hit.id;
      } else if (this.edgeAt(world)) {
        cursor = "pointer"; // a clickable edge
      }
    }
    this.cursor(cursor);
    if (hover !== this.hoverId) {
      this.hoverId = hover;
      this.render();
    }
  }

  private marqueeSelection(d: { startWorld: Point; cur: Point; base: string[] }): string[] {
    const x0 = Math.min(d.startWorld.x, d.cur.x);
    const y0 = Math.min(d.startWorld.y, d.cur.y);
    const x1 = Math.max(d.startWorld.x, d.cur.x);
    const y1 = Math.max(d.startWorld.y, d.cur.y);
    const inside = this.cb.getScene().nodes
      .filter((n) => n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0)
      .map((n) => n.id);
    return d.base.length ? [...new Set([...d.base, ...inside])] : inside;
  }

  pointerUp(world: Point): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const scene = this.cb.getScene();

    if (d.kind === "move") {
      if (d.moved) this.commitPositions();
      else if (d.ids.length > 1) {
        // a plain click inside a multi-selection collapses to that one node
        this.selected = [d.hitId];
        this.render();
        this.emit();
      } else this.render();
    } else if (d.kind === "resize") {
      const n = scene.nodes.find((x) => x.id === d.id);
      if (n && (Math.abs(n.w - d.orig.w) > 0.5 || Math.abs(n.h - d.orig.h) > 0.5)) this.commitPositions(n.id, { w: n.w, h: n.h });
      else this.render();
    } else if (d.kind === "marquee") {
      // A click on empty space (no drag) clears the selection.
      if (!d.moved && !d.base.length) this.selected = [];
      this.render();
      this.emit();
    } else if (d.kind === "create") {
      this.finishCreate(d.startWorld, world);
    } else if (d.kind === "connect") {
      const target = hitTestNode(scene, world);
      if (target && target.id !== d.from) {
        this.cb.onSource(addEdge(this.cb.getSource(), { from: d.from, to: target.id }));
      } else {
        this.render();
      }
    } else if (d.kind === "reconnect") {
      const target = hitTestNode(scene, world);
      const otherEnd = d.end === "from" ? d.to : d.from;
      if (target && target.id !== (d.end === "from" ? d.from : d.to) && target.id !== otherEnd) {
        this.selectedEdge = null; // id changes after the patch; re-select by clicking
        this.cb.onSource(reconnectEdge(this.cb.getSource(), d.from, d.to, d.end, target.id));
        this.emit();
      } else {
        this.render();
      }
    }
  }

  private applyResize(n: SceneNode, handle: HandleId, o: { x: number; y: number; w: number; h: number }, world: Point): void {
    let { x, y, w, h } = o;
    const right = o.x + o.w;
    const bottom = o.y + o.h;
    if (handle.includes("e")) w = Math.max(MIN, world.x - o.x);
    if (handle.includes("s")) h = Math.max(MIN, world.y - o.y);
    if (handle.includes("w")) {
      x = Math.min(world.x, right - MIN);
      w = right - x;
    }
    if (handle.includes("n")) {
      y = Math.min(world.y, bottom - MIN);
      h = bottom - y;
    }
    n.x = x;
    n.y = y;
    n.w = w;
    n.h = h;
  }

  /**
   * Commit the current node geometry. Freezes EVERY node's position into
   * overrides (the Excalidraw-like "you've taken manual control" model), so
   * moving some nodes never reshuffles the auto-layout of the rest. Existing
   * size overrides are preserved; pass `sizeId`/`size` for a resized node.
   */
  private commitPositions(sizeId?: string, size?: { w: number; h: number }): void {
    const scene = this.cb.getScene();
    const prev = new Map((scene.overrides ?? []).map((o) => [o.id, o]));
    const map = new Map<string, OverrideEntry>();
    for (const node of scene.nodes) {
      const p = prev.get(node.id);
      map.set(node.id, { id: node.id, x: node.x, y: node.y, w: p?.w, h: p?.h });
    }
    if (sizeId && size) {
      const e = map.get(sizeId);
      if (e) {
        e.w = size.w;
        e.h = size.h;
      }
    }
    this.cb.onSource(writeOverrides(this.cb.getSource(), [...map.values()]));
  }

  private finishCreate(a: Point, b: Point): void {
    const scene = this.cb.getScene();
    const shape = SHAPE_FOR[this.tool] ?? "rect";
    const dragW = Math.abs(b.x - a.x);
    const dragH = Math.abs(b.y - a.y);
    const w = dragW < 8 ? 140 : dragW;
    const h = dragH < 8 ? 70 : dragH;
    const x = dragW < 8 ? a.x - w / 2 : Math.min(a.x, b.x);
    const y = dragH < 8 ? a.y - h / 2 : Math.min(a.y, b.y);
    const id = this.uniqueId(scene, ID_PREFIX[this.tool] ?? "box");
    let src = addNode(this.cb.getSource(), { id, shape, label: "" });
    const map = new Map<string, OverrideEntry>((scene.overrides ?? []).map((o) => [o.id, { ...o }]));
    map.set(id, { id, x, y, w, h });
    src = writeOverrides(src, [...map.values()]);
    this.selected = [id];
    this.tool = "select";
    this.cb.onSource(src);
    this.emit();
    // open rename immediately
    const center = this.r.worldToScreen({ x: x + w / 2, y: y + h / 2 });
    this.cb.onRequestRename(id, "", center);
  }

  private uniqueId(scene: Scene, prefix: string): string {
    return this.freshId(new Set(scene.nodes.map((n) => n.id)), prefix);
  }
  private freshId(used: Set<string>, prefix: string): string {
    let i = 1;
    while (used.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }

  // ---- discrete ops -------------------------------------------------------
  requestRenameSelected(): void {
    const edge = this.selectedEdgeObj();
    if (edge && edge.from.node && edge.to.node) {
      this.renamingEdge = { from: edge.from.node, to: edge.to.node };
      const pts = edge.points ?? [];
      const mid = pts.length ? pts[Math.floor(pts.length / 2)] : { x: 0, y: 0 };
      this.cb.onRequestRename(edge.id, edge.label, this.r.worldToScreen(mid));
      return;
    }
    const n = this.getSelectedNode();
    if (!n) return;
    const c = this.r.worldToScreen(rectCenter({ x: n.x, y: n.y, w: n.w, h: n.h }));
    this.cb.onRequestRename(n.id, n.label, c);
  }
  dblclick(world: Point): boolean {
    const hit = hitTestNode(this.cb.getScene(), world);
    if (hit) {
      this.renamingEdge = null;
      this.selected = [hit.id];
      this.selectedEdge = null;
      this.emit();
      const c = this.r.worldToScreen(rectCenter({ x: hit.x, y: hit.y, w: hit.w, h: hit.h }));
      this.cb.onRequestRename(hit.id, hit.label, c);
      return true;
    }
    // double-click an edge -> edit its label
    const edge = this.edgeAt(world);
    if (edge && edge.from.node && edge.to.node) {
      this.selected = [];
      this.selectedEdge = edge.id;
      this.renamingEdge = { from: edge.from.node, to: edge.to.node };
      this.emit();
      const pts = edge.points ?? [];
      const mid = pts.length ? pts[Math.floor(pts.length / 2)] : world;
      this.cb.onRequestRename(edge.id, edge.label, this.r.worldToScreen(mid));
      return true;
    }
    return false;
  }
  applyRename(id: string, label: string): void {
    const re = this.renamingEdge;
    this.renamingEdge = null;
    if (re) {
      this.cb.onSource(setEdgeLabel(this.cb.getSource(), re.from, re.to, label));
      return;
    }
    this.cb.onSource(renameNode(this.cb.getSource(), id, label));
  }
  /** Style one node. */
  applyStyle(id: string, style: { fill?: string; stroke?: string; shape?: string }): void {
    this.cb.onSource(styleNode(this.cb.getSource(), id, style));
  }
  /** Style several nodes in one source patch (a single undo step). */
  applyStyleMany(ids: string[], style: { fill?: string; stroke?: string; shape?: string }): void {
    if (!ids.length) return;
    let src = this.cb.getSource();
    for (const id of ids) src = styleNode(src, id, style);
    this.cb.onSource(src);
  }
  deleteSelected(): void {
    const edge = this.selectedEdgeObj();
    if (edge && edge.from.node && edge.to.node) {
      this.selectedEdge = null;
      this.hoverId = null;
      this.cb.onSource(deleteEdge(this.cb.getSource(), edge.from.node, edge.to.node));
      this.emit();
      return;
    }
    if (!this.selected.length) return;
    const ids = this.selected.slice();
    this.selected = [];
    this.hoverId = null;
    this.cb.onSource(deleteElements(this.cb.getSource(), ids));
    this.emit();
  }

  private specOf(n: SceneNode): NodeSpec {
    return { shape: n.shape, label: n.label, fill: n.style.fill ?? null, x: n.x, y: n.y, w: n.w, h: n.h };
  }
  /** Clone the selection in place with a small offset (Cmd/Ctrl-D). */
  duplicateSelected(): boolean {
    const specs = this.selectedNodes().map((n) => this.specOf(n));
    if (!specs.length) return false;
    this.cloneSpecs(specs, 16, 16);
    return true;
  }
  /** Copy the selection into the in-memory clipboard (Cmd/Ctrl-C). */
  copySelected(): boolean {
    const specs = this.selectedNodes().map((n) => this.specOf(n));
    if (!specs.length) return false;
    this.clipboard = specs;
    this.pasteSeq = 0;
    return true;
  }
  /** Paste the clipboard (Cmd/Ctrl-V), offset so copies don't stack exactly. */
  paste(): boolean {
    if (!this.clipboard.length) return false;
    this.pasteSeq += 1;
    const off = 24 * this.pasteSeq;
    this.cloneSpecs(this.clipboard, off, off);
    return true;
  }

  private cloneSpecs(specs: NodeSpec[], dx: number, dy: number): void {
    const scene = this.cb.getScene();
    let src = this.cb.getSource();
    const used = new Set(scene.nodes.map((n) => n.id));
    const overrides = new Map<string, OverrideEntry>((scene.overrides ?? []).map((o) => [o.id, { ...o }]));
    const newIds: string[] = [];
    for (const s of specs) {
      const id = this.freshId(used, "copy");
      used.add(id);
      src = addNode(src, { id, shape: s.shape, label: s.label });
      if (s.fill != null) src = styleNode(src, id, { fill: s.fill });
      overrides.set(id, { id, x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
      newIds.push(id);
    }
    src = writeOverrides(src, [...overrides.values()]);
    this.selected = newIds; // select the fresh copies
    this.cb.onSource(src);
    this.emit();
  }

  handleKey(e: KeyboardEvent): boolean {
    if ((e.key === "Delete" || e.key === "Backspace") && (this.selected.length || this.selectedEdge)) {
      this.deleteSelected();
      return true;
    }
    if (e.key === "Escape") {
      this.clearSelection();
      return true;
    }
    if (this.selected.length && e.key.startsWith("Arrow")) {
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (dx === 0 && dy === 0) return false;
      const scene = this.cb.getScene();
      for (const id of this.selected) {
        const n = scene.nodes.find((x) => x.id === id);
        if (n) {
          n.x += dx;
          n.y += dy;
        }
      }
      this.r.render(scene);
      this.render();
      this.commitPositions();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.overlay.remove();
  }
}
