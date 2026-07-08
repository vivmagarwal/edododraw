/**
 * Built-in plugin shapes registered at load — also a worked example of how a
 * senior engineer adds a new shape without touching the renderer's core switch.
 */

import { nodeRoughOptions } from "../render/shapes.js";
import { registerShape } from "./registry.js";

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
