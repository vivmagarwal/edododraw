/**
 * Built-in plugin shapes — also a worked example of how a senior engineer adds
 * a new shape without touching the renderer's core switch.
 *
 * Registration is exposed as an idempotent function AND called from the
 * renderer on mount, so the built-ins survive a tree-shaking library build
 * (a bare side-effect import can be dropped by bundlers when nothing "uses" it).
 */

import { nodeRoughOptions } from "../render/shapes.js";
import { registerShape } from "./registry.js";

let registered = false;

export function registerBuiltinShapes(): void {
  if (registered) return;
  registered = true;

  // A crisp 5-point star.
  registerShape("star", (rc, rect, style) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const outer = Math.min(rect.w, rect.h) / 2;
    const inner = outer * 0.42;
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    g.appendChild(rc.polygon(pts, nodeRoughOptions(style, true)));
    return g;
  });
}

// Eager registration for direct engine users (survives when this module is
// imported for its side effect, e.g. via the engine barrel).
registerBuiltinShapes();
