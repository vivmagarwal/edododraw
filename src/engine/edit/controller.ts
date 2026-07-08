/**
 * EditController — direct manipulation of the rendered diagram (Excalidraw-like)
 * with every edit rounding back to the `.edd` source, so code stays the single
 * source of truth. Driven by the EdodoDraw facade, which routes pointer events
 * here when an edit tool is active.
 *
 * Tools: select (move/resize/rename/delete), hand (pan), rect/ellipse/diamond/
 * text (add nodes), arrow (connect nodes). Move/resize write an `overrides`
 * block; rename/style/add/delete surgically patch the source.
 */

import type { Point } from "../geometry.js";
import { rectCenter } from "../geometry.js";
import { addEdge, addNode, deleteElements, renameNode, styleNode, writeOverrides, type OverrideEntry } from "../dsl/patch.js";
import { hitTestNode } from "../scene/query.js";
import type { Scene, SceneNode } from "../scene/types.js";
import type { SvgRenderer } from "../render/svgRenderer.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HANDLE = 9; // handle box size (screen px)
const MIN = 24; // minimum node size

export type EditTool = "select" | "hand" | "rect" | "ellipse" | "diamond" | "text" | "arrow";

export interface EditState {
  tool: EditTool;
  selected: string | null;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Callbacks {
  getScene: () => Scene;
  getSource: () => string;
  onSource: (next: string) => void;
  onState: (s: EditState) => void;
  onRequestRename: (id: string, current: string, screen: Point) => void;
}

const SHAPE_FOR: Record<string, string> = { rect: "rect", ellipse: "ellipse", diamond: "diamond", text: "text" };
const ID_PREFIX: Record<string, string> = { rect: "box", ellipse: "oval", diamond: "dec", text: "txt" };

export class EditController {
  private r: SvgRenderer;
  private cb: Callbacks;
  private overlay: SVGGElement;
  private tool: EditTool = "select";
  private selected: string | null = null;

  private drag:
    | null
    | { kind: "move"; id: string; startWorld: Point; orig: { x: number; y: number } }
    | { kind: "resize"; id: string; handle: HandleId; startWorld: Point; orig: { x: number; y: number; w: number; h: number } }
    | { kind: "create"; startWorld: Point; cur: Point }
    | { kind: "connect"; from: string; cur: Point } = null;

  constructor(renderer: SvgRenderer, cb: Callbacks) {
    this.r = renderer;
    this.cb = cb;
    this.overlay = document.createElementNS(SVG_NS, "g") as SVGGElement;
    this.overlay.setAttribute("class", "edd-edit-overlay");
    renderer.screenLayer.appendChild(this.overlay);
  }

  setTool(t: EditTool): void {
    this.tool = t;
    if (t !== "select") this.selected = null;
    this.render();
    this.emit();
  }
  getTool(): EditTool {
    return this.tool;
  }
  getSelected(): string | null {
    return this.selected;
  }
  getSelectedNode(): SceneNode | null {
    const id = this.selected;
    return id ? this.cb.getScene().nodes.find((n) => n.id === id) ?? null : null;
  }
  clearSelection(): void {
    this.selected = null;
    this.render();
    this.emit();
  }

  private emit(): void {
    this.cb.onState({ tool: this.tool, selected: this.selected });
  }

  // ---- selection overlay (screen space, constant size) --------------------
  render(): void {
    this.overlay.replaceChildren();
    if (this.drag?.kind === "create") return this.drawCreatePreview();
    if (this.drag?.kind === "connect") return this.drawConnectPreview();
    const node = this.getSelectedNode();
    if (!node) return;
    const a = this.r.worldToScreen({ x: node.x, y: node.y });
    const b = this.r.worldToScreen({ x: node.x + node.w, y: node.y + node.h });
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    this.overlay.appendChild(this.rect(x - 2, y - 2, w + 4, h + 4, "#6741d9", "none", "4 3"));
    for (const [hid, p] of this.handlePoints(x, y, w, h)) {
      const hb = this.rect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE, "#6741d9", "#ffffff");
      hb.setAttribute("data-handle", hid);
      this.overlay.appendChild(hb);
    }
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
    this.overlay.appendChild(this.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), "#6741d9", "rgba(103,65,217,0.08)", "4 3"));
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
    line.setAttribute("stroke", "#6741d9");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", "5 4");
    this.overlay.appendChild(line);
  }

  // ---- hit testing --------------------------------------------------------
  private hitHandle(screen: Point): HandleId | null {
    const node = this.getSelectedNode();
    if (!node) return null;
    const a = this.r.worldToScreen({ x: node.x, y: node.y });
    const b = this.r.worldToScreen({ x: node.x + node.w, y: node.y + node.h });
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    for (const [hid, p] of this.handlePoints(x, y, w, h)) {
      if (Math.abs(screen.x - p.x) <= HANDLE && Math.abs(screen.y - p.y) <= HANDLE) return hid;
    }
    return null;
  }

  // ---- pointer ------------------------------------------------------------
  /** returns true if handled (facade should not pan). */
  pointerDown(world: Point, screen: Point): boolean {
    const scene = this.cb.getScene();
    if (this.tool === "hand") return false;

    if (this.tool === "select") {
      const handle = this.hitHandle(screen);
      if (handle && this.selected) {
        const n = this.getSelectedNode()!;
        this.drag = { kind: "resize", id: n.id, handle, startWorld: world, orig: { x: n.x, y: n.y, w: n.w, h: n.h } };
        return true;
      }
      const hit = hitTestNode(scene, world);
      if (hit) {
        this.selected = hit.id;
        this.drag = { kind: "move", id: hit.id, startWorld: world, orig: { x: hit.x, y: hit.y } };
        this.render();
        this.emit();
        return true;
      }
      this.selected = null;
      this.render();
      this.emit();
      return false; // empty -> allow pan
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

  pointerMove(world: Point): void {
    const d = this.drag;
    if (!d) return;
    const scene = this.cb.getScene();
    if (d.kind === "move") {
      const n = scene.nodes.find((x) => x.id === d.id);
      if (n) {
        n.x = d.orig.x + (world.x - d.startWorld.x);
        n.y = d.orig.y + (world.y - d.startWorld.y);
        this.r.render(scene);
        this.render();
      }
    } else if (d.kind === "resize") {
      const n = scene.nodes.find((x) => x.id === d.id);
      if (n) {
        this.applyResize(n, d.handle, d.orig, world);
        this.r.render(scene);
        this.render();
      }
    } else if (d.kind === "create" || d.kind === "connect") {
      d.cur = world;
      this.render();
    }
  }

  pointerUp(world: Point): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const scene = this.cb.getScene();

    if (d.kind === "move") {
      const n = scene.nodes.find((x) => x.id === d.id);
      // a plain click (no drag) only selects — don't write an override
      if (n && (Math.abs(n.x - d.orig.x) > 0.5 || Math.abs(n.y - d.orig.y) > 0.5)) this.commitGeometry(n, false);
    } else if (d.kind === "resize") {
      const n = scene.nodes.find((x) => x.id === d.id);
      if (n && (Math.abs(n.w - d.orig.w) > 0.5 || Math.abs(n.h - d.orig.h) > 0.5)) this.commitGeometry(n, true);
    } else if (d.kind === "create") {
      this.finishCreate(d.startWorld, world);
    } else if (d.kind === "connect") {
      const target = hitTestNode(scene, world);
      if (target && target.id !== d.from) {
        this.cb.onSource(addEdge(this.cb.getSource(), { from: d.from, to: target.id }));
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
   * Commit a move/resize. Freezes EVERY node's current position into overrides
   * (the Excalidraw-like "you've taken manual control" model), so pinning one
   * node never reshuffles the auto-layout of the others. Existing size overrides
   * are preserved; the edited node gets its new geometry.
   */
  private commitGeometry(n: SceneNode, withSize: boolean): void {
    const scene = this.cb.getScene();
    const prevSize = new Map((scene.overrides ?? []).map((o) => [o.id, o]));
    const map = new Map<string, OverrideEntry>();
    for (const node of scene.nodes) {
      const p = prevSize.get(node.id);
      map.set(node.id, { id: node.id, x: node.x, y: node.y, w: p?.w, h: p?.h });
    }
    map.set(n.id, { id: n.id, x: n.x, y: n.y, w: withSize ? n.w : prevSize.get(n.id)?.w, h: withSize ? n.h : prevSize.get(n.id)?.h });
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
    this.cb.onSource(src);
    this.selected = id;
    this.tool = "select";
    this.emit();
    // open rename immediately
    const center = this.r.worldToScreen({ x: x + w / 2, y: y + h / 2 });
    this.cb.onRequestRename(id, "", center);
  }

  private uniqueId(scene: Scene, prefix: string): string {
    const ids = new Set(scene.nodes.map((n) => n.id));
    let i = 1;
    while (ids.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }

  // ---- discrete ops -------------------------------------------------------
  requestRenameSelected(): void {
    const n = this.getSelectedNode();
    if (!n) return;
    const c = this.r.worldToScreen(rectCenter({ x: n.x, y: n.y, w: n.w, h: n.h }));
    this.cb.onRequestRename(n.id, n.label, c);
  }
  dblclick(world: Point): boolean {
    const hit = hitTestNode(this.cb.getScene(), world);
    if (hit) {
      this.selected = hit.id;
      const c = this.r.worldToScreen(rectCenter({ x: hit.x, y: hit.y, w: hit.w, h: hit.h }));
      this.cb.onRequestRename(hit.id, hit.label, c);
      return true;
    }
    return false;
  }
  applyRename(id: string, label: string): void {
    this.cb.onSource(renameNode(this.cb.getSource(), id, label));
  }
  applyStyle(id: string, style: { fill?: string; stroke?: string; shape?: string }): void {
    this.cb.onSource(styleNode(this.cb.getSource(), id, style));
  }
  deleteSelected(): void {
    if (!this.selected) return;
    const id = this.selected;
    this.selected = null;
    this.cb.onSource(deleteElements(this.cb.getSource(), [id]));
    this.emit();
  }
  handleKey(e: KeyboardEvent): boolean {
    if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
      this.deleteSelected();
      return true;
    }
    if (e.key === "Escape") {
      this.clearSelection();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.overlay.remove();
  }
}
