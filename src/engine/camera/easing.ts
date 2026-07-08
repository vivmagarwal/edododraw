/**
 * Easing catalog for camera magic-move and annotation reveals.
 * All functions map t in [0,1] -> eased value (usually [0,1], some overshoot).
 */

import type { EasingName } from "../scene/types.js";

export type EasingFn = (t: number) => number;

const c1 = 1.70158;
const c3 = c1 + 1;

export const EASINGS: Record<EasingName, EasingFn> = {
  linear: (t) => t,
  ease: (t) => cubicBezier(0.25, 0.1, 0.25, 1, t),
  "ease-in": (t) => t * t,
  "ease-out": (t) => 1 - (1 - t) * (1 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  "back-out": (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  anticipate: (t) => {
    const s = c1 * 1.2;
    return t < 0.5 ? (2 * t) ** 2 * ((s + 1) * 2 * t - s) / 2 : 1;
  },
  // A tuned spring feel for magic-move: settles with a soft overshoot.
  spring: (t) => {
    if (t >= 1) return 1;
    const damping = 6.5;
    const freq = 9;
    return 1 - Math.exp(-damping * t) * Math.cos(freq * t * (1 - t) + 0);
  },
};

export function easingByName(name: EasingName | undefined): EasingFn {
  return (name && EASINGS[name]) || EASINGS["ease-in-out"];
}

/** Approximate cubic-bezier easing solver (Newton-ish), good enough for UI. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // sample x(t) to find parameter, then eval y — cheap fixed iterations
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = sampleX(u) - t;
    const dx = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(x) < 1e-4 || Math.abs(dx) < 1e-6) break;
    u -= x / dx;
  }
  return sampleY(Math.max(0, Math.min(1, u)));
}
