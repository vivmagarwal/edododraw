/**
 * Shared geometry/label helpers for the built-in viz generators.
 */

import type { VizContext } from "../context.js";
import type { VizBounds } from "../types.js";
import type { TextAlign } from "../../scene/types.js";

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
