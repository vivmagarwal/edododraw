/**
 * Shared geometry/label helpers for the built-in viz generators.
 */

import type { ShapeOptions, VizContext } from "../context.js";
import type { VizBounds } from "../types.js";
import type { NodeStyle, SceneNode, TextAlign } from "../../scene/types.js";

export const rad = (deg: number): number => (deg * Math.PI) / 180;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + Math.cos(rad(deg)) * r,
  cy + Math.sin(rad(deg)) * r,
];

export function fmtNum(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US");
  return String(Math.round(v * 100) / 100);
}

/** Horizontal alignment for a label sitting outside a circle at `deg`. */
export function radialAlign(deg: number): TextAlign {
  const c = Math.cos(rad(deg));
  if (c > 0.35) return "left";
  if (c < -0.35) return "right";
  return "center";
}

/**
 * Place a label+detail block outside a circle of radius `r` at angle `deg`,
 * guaranteed clear of the figure for ANY block size: the block is measured
 * first (wrapping included) and its center pushed out along the radial
 * direction by the block's own projected half-extent, so even a long
 * multi-line description never crosses the shape.
 */
export function radialLabel(
  ctx: VizContext,
  cx: number,
  cy: number,
  r: number,
  deg: number,
  label: string,
  detail: string | undefined,
  color: string,
  opts: { maxW?: number; gap?: number; size?: number } = {},
): VizBounds {
  const gap = opts.gap ?? 16;
  const maxW = opts.maxW ?? 200;
  const m = ctx.measureLabelBlock(label, detail, { maxW, size: opts.size });
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  // Distance from block center to its boundary along the radial direction.
  const push = (m.w / 2) * Math.abs(c) + (m.h / 2) * Math.abs(s);
  const [bx, by] = polar(cx, cy, r + gap + push, deg);
  const align = radialAlign(deg);
  const anchorX = align === "left" ? bx - m.w / 2 : align === "right" ? bx + m.w / 2 : bx;
  return ctx.labelBlock(label, detail, anchorX, by, { color, align, maxW, vAnchor: "middle", size: opts.size });
}

/**
 * Closed scalloped cloud outline: `bumps` outward arc bulges around an
 * ellipse, in local path coords inside a (2rx × 2ry) box. Deterministic
 * wobble (index-driven) keeps re-renders stable.
 */
export function scallopedBlob(rx: number, ry: number, bumps: number): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    const wob = 0.93 + 0.06 * Math.sin(i * 2.7) + 0.04 * Math.cos(i * 1.3);
    pts.push([rx + rx * wob * Math.cos(a), ry + ry * wob * Math.sin(a)]);
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i <= bumps; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i % bumps];
    const r = Math.hypot(x2 - x1, y2 - y1) * 0.62;
    d += ` A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d + " Z";
}

/** Sample a cubic Bézier into a polyline (root spines, hanging curves). */
export function cubicPoints(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], segs = 16): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

/** An outline anchor: a point the curve passes through; "corner" keeps a crease there. */
export type Anchor = [number, number] | [number, number, "corner"];

/**
 * A smooth SVG path THROUGH anchor points — Catmull-Rom tangents turned into
 * cubic Béziers — so a silhouette (a profile head, a trunk) is authored as a
 * handful of points ON its outline instead of hand-placed control handles.
 * `mirrorX` flips the drawing about that x (a head facing the other way).
 */
export function smoothPath(anchors: Anchor[], opts: { closed?: boolean; mirrorX?: number } = {}): string {
  const closed = opts.closed ?? true;
  const pts = anchors.map(([x, y, c]) => ({ x: opts.mirrorX === undefined ? x : opts.mirrorX - x, y, corner: c === "corner" }));
  const n = pts.length;
  const at = (i: number) => pts[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = p1.corner ? { x: p1.x + (p2.x - p1.x) / 3, y: p1.y + (p2.y - p1.y) / 3 } : { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = p2.corner ? { x: p2.x - (p2.x - p1.x) / 3, y: p2.y - (p2.y - p1.y) / 3 } : { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return closed ? `${d} Z` : d;
}

/**
 * A closed outline around a polyline spine whose half-width tapers from `w0`
 * at the start to `w1` at the end — a root, a tendril, a tapering trunk.
 */
export function taperedOutline(spine: Array<[number, number]>, w0: number, w1: number): Array<[number, number]> {
  const n = spine.length;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const hw = lerp(w0, w1, n > 1 ? i / (n - 1) : 0);
    left.push([spine[i][0] + nx * hw, spine[i][1] + ny * hw]);
    right.push([spine[i][0] - nx * hw, spine[i][1] - ny * hw]);
  }
  return [...left, ...right.reverse()];
}

/** A smooth silhouette through absolute local anchors, emitted as one path node sized to its anchors' bounds. */
export function smoothShape(ctx: VizContext, anchors: Anchor[], style: Partial<NodeStyle>, opts: ShapeOptions = {}): SceneNode {
  const xs = anchors.map((a) => a[0]);
  const ys = anchors.map((a) => a[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - minX, 1);
  const h = Math.max(Math.max(...ys) - minY, 1);
  const local = anchors.map(([x, y, c]) => (c ? ([x - minX, y - minY, c] as Anchor) : ([x - minX, y - minY] as Anchor)));
  return ctx.path(smoothPath(local), w, h, minX, minY, w, h, style, opts);
}
