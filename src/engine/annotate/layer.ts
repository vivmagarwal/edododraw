/**
 * AnnotationLayer — renders annotations (scripted or live) into the renderer's
 * world-space annotation layer so they track the camera and the elements they
 * anchor to. Hand-drawn via rough.js to match the aesthetic.
 *
 * The same layer serves M3 (scripted timeline annotations) and M4 (real-time
 * user annotations) — both are just `Annotation` records.
 */

import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { BBox, Point } from "../geometry.js";
import { bboxCenter, bboxUnion, emptyBBox, expandBBox } from "../geometry.js";
import { getAnnotationPlugin } from "../plugins/registry.js";
import { elementBBox } from "../scene/query.js";
import { resolveMarker } from "../scene/palette.js";
import type { Annotation, Scene } from "../scene/types.js";
import type { SvgRenderer } from "../render/svgRenderer.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BIG = 200000;

export class AnnotationLayer {
  private renderer: SvgRenderer;
  private rc: ReturnType<(typeof rough)["svg"]>;
  private root: SVGGElement;

  constructor(renderer: SvgRenderer, layer: "annotations" | "live" = "annotations") {
    this.renderer = renderer;
    this.rc = rough.svg(renderer.svg);
    this.root = renderer.getLayer(layer);
  }

  clear(): void {
    this.root.replaceChildren();
  }

  /** Render a set of annotations (replaces current). */
  render(scene: Scene, annotations: Annotation[], animate = true): void {
    this.clear();
    // spotlights first (drawn under other annotations)
    const sorted = [...annotations].sort((a, b) => rank(a.kind) - rank(b.kind));
    for (const an of sorted) {
      try {
        const g = this.draw(scene, an);
        if (g) {
          // static renderers never animate reveals (frame determinism)
          if (animate && !this.renderer.isStatic) g.classList.add(revealClass(an.kind));
          this.root.appendChild(g);
        }
      } catch (err) {
        console.warn("annotation render failed", an.kind, err);
      }
    }
  }

  private targetBBox(scene: Scene, an: Annotation): BBox | null {
    const members = (an.options.members as string[] | undefined) ?? [];
    if (members.length) {
      let b = emptyBBox();
      for (const id of members) {
        const eb = elementBBox(scene, id);
        if (eb) b = bboxUnion(b, eb);
      }
      return Number.isFinite(b.minX) ? b : null;
    }
    if (an.target.rect) {
      const r = an.target.rect;
      return { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h };
    }
    if (an.target.ref) {
      return elementBBox(scene, an.target.ref) ?? null;
    }
    if (an.target.point) {
      const p = an.target.point;
      return { minX: p.x - 4, minY: p.y - 4, maxX: p.x + 4, maxY: p.y + 4 };
    }
    return null;
  }

  private draw(scene: Scene, an: Annotation): SVGGElement | null {
    const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
    g.setAttribute("data-annotation", an.id);
    g.setAttribute("class", "edd-annotation");
    const box = this.targetBBox(scene, an);

    // runtime-registered kinds take precedence (see plugins/registry)
    const plugin = getAnnotationPlugin(an.kind);
    if (plugin) {
      plugin(an, {
        scene,
        rc: this.rc,
        g,
        box,
        resolveBBox: (id) => elementBBox(scene, id),
        label: (text, at, color, anchor = "middle", size) => this.label(g, text, at, color, anchor, size),
      });
      return g.childNodes.length ? g : null;
    }

    switch (an.kind) {
      case "highlight":
        if (box) this.drawHighlight(g, box, an);
        break;
      case "underline":
        if (box) this.drawUnderline(g, box, an);
        break;
      case "strike":
        if (box) this.drawStrike(g, box, an);
        break;
      case "box":
      case "box-around":
        if (box) this.drawBox(g, box, an);
        break;
      case "circle-mark":
      case "circle-around":
        if (box) this.drawCircle(g, box, an);
        break;
      case "point-at":
        if (box) this.drawPointAt(g, box, an);
        break;
      case "callout":
        if (box) this.drawCallout(g, box, an);
        break;
      case "spotlight":
        if (box) this.drawSpotlight(g, box, an);
        break;
      case "emphasize":
        if (box) this.drawCircle(g, box, an, true);
        break;
      case "note-marker":
      case "badge":
        if (box) this.drawNoteMarker(g, box, an);
        break;
      case "connector":
        this.drawConnector(scene, g, an);
        break;
      case "sticky":
      case "text":
        this.drawSticky(g, an);
        break;
      default:
        if (box) this.drawBox(g, box, an);
        break;
    }
    return g.childNodes.length ? g : null;
  }

  // ---- primitives ---------------------------------------------------------

  private drawHighlight(g: SVGGElement, box: BBox, an: Annotation): void {
    const color = resolveMarker(an.color);
    const pad = 6;
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(box.minX - pad));
    r.setAttribute("y", String(box.minY - pad));
    r.setAttribute("width", String(box.maxX - box.minX + pad * 2));
    r.setAttribute("height", String(box.maxY - box.minY + pad * 2));
    r.setAttribute("rx", "6");
    r.setAttribute("fill", color);
    r.setAttribute("opacity", "0.42");
    r.style.mixBlendMode = "multiply";
    g.appendChild(r);
  }

  private drawUnderline(g: SVGGElement, box: BBox, an: Annotation): void {
    const color = an.color || "#1971c2";
    const y = box.maxY - 4;
    const opts: Options = { stroke: color, strokeWidth: 3, roughness: 1.8, bowing: 3, seed: 7 };
    const style = String(an.options.style ?? "solid");
    if (style === "wavy") {
      const pts: [number, number][] = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const x = box.minX + ((box.maxX - box.minX) * i) / steps;
        pts.push([x, y + Math.sin(i * 1.3) * 3]);
      }
      g.appendChild(this.rc.curve(pts, opts));
    } else {
      g.appendChild(this.rc.line(box.minX, y, box.maxX, y, opts));
      if (style === "double") g.appendChild(this.rc.line(box.minX, y + 5, box.maxX, y + 5, opts));
    }
  }

  private drawStrike(g: SVGGElement, box: BBox, an: Annotation): void {
    const color = an.color || "#e03131";
    const y = (box.minY + box.maxY) / 2;
    g.appendChild(this.rc.line(box.minX, y, box.maxX, y, { stroke: color, strokeWidth: 3, roughness: 1.5, seed: 9 }));
  }

  private drawBox(g: SVGGElement, box: BBox, an: Annotation): void {
    const color = an.color || "#1971c2";
    const b = expandBBox(box, 14);
    g.appendChild(
      this.rc.rectangle(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, {
        stroke: color,
        strokeWidth: 2.4,
        roughness: 1.5,
        seed: 11,
      }),
    );
    if (an.text) this.label(g, an.text, { x: b.minX + 6, y: b.minY - 8 }, color, "start");
  }

  private drawCircle(g: SVGGElement, box: BBox, an: Annotation, pulse = false): void {
    const color = an.color || "#e8590c";
    const c = bboxCenter(box);
    const w = (box.maxX - box.minX) * 1.35 + 24;
    const h = (box.maxY - box.minY) * 1.35 + 24;
    const ring = this.rc.ellipse(c.x, c.y, w, h, { stroke: color, strokeWidth: 2.6, roughness: 1.6, seed: 13 });
    if (pulse) ring.classList.add("edd-anim-pulse"), (ring.style.animationDuration = "1.3s");
    g.appendChild(ring);
    if (an.text) this.label(g, an.text, { x: c.x, y: box.minY - h * 0.18 }, color, "middle");
  }

  private drawPointAt(g: SVGGElement, box: BBox, an: Annotation): void {
    const color = an.color || "#1971c2";
    const c = bboxCenter(box);
    const from = String(an.options.from ?? "ne");
    const dir = dirVec(from);
    const dist = 90;
    const tail: Point = { x: c.x + dir.x * dist, y: c.y + dir.y * dist };
    // tip just outside the target's border
    const tip: Point = { x: c.x + dir.x * ((box.maxX - box.minX) / 2 + 14), y: c.y + dir.y * ((box.maxY - box.minY) / 2 + 14) };
    // curved hand-drawn arrow
    const ctrl: Point = { x: (tail.x + tip.x) / 2 + dir.y * 20, y: (tail.y + tip.y) / 2 - dir.x * 20 };
    g.appendChild(this.rc.curve([[tail.x, tail.y], [ctrl.x, ctrl.y], [tip.x, tip.y]], { stroke: color, strokeWidth: 2.4, roughness: 1.4, seed: 17 }));
    // arrowhead at tip
    const ang = Math.atan2(tip.y - ctrl.y, tip.x - ctrl.x);
    const sz = 14;
    g.appendChild(
      this.rc.linearPath(
        [
          [tip.x - Math.cos(ang - 0.4) * sz, tip.y - Math.sin(ang - 0.4) * sz],
          [tip.x, tip.y],
          [tip.x - Math.cos(ang + 0.4) * sz, tip.y - Math.sin(ang + 0.4) * sz],
        ],
        { stroke: color, strokeWidth: 2.4, roughness: 1, seed: 17 },
      ),
    );
    if (an.text) {
      const anchor = dir.x < -0.3 ? "end" : dir.x > 0.3 ? "start" : "middle";
      this.label(g, an.text, { x: tail.x + dir.x * 6, y: tail.y + dir.y * 6 }, color, anchor);
    }
  }

  private drawCallout(g: SVGGElement, box: BBox, an: Annotation): void {
    const color = an.color || "#1971c2";
    const placement = String(an.options.placement ?? "bottom");
    const c = bboxCenter(box);
    const dir = dirVec(placement);
    const gap = 46;
    const anchor: Point = {
      x: c.x + dir.x * ((box.maxX - box.minX) / 2 + 8),
      y: c.y + dir.y * ((box.maxY - box.minY) / 2 + 8),
    };
    const bubble: Point = { x: anchor.x + dir.x * gap, y: anchor.y + dir.y * gap };
    const text = an.text ?? "";
    const w = Math.max(70, text.length * 8.4 + 20);
    const h = 34;
    const bx = bubble.x - (dir.x < -0.3 ? w : dir.x > 0.3 ? 0 : w / 2);
    const by = bubble.y - h / 2;
    // leader line
    g.appendChild(this.rc.line(anchor.x, anchor.y, dir.x < -0.3 ? bx + w : dir.x > 0.3 ? bx : bx + w / 2, by + h / 2, { stroke: color, strokeWidth: 2, roughness: 1.2, seed: 19 }));
    // bubble
    g.appendChild(this.rc.rectangle(bx, by, w, h, { stroke: color, strokeWidth: 2, roughness: 1.2, seed: 21, fill: "#ffffff", fillStyle: "solid" }));
    this.label(g, text, { x: bx + w / 2, y: by + h / 2 }, color, "middle", 15);
  }

  private drawNoteMarker(g: SVGGElement, box: BBox, an: Annotation): void {
    const color = an.color || "#1971c2";
    const p: Point = { x: box.minX - 6, y: box.minY - 6 };
    g.appendChild(this.rc.circle(p.x, p.y, 30, { stroke: color, strokeWidth: 2, roughness: 1, seed: 23, fill: "#ffffff", fillStyle: "solid" }));
    this.label(g, an.text ?? "●", p, color, "middle", 14);
  }

  private drawSpotlight(g: SVGGElement, box: BBox, an: Annotation): void {
    const dim = clamp(numOr(an.options.dim, 0.68), 0, 0.95);
    const pad = numOr(an.options.pad, 18);
    const b = expandBBox(box, pad);
    const maskId = `edd-spot-${an.id.replace(/[^a-z0-9]/gi, "")}`;
    const mask = document.createElementNS(SVG_NS, "mask");
    mask.setAttribute("id", maskId);
    const full = document.createElementNS(SVG_NS, "rect");
    full.setAttribute("x", String(-BIG));
    full.setAttribute("y", String(-BIG));
    full.setAttribute("width", String(BIG * 2));
    full.setAttribute("height", String(BIG * 2));
    full.setAttribute("fill", "white");
    const hole = document.createElementNS(SVG_NS, "rect");
    hole.setAttribute("x", String(b.minX));
    hole.setAttribute("y", String(b.minY));
    hole.setAttribute("width", String(b.maxX - b.minX));
    hole.setAttribute("height", String(b.maxY - b.minY));
    hole.setAttribute("rx", "14");
    hole.setAttribute("fill", "black");
    mask.appendChild(full);
    mask.appendChild(hole);
    g.appendChild(mask);
    const shade = document.createElementNS(SVG_NS, "rect");
    shade.setAttribute("x", String(-BIG));
    shade.setAttribute("y", String(-BIG));
    shade.setAttribute("width", String(BIG * 2));
    shade.setAttribute("height", String(BIG * 2));
    shade.setAttribute("fill", "#0b1021");
    shade.setAttribute("opacity", String(dim));
    shade.setAttribute("mask", `url(#${maskId})`);
    g.appendChild(shade);
  }

  private drawConnector(scene: Scene, g: SVGGElement, an: Annotation): void {
    const color = an.color || "#1971c2";
    const fromPoint = an.options.fromPoint as Point | undefined;
    const fromRef = an.options.fromRef as string | undefined;
    let tail: Point | null = fromPoint ?? null;
    if (!tail && fromRef) {
      const b = elementBBox(scene, fromRef);
      if (b) tail = bboxCenter(b);
    }
    let tip: Point | null = an.target.point ?? null;
    if (!tip && an.target.ref) {
      const b = elementBBox(scene, an.target.ref);
      if (b) tip = bboxCenter(b);
    }
    if (!tail || !tip) return;
    // if tip anchors to an element, pull it to the border toward the tail
    if (an.target.ref) {
      const b = elementBBox(scene, an.target.ref);
      if (b) {
        const c = bboxCenter(b);
        const dx = tail.x - c.x;
        const dy = tail.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        tip = { x: c.x + (dx / len) * ((b.maxX - b.minX) / 2 + 8), y: c.y + (dy / len) * ((b.maxY - b.minY) / 2 + 8) };
      }
    }
    g.appendChild(this.rc.line(tail.x, tail.y, tip.x, tip.y, { stroke: color, strokeWidth: 2.4, roughness: 1.3, seed: 29 }));
    const ang = Math.atan2(tip.y - tail.y, tip.x - tail.x);
    const sz = 14;
    g.appendChild(
      this.rc.linearPath(
        [
          [tip.x - Math.cos(ang - 0.4) * sz, tip.y - Math.sin(ang - 0.4) * sz],
          [tip.x, tip.y],
          [tip.x - Math.cos(ang + 0.4) * sz, tip.y - Math.sin(ang + 0.4) * sz],
        ],
        { stroke: color, strokeWidth: 2.4, roughness: 1, seed: 29 },
      ),
    );
    if (an.text) this.label(g, an.text, { x: tail.x, y: tail.y - 12 }, color, "middle");
  }

  private drawSticky(g: SVGGElement, an: Annotation): void {
    const p = an.target.point;
    if (!p) return;
    const color = an.color || "#e8590c";
    const text = an.text ?? "";
    const w = Math.max(90, text.length * 8.6 + 24);
    const h = 40;
    g.appendChild(
      this.rc.rectangle(p.x - w / 2, p.y - h / 2, w, h, {
        stroke: color,
        strokeWidth: 2,
        roughness: 1.1,
        seed: 31,
        fill: "#fff9db",
        fillStyle: "solid",
      }),
    );
    this.label(g, text, p, "#5c3d00", "middle", 16);
  }

  private label(g: SVGGElement, text: string, at: Point, color: string, anchor: "start" | "middle" | "end", size = 17): void {
    const t = document.createElementNS(SVG_NS, "text");
    const lines = text.split("\n");
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("font-family", '"Excalifont", "Virgil", cursive');
    t.setAttribute("font-size", String(size));
    t.setAttribute("fill", color);
    t.setAttribute("dominant-baseline", "middle");
    const startY = at.y - ((lines.length - 1) * size * 1.2) / 2;
    lines.forEach((line, i) => {
      const ts = document.createElementNS(SVG_NS, "tspan");
      ts.setAttribute("x", String(at.x));
      ts.setAttribute("y", String(startY + i * size * 1.2));
      ts.textContent = line;
      t.appendChild(ts);
    });
    g.appendChild(t);
  }
}

function dirVec(name: string): Point {
  const map: Record<string, Point> = {
    n: { x: 0, y: -1 },
    top: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    bottom: { x: 0, y: 1 },
    e: { x: 1, y: 0 },
    right: { x: 1, y: 0 },
    w: { x: -1, y: 0 },
    left: { x: -1, y: 0 },
    ne: { x: 0.7, y: -0.7 },
    nw: { x: -0.7, y: -0.7 },
    se: { x: 0.7, y: 0.7 },
    sw: { x: -0.7, y: 0.7 },
  };
  return map[name] ?? map.ne;
}

function rank(kind: string): number {
  return kind === "spotlight" ? 0 : 1;
}

function revealClass(kind: string): string {
  if (kind === "spotlight") return "edd-reveal-fade";
  if (kind === "highlight") return "edd-reveal-sweep";
  return "edd-reveal-pop";
}

function numOr(v: unknown, d: number): number {
  return typeof v === "number" ? v : d;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
