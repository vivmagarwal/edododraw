/**
 * LiveAnnotationController — real-time interactive annotation editing.
 *
 * Tools:
 *   select     — pick / move / delete existing live annotations
 *   highlight  — click an element to marker-highlight it
 *   underline  — click an element to underline it
 *   box        — click an element to draw a box around it
 *   circle     — click an element to ring it
 *   arrow      — drag to draw a pointer arrow (endpoints snap to elements)
 *   text       — click to drop a sticky note (then type)
 *
 * Live annotations live in the renderer's 'live' world layer, so they track the
 * camera and their anchored elements automatically. Everything is undoable and
 * serializable back to EDodoDraw code (commit-to-code).
 */

import type { Point } from "../geometry.js";
import { bboxCenter } from "../geometry.js";
import { elementBBox, hitTestNode } from "../scene/query.js";
import type { Annotation, Scene } from "../scene/types.js";
import type { SvgRenderer } from "../render/svgRenderer.js";
import { AnnotationLayer } from "./layer.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export type Tool = "select" | "highlight" | "underline" | "box" | "circle" | "arrow" | "text";

export interface LiveState {
  tool: Tool;
  count: number;
  canUndo: boolean;
  canRedo: boolean;
  selected: string | null;
}

const DEFAULTS: Record<string, { kind: string; color: string; options: Record<string, unknown> }> = {
  highlight: { kind: "highlight", color: "yellow", options: {} },
  underline: { kind: "underline", color: "#1971c2", options: { style: "solid" } },
  box: { kind: "box", color: "#1971c2", options: {} },
  circle: { kind: "circle-mark", color: "#e8590c", options: {} },
};

export class LiveAnnotationController {
  private renderer: SvgRenderer;
  private getScene: () => Scene;
  private layer: AnnotationLayer;
  private live: Annotation[] = [];
  private tool: Tool = "select";
  private selected: string | null = null;
  private draft: Annotation | null = null;
  private undoStack: Annotation[][] = [];
  private redoStack: Annotation[][] = [];
  private seq = 0;
  private dragging: { id: string; start: Point; orig: Annotation } | null = null;

  onChange?: (s: LiveState) => void;
  onRequestText?: (id: string, world: Point) => void;

  constructor(renderer: SvgRenderer, getScene: () => Scene) {
    this.renderer = renderer;
    this.getScene = getScene;
    this.layer = new AnnotationLayer(renderer, "live");
  }

  // ---- state --------------------------------------------------------------
  private emit(): void {
    this.onChange?.({
      tool: this.tool,
      count: this.live.length,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      selected: this.selected,
    });
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.draft = null;
    if (t !== "select") this.selected = null;
    this.render();
    this.emit();
  }

  getTool(): Tool {
    return this.tool;
  }

  getAnnotations(): Annotation[] {
    return this.live;
  }

  private snapshot(): void {
    this.undoStack.push(structuredClone(this.live));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  private id(kind: string): string {
    return `live_${kind}_${this.seq++}`;
  }

  // ---- render -------------------------------------------------------------
  render(): void {
    const scene = this.getScene();
    const items = this.draft ? [...this.live, this.draft] : this.live;
    this.layer.render(scene, items, false);
    this.drawSelection();
  }

  private drawSelection(): void {
    if (!this.selected) return;
    const an = this.live.find((a) => a.id === this.selected);
    if (!an) return;
    const box = this.anchorBBox(an);
    if (!box) return;
    const root = this.renderer.getLayer("live");
    const rect = document.createElementNS(SVG_NS, "rect");
    const pad = 10;
    rect.setAttribute("x", String(box.minX - pad));
    rect.setAttribute("y", String(box.minY - pad));
    rect.setAttribute("width", String(box.maxX - box.minX + pad * 2));
    rect.setAttribute("height", String(box.maxY - box.minY + pad * 2));
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "#6741d9");
    rect.setAttribute("stroke-width", "1.5");
    rect.setAttribute("stroke-dasharray", "5 4");
    rect.setAttribute("rx", "6");
    root.appendChild(rect);
  }

  private anchorBBox(an: Annotation): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const scene = this.getScene();
    if (an.target.ref) return elementBBox(scene, an.target.ref) ?? null;
    if (an.target.point) {
      const p = an.target.point;
      const r = an.kind === "sticky" || an.kind === "text" ? 50 : 20;
      return { minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r };
    }
    return null;
  }

  // ---- pointer ------------------------------------------------------------
  /** returns true if the controller handled the event (skip camera pan). */
  pointerDown(world: Point, _screen: Point): boolean {
    const scene = this.getScene();

    if (this.tool === "select") {
      const hit = this.hitLive(world);
      this.selected = hit?.id ?? null;
      if (hit) {
        this.dragging = { id: hit.id, start: world, orig: structuredClone(hit) };
        this.render();
        this.emit();
        return true;
      }
      this.render();
      this.emit();
      return false; // let camera pan
    }

    if (this.tool === "arrow") {
      const node = hitTestNode(scene, world);
      this.draft = {
        id: this.id("connector"),
        kind: "connector",
        target: { ref: null, point: world },
        color: "#1971c2",
        options: node ? { fromRef: node.id } : { fromPoint: world },
        z: 0,
        origin: "live",
      };
      this.render();
      return true;
    }

    if (this.tool === "text") {
      const an: Annotation = {
        id: this.id("sticky"),
        kind: "sticky",
        target: { ref: null, point: world },
        text: "note",
        color: "#e8590c",
        options: {},
        z: 0,
        origin: "live",
      };
      this.snapshot();
      this.live.push(an);
      this.selected = an.id;
      this.render();
      this.emit();
      this.onRequestText?.(an.id, world);
      return true;
    }

    // element-anchored tools
    const def = DEFAULTS[this.tool];
    if (def) {
      const node = hitTestNode(scene, world);
      if (!node) return false; // clicked empty space -> allow pan
      const an: Annotation = {
        id: this.id(def.kind),
        kind: def.kind,
        target: { ref: node.id },
        color: def.color,
        options: { ...def.options },
        z: 0,
        origin: "live",
      };
      this.snapshot();
      this.live.push(an);
      this.selected = an.id;
      this.render();
      this.emit();
      return true;
    }
    return false;
  }

  pointerMove(world: Point): void {
    if (this.draft) {
      const scene = this.getScene();
      const node = hitTestNode(scene, world);
      if (node) {
        this.draft.target = { ref: node.id };
      } else {
        this.draft.target = { ref: null, point: world };
      }
      this.render();
      return;
    }
    if (this.dragging) {
      const an = this.live.find((a) => a.id === this.dragging!.id);
      if (an && an.target.point) {
        const dx = world.x - this.dragging.start.x;
        const dy = world.y - this.dragging.start.y;
        const o = this.dragging.orig.target.point!;
        an.target.point = { x: o.x + dx, y: o.y + dy };
        if (an.options.fromPoint) {
          const fo = this.dragging.orig.options.fromPoint as Point;
          an.options.fromPoint = { x: fo.x + dx, y: fo.y + dy };
        }
        this.render();
      }
    }
  }

  pointerUp(world: Point): void {
    if (this.draft) {
      const scene = this.getScene();
      const node = hitTestNode(scene, world);
      if (node) this.draft.target = { ref: node.id };
      else this.draft.target = { ref: null, point: world };
      this.snapshot();
      this.live.push(this.draft);
      this.selected = this.draft.id;
      this.draft = null;
      this.render();
      this.emit();
      return;
    }
    if (this.dragging) {
      // commit move as one undo step
      const before = this.dragging.orig;
      const cur = this.live.find((a) => a.id === this.dragging!.id);
      if (cur && JSON.stringify(before.target) !== JSON.stringify(cur.target)) {
        this.undoStack.push(this.liveWith(this.dragging.id, before));
        this.redoStack = [];
      }
      this.dragging = null;
      this.emit();
    }
  }

  private liveWith(id: string, replacement: Annotation): Annotation[] {
    return this.live.map((a) => (a.id === id ? structuredClone(replacement) : structuredClone(a)));
  }

  private hitLive(world: Point): Annotation | null {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const an = this.live[i];
      const box = this.anchorBBox(an);
      if (box && world.x >= box.minX - 12 && world.x <= box.maxX + 12 && world.y >= box.minY - 12 && world.y <= box.maxY + 12) {
        return an;
      }
    }
    return null;
  }

  // ---- keyboard / edit ----------------------------------------------------
  handleKey(e: KeyboardEvent): boolean {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "z") {
      if (e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
      this.deleteSelected();
      return true;
    }
    return false;
  }

  setText(id: string, text: string): void {
    const an = this.live.find((a) => a.id === id);
    if (!an) return;
    an.text = text;
    this.render();
  }

  deleteSelected(): void {
    if (!this.selected) return;
    this.snapshot();
    this.live = this.live.filter((a) => a.id !== this.selected);
    this.selected = null;
    this.render();
    this.emit();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(structuredClone(this.live));
    this.live = prev;
    this.selected = null;
    this.render();
    this.emit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(structuredClone(this.live));
    this.live = next;
    this.render();
    this.emit();
  }

  clear(): void {
    if (!this.live.length) return;
    this.snapshot();
    this.live = [];
    this.selected = null;
    this.render();
    this.emit();
  }

  // ---- serialization ------------------------------------------------------
  /** Serialize live annotations back into an EDodoDraw `annotate { … }` block. */
  commitToCode(): string {
    if (!this.live.length) return "";
    const lines: string[] = ['annotate "live" {'];
    const scene = this.getScene();
    for (const an of this.live) {
      lines.push("  " + this.serialize(an, scene));
    }
    lines.push("}");
    return lines.join("\n");
  }

  private serialize(an: Annotation, scene: Scene): string {
    const color = an.color;
    const ref = an.target.ref;
    switch (an.kind) {
      case "highlight":
        return `highlight ${ref} { color: ${color} }`;
      case "underline":
        return `underline ${ref} { color: ${color} }`;
      case "box":
        return `box [${ref}]${an.text ? ` "${an.text}"` : ""} { color: ${color} }`;
      case "circle-mark":
        return `circle-mark ${ref}${an.text ? ` "${an.text}"` : ""} { color: ${color} }`;
      case "connector": {
        const fromRef = an.options.fromRef as string | undefined;
        if (ref && fromRef) {
          return `point-at ${ref} { from: ${this.cardinalBetween(fromRef, ref, scene)}, color: ${color} }`;
        }
        if (ref) return `point-at ${ref} { color: ${color} }`;
        return `// free arrow (no element anchor) — not representable in code`;
      }
      case "sticky":
      case "text": {
        const p = an.target.point;
        return `// note "${an.text ?? ""}" at (${Math.round(p?.x ?? 0)}, ${Math.round(p?.y ?? 0)})`;
      }
      default:
        return `// ${an.kind} ${ref ?? ""}`;
    }
  }

  private cardinalBetween(fromRef: string, toRef: string, scene: Scene): string {
    const a = elementBBox(scene, fromRef);
    const b = elementBBox(scene, toRef);
    if (!a || !b) return "ne";
    const ca = bboxCenter(a);
    const cb = bboxCenter(b);
    const dx = ca.x - cb.x;
    const dy = ca.y - cb.y;
    const h = Math.abs(dx) > Math.abs(dy) * 0.5;
    const v = Math.abs(dy) > Math.abs(dx) * 0.5;
    const ns = dy < 0 ? "n" : "s";
    const ew = dx < 0 ? "w" : "e";
    if (h && v) return ns + ew;
    if (v) return ns;
    return ew;
  }
}
