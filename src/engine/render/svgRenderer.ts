/**
 * SvgRenderer — imperative renderer that owns an <svg> and paints a Scene into
 * it. React only provides the mount container; this class manages the SVG DOM
 * directly (like Excalidraw manages its canvas outside React) for full control
 * over the camera transform, animated overlays, and annotation layers.
 *
 * Layer stack (bottom -> top), all inside the camera-transformed world group
 * except the screen background/overlay:
 *   bg (screen)  <  grid  <  groups  <  edges  <  nodes  <  annotations  <  screen-overlay
 */

import rough from "roughjs";
import type { Point } from "../geometry.js";
import type { Scene, SceneNode } from "../scene/types.js";
import { registerBuiltinShapes } from "../plugins/builtins.js";
import { ensurePluginStyles } from "../plugins/registry.js";
import { renderEdge } from "./edges.js";
import { labelBelow, renderShapeBody } from "./shapes.js";
import { ensureEngineStyles, FONT_FAMILY } from "./theme.css.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Reveal effect name (from the DSL `reveal … with <effect>`) -> CSS class. */
const REVEAL_EFFECT_CLASS: Record<string, string | undefined> = {
  fade: "edd-reveal-fade",
  pop: "edd-reveal-pop",
  sweep: "edd-reveal-sweep",
};

export interface CameraTransform {
  cx: number;
  cy: number;
  zoom: number;
}

export interface SvgRendererOptions {
  /**
   * Deterministic frame-by-frame rendering for screenshot/video consumers
   * (Remotion, Puppeteer, export pipelines): disables ALL wall-clock CSS —
   * visibility transitions, animated-arrow keyframes (the overlay isn't even
   * emitted), and reveal animations — so any captured frame is final, never
   * mid-transition. Drive motion explicitly via applyVisibility/applyCamera/
   * setRevealProgress instead.
   */
  static?: boolean;
}

export class SvgRenderer {
  readonly container: HTMLElement;
  /** True when constructed with `{ static: true }` — see SvgRendererOptions. */
  readonly isStatic: boolean;
  svg!: SVGSVGElement;
  private defs!: SVGDefsElement;
  private bg!: SVGRectElement;
  world!: SVGGElement;
  private layers!: Record<string, SVGGElement>;
  screenLayer!: SVGGElement;
  private rc!: ReturnType<(typeof rough)["svg"]>;

  private camera: CameraTransform = { cx: 0, cy: 0, zoom: 1 };
  private viewport = { w: 800, h: 600 };
  private scene: Scene | null = null;

  constructor(container: HTMLElement, options: SvgRendererOptions = {}) {
    this.container = container;
    this.isStatic = options.static ?? false;
  }

  mount(): void {
    registerBuiltinShapes(); // ensure built-in plugin shapes survive lib builds
    ensureEngineStyles(this.container.ownerDocument);
    const doc = this.container.ownerDocument;
    const svg = doc.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    svg.setAttribute("class", this.isStatic ? "edd-canvas edd-static" : "edd-canvas");
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";
    svg.style.userSelect = "none";
    svg.style.touchAction = "none";
    this.svg = svg;

    this.defs = doc.createElementNS(SVG_NS, "defs") as SVGDefsElement;
    this.defs.innerHTML = this.defsMarkup();
    svg.appendChild(this.defs);

    this.bg = doc.createElementNS(SVG_NS, "rect") as SVGRectElement;
    this.bg.setAttribute("class", "edd-bg");
    this.bg.setAttribute("x", "0");
    this.bg.setAttribute("y", "0");
    this.bg.setAttribute("width", "100%");
    this.bg.setAttribute("height", "100%");
    this.bg.setAttribute("fill", "#ffffff");
    svg.appendChild(this.bg);

    this.world = doc.createElementNS(SVG_NS, "g") as SVGGElement;
    this.world.setAttribute("class", "edd-world");
    svg.appendChild(this.world);

    this.layers = {};
    for (const name of ["grid", "groups", "edges", "nodes", "annotations", "live"]) {
      const g = doc.createElementNS(SVG_NS, "g") as SVGGElement;
      g.setAttribute("class", `edd-layer edd-layer-${name}`);
      this.world.appendChild(g);
      this.layers[name] = g;
    }

    this.screenLayer = doc.createElementNS(SVG_NS, "g") as SVGGElement;
    this.screenLayer.setAttribute("class", "edd-layer-screen");
    svg.appendChild(this.screenLayer);

    this.rc = rough.svg(svg);
    this.container.appendChild(svg);
    this.measure();
    this.applyCamera(this.camera);
  }

  destroy(): void {
    this.svg?.remove();
  }

  private defsMarkup(): string {
    return `
      <linearGradient id="eddFlowGradient" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
        <stop offset="0" stop-color="#4dabf7"/>
        <stop offset="0.4" stop-color="#22b8cf"/>
        <stop offset="0.7" stop-color="#845ef7"/>
        <stop offset="1" stop-color="#4dabf7"/>
      </linearGradient>
      <filter id="eddSoftGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
  }

  /** Read the container size; call on mount + resize. */
  measure(): { w: number; h: number } {
    const rect = this.container.getBoundingClientRect();
    this.viewport = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    return this.viewport;
  }

  getViewportSize(): { w: number; h: number } {
    return { ...this.viewport };
  }

  getCamera(): CameraTransform {
    return { ...this.camera };
  }

  applyCamera(cam: CameraTransform): void {
    this.camera = cam;
    const { w, h } = this.viewport;
    const t = `translate(${w / 2} ${h / 2}) scale(${cam.zoom}) translate(${-cam.cx} ${-cam.cy})`;
    this.world.setAttribute("transform", t);
  }

  worldToScreen(p: Point): Point {
    const { w, h } = this.viewport;
    return {
      x: (p.x - this.camera.cx) * this.camera.zoom + w / 2,
      y: (p.y - this.camera.cy) * this.camera.zoom + h / 2,
    };
  }

  screenToWorld(p: Point): Point {
    const { w, h } = this.viewport;
    return {
      x: (p.x - w / 2) / this.camera.zoom + this.camera.cx,
      y: (p.y - h / 2) / this.camera.zoom + this.camera.cy,
    };
  }

  getLayer(name: "grid" | "groups" | "edges" | "nodes" | "annotations" | "live"): SVGGElement {
    return this.layers[name];
  }

  /** Show/hide nodes+edges for timeline reveal. `hidden` = ids to fade out. */
  applyVisibility(hidden: Set<string>): void {
    const els = this.svg.querySelectorAll<SVGGElement>("[data-node],[data-edge]");
    els.forEach((el) => {
      const id = el.getAttribute("data-node") ?? el.getAttribute("data-edge");
      if (id && hidden.has(id)) el.classList.add("edd-hidden");
      else el.classList.remove("edd-hidden");
    });
  }

  /**
   * Play a per-beat reveal animation (`fade` | `pop` | `sweep`) on the named
   * element groups. Clears any prior reveal classes first and forces a reflow so
   * re-entering the same beat restarts the animation. `fx` = id -> effect.
   */
  playReveal(fx: Record<string, string> | undefined): void {
    if (this.isStatic) return; // static frames must never catch a reveal mid-flight
    const classes = ["edd-reveal-fade", "edd-reveal-pop", "edd-reveal-sweep"];
    const els = this.svg.querySelectorAll<SVGGElement>("[data-node],[data-edge]");
    els.forEach((el) => el.classList.remove(...classes));
    if (!fx || !Object.keys(fx).length) return;
    // reflow so removed classes fully clear before we re-add (animation restart)
    void this.svg.getBoundingClientRect();
    els.forEach((el) => {
      const id = el.getAttribute("data-node") ?? el.getAttribute("data-edge");
      const cls = id ? REVEAL_EFFECT_CLASS[fx[id]] : undefined;
      if (cls) el.classList.add(cls);
    });
  }

  /**
   * Drive a hand-drawn "draw-on" reveal of one element from host code: strokes
   * sweep on in draw order (stroke-dashoffset), then labels fade in. `id` is a
   * node id, edge id, or viz-item key ("block.item" — all member elements sweep
   * as one continuous drawing). `progress` is 0..1; ≥1 restores the untouched
   * rendering (original dash patterns included), ≤0 hides the element. Built
   * for frame-driven hosts (Remotion, capture pipelines) — pair with
   * `{ static: true }` so no wall-clock CSS competes with it.
   */
  setRevealProgress(id: string, progress: number): void {
    const esc = cssEscape(id);
    const groups = this.svg.querySelectorAll<SVGGElement>(`[data-node="${esc}"],[data-edge="${esc}"],[data-viz-item="${esc}"]`);
    if (!groups.length) return;
    const p = Math.max(0, Math.min(1, progress));

    const strokes: SVGElement[] = [];
    const texts: SVGElement[] = [];
    groups.forEach((g) => {
      g.querySelectorAll<SVGElement>("path,line,polyline,polygon,circle,ellipse,rect").forEach((el) => strokes.push(el));
      g.querySelectorAll<SVGElement>("text").forEach((el) => texts.push(el));
    });

    // strokes complete at 85% progress; labels fade over the last 30%
    const sweep = Math.min(1, p / 0.85);
    const lens = strokes.map(strokeLength);
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let done = 0;
    strokes.forEach((el, i) => {
      const len = lens[i];
      const local = Math.max(0, Math.min(1, (sweep * total - done) / len));
      done += len;
      if (progress >= 1) {
        restoreStroke(el);
        return;
      }
      const hasStroke = (el.getAttribute("stroke") ?? "") !== "none";
      if (!hasStroke) {
        // fill-only element (solid rough fills): fade instead of dash-sweep
        el.style.opacity = String(local);
        return;
      }
      if (el.getAttribute("data-edd-dash") === null) {
        el.setAttribute("data-edd-dash", el.getAttribute("stroke-dasharray") ?? "");
      }
      el.setAttribute("stroke-dasharray", String(len));
      el.setAttribute("stroke-dashoffset", String(len * (1 - local)));
      el.style.opacity = local > 0 ? "" : "0";
    });

    const fade = Math.max(0, Math.min(1, (p - 0.7) / 0.3));
    texts.forEach((el) => {
      el.style.opacity = progress >= 1 ? "" : String(fade);
    });
  }

  render(scene: Scene): void {
    this.scene = scene;
    // keyframes from runtime-registered arrow animations (cheap, idempotent)
    ensurePluginStyles(this.container.ownerDocument);
    // Paint the background on the mount container, not the SVG rect: the host's
    // dotted-grid background sits *behind* the SVG, so an opaque bg rect would
    // occlude it. Keeping the on-screen rect transparent lets the grid show
    // through. Export re-fills its own cloned rect (see export.ts), so exported
    // SVG/PNG still get a solid background.
    const bgColor = scene.meta.background || scene.theme.background;
    this.bg.setAttribute("fill", "transparent");
    this.container.style.backgroundColor = bgColor;

    // clear dynamic layers
    for (const name of ["groups", "edges", "nodes"]) this.layers[name].replaceChildren();

    // groups / container frames
    for (const group of scene.groups) {
      if (!group.frame) continue;
      const els = this.renderGroupFrame(scene, group);
      if (els) this.layers.groups.appendChild(els);
    }

    // edges (below nodes)
    const edges = [...scene.edges].sort((a, b) => a.z - b.z);
    for (const edge of edges) {
      try {
        const r = renderEdge(this.rc, scene, edge, { static: this.isStatic });
        if (edge.label) r.group.appendChild(this.edgeLabel(scene, edge, r.points));
        this.applyVizTags(r.group, edge.data);
        this.layers.edges.appendChild(r.group);
      } catch (err) {
        // never let one bad edge blank the whole diagram
        console.warn("edge render failed", edge.id, err);
      }
    }

    // nodes (above edges)
    const nodes = [...scene.nodes].sort((a, b) => a.z - b.z);
    for (const node of nodes) {
      try {
        this.layers.nodes.appendChild(this.renderNode(scene, node));
      } catch (err) {
        console.warn("node render failed", node.id, err);
      }
    }
  }

  /** Cache of gradient-fill defs created this mount: spec -> def id. */
  private gradientIds = new Map<string, string>();

  /**
   * Turn a `linear-gradient(#from,#to)` fill (emitted by gradient style
   * presets) into an SVG <linearGradient> def and return a url() reference.
   * Plain fills pass through untouched.
   */
  private resolveGradientFill(fill: string | null): string | null {
    if (!fill || !fill.startsWith("linear-gradient(")) return fill;
    const cached = this.gradientIds.get(fill);
    if (cached) return `url(#${cached})`;
    const inner = fill.slice("linear-gradient(".length, -1);
    const parts = inner.split(",").map((s) => s.trim());
    const [from, to] = parts.length >= 2 ? [parts[parts.length - 2], parts[parts.length - 1]] : [parts[0], parts[0]];
    const id = `eddGrad${this.gradientIds.size}`;
    const doc = this.container.ownerDocument;
    const grad = doc.createElementNS(SVG_NS, "linearGradient");
    grad.setAttribute("id", id);
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0");
    grad.setAttribute("y2", "1");
    for (const [offset, color] of [
      ["0", from],
      ["1", to],
    ] as const) {
      const stop = doc.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      grad.appendChild(stop);
    }
    this.defs.appendChild(grad);
    this.gradientIds.set(fill, id);
    return `url(#${id})`;
  }

  /** Surface viz-item membership as DOM attributes so hosts can select one
   *  data item's elements as a unit: [data-viz-item="loads.intrinsic"]. */
  private applyVizTags(g: SVGGElement, data: Record<string, unknown> | undefined): void {
    const item = (data as { vizItem?: string } | undefined)?.vizItem;
    const role = (data as { vizRole?: string } | undefined)?.vizRole;
    if (item) g.setAttribute("data-viz-item", item);
    if (role) g.setAttribute("data-viz-role", role);
  }

  private renderNode(_scene: Scene, node: SceneNode): SVGGElement {
    const doc = this.container.ownerDocument;
    const g = doc.createElementNS(SVG_NS, "g") as SVGGElement;
    g.setAttribute("data-node", node.id);
    g.setAttribute("class", "edd-node");
    this.applyVizTags(g, node.data);
    g.style.opacity = String(node.style.opacity / 100);

    const fill = this.resolveGradientFill(node.style.fill);
    const style = fill === node.style.fill ? node.style : { ...node.style, fill };
    const body = renderShapeBody(this.rc, node.shape, { x: node.x, y: node.y, w: node.w, h: node.h }, style, node.data);
    g.appendChild(body);

    if (node.label) {
      const align = node.style.textAlign;
      const cx = align === "left" ? node.x : align === "right" ? node.x + node.w : node.x + node.w / 2;
      const below = labelBelow(node.shape);
      const lines = node.label.split("\n").length;
      const lineHeight = node.style.fontSize * 1.25;
      const blockHalf = ((lines - 1) * lineHeight) / 2;
      const vAlign = node.style.verticalAlign;
      let cy: number;
      if (below) cy = node.y + node.h + node.style.fontSize;
      else if (vAlign === "top") cy = node.y + node.style.fontSize * 0.75 + blockHalf;
      else if (vAlign === "bottom") cy = node.y + node.h - node.style.fontSize * 0.75 - blockHalf;
      else cy = node.y + node.h / 2;
      g.appendChild(this.textBlock(node.label, cx, cy, node.style.fontSize, node.style.textColor, node.style.fontFamily, align, node.style.fontWeight));
    }
    return g;
  }

  private textBlock(
    text: string,
    cx: number,
    cy: number,
    fontSize: number,
    color: string,
    family: SceneNode["style"]["fontFamily"],
    align: SceneNode["style"]["textAlign"] = "center",
    weight?: number,
  ): SVGTextElement {
    const doc = this.container.ownerDocument;
    const t = doc.createElementNS(SVG_NS, "text") as SVGTextElement;
    const lines = text.split("\n");
    const lineHeight = fontSize * 1.25;
    const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    t.setAttribute("text-anchor", anchor);
    // Named kinds map through FONT_FAMILY; presets may pass a raw CSS stack.
    t.setAttribute("font-family", FONT_FAMILY[family as keyof typeof FONT_FAMILY] ?? family);
    t.setAttribute("font-size", String(fontSize));
    if (weight) t.setAttribute("font-weight", String(weight));
    t.setAttribute("fill", color);
    t.setAttribute("dominant-baseline", "middle");
    t.style.whiteSpace = "pre";
    const startY = cy - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      const tspan = doc.createElementNS(SVG_NS, "tspan");
      tspan.setAttribute("x", String(cx));
      tspan.setAttribute("y", String(startY + i * lineHeight));
      tspan.textContent = line;
      t.appendChild(tspan);
    });
    return t;
  }

  private edgeLabel(scene: Scene, edge: (typeof scene.edges)[number], points: Point[]): SVGGElement {
    const doc = this.container.ownerDocument;
    const g = doc.createElementNS(SVG_NS, "g") as SVGGElement;
    // midpoint of the polyline
    const mid = points[Math.floor(points.length / 2)] ?? points[0];
    const fontSize = edge.style.fontSize;
    const padX = 6;
    const estW = edge.label.length * fontSize * 0.55 + padX * 2;
    if (edge.style.labelBg) {
      const rect = doc.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(mid.x - estW / 2));
      rect.setAttribute("y", String(mid.y - fontSize * 0.85));
      rect.setAttribute("width", String(estW));
      rect.setAttribute("height", String(fontSize * 1.7));
      rect.setAttribute("rx", "4");
      rect.setAttribute("fill", edge.style.labelBg);
      rect.setAttribute("opacity", "0.92");
      g.appendChild(rect);
    }
    g.appendChild(this.textBlock(edge.label, mid.x, mid.y, fontSize, edge.style.textColor, edge.style.fontFamily, "center"));
    return g;
  }

  private renderGroupFrame(scene: Scene, group: (typeof scene.groups)[number]): SVGGElement | null {
    const doc = this.container.ownerDocument;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id of group.members) {
      const n = scene.nodes.find((x) => x.id === id);
      if (!n) continue;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    if (!Number.isFinite(minX)) return null;
    const pad = 26;
    const g = doc.createElementNS(SVG_NS, "g") as SVGGElement;
    g.setAttribute("data-group", group.id);
    const stroke = group.style.stroke ?? "#adb5bd";
    const rectEl = this.rc.path(
      `M${minX - pad},${minY - pad} h${maxX - minX + pad * 2} v${maxY - minY + pad * 2} h${-(maxX - minX + pad * 2)} Z`,
      { stroke, strokeWidth: 1.2, roughness: 0.8, seed: 42, strokeLineDash: [6, 6], fill: group.style.fill ?? undefined, fillStyle: "solid" },
    );
    g.appendChild(rectEl);
    if (group.label) {
      g.appendChild(this.textBlock(group.label, minX - pad + 4, minY - pad - 2, 15, stroke, "hand", "left"));
    }
    return g;
  }
}

// ---- reveal-progress helpers -------------------------------------------------

function cssEscape(s: string): string {
  const css = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS;
  if (css?.escape) return css.escape(s);
  return s.replace(/["\\]/g, "\\$&");
}

/** Path length of a drawable, with a safe fallback where getTotalLength is
 *  unavailable (jsdom) or throws (detached/degenerate geometry). */
function strokeLength(el: SVGElement): number {
  const geo = el as Partial<SVGGeometryElement>;
  if (typeof geo.getTotalLength === "function") {
    try {
      const len = geo.getTotalLength();
      if (Number.isFinite(len) && len > 0) return len;
    } catch {
      /* fall through */
    }
  }
  return 120;
}

function restoreStroke(el: SVGElement): void {
  const orig = el.getAttribute("data-edd-dash");
  if (orig !== null) {
    if (orig === "") el.removeAttribute("stroke-dasharray");
    else el.setAttribute("stroke-dasharray", orig);
    el.removeAttribute("data-edd-dash");
  }
  el.removeAttribute("stroke-dashoffset");
  el.style.opacity = "";
}
