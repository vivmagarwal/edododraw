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

  // ---- sketchnote containers ------------------------------------------------
  // The classic sketchnoting container vocabulary (speech, impact, banner,
  // document) — labels render inside as with any shape.

  // Speech bubble: rounded body + a tail. data.dir: "left" (default) | "right".
  registerShape("speech-bubble", (rc, rect, style, data) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    const { x, y, w, h } = rect;
    const bodyH = h * 0.78;
    const r = Math.min(14, bodyH * 0.3);
    const right = (data as { dir?: string } | undefined)?.dir === "right";
    const tx = right ? x + w * 0.72 : x + w * 0.28; // tail root x
    const tip: [number, number] = [right ? x + w * 0.86 : x + w * 0.14, y + h];
    const d = [
      `M${x + r},${y}`,
      `H${x + w - r}`, `Q${x + w},${y} ${x + w},${y + r}`,
      `V${y + bodyH - r}`, `Q${x + w},${y + bodyH} ${x + w - r},${y + bodyH}`,
      `H${tx + w * 0.09}`, `L${tip[0]},${tip[1]}`, `L${tx - w * 0.05},${y + bodyH}`,
      `H${x + r}`, `Q${x},${y + bodyH} ${x},${y + bodyH - r}`,
      `V${y + r}`, `Q${x},${y} ${x + r},${y}`, "Z",
    ].join(" ");
    g.appendChild(rc.path(d, nodeRoughOptions(style, true)));
    return g;
  });

  // Starburst / explosion: spiky border for impact statements.
  registerShape("starburst", (rc, rect, style, data) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const spikes = Math.max(8, Math.min(24, Number((data as { spikes?: number } | undefined)?.spikes ?? 12)));
    const pts: [number, number][] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const f = i % 2 === 0 ? 1 : 0.74;
      const a = -Math.PI / 2 + (i * Math.PI) / spikes;
      pts.push([cx + Math.cos(a) * (rect.w / 2) * f, cy + Math.sin(a) * (rect.h / 2) * f]);
    }
    g.appendChild(rc.polygon(pts, nodeRoughOptions(style, true)));
    return g;
  });

  // Ribbon banner: central strip + V-cut tails + fold triangles under each end.
  registerShape("ribbon", (rc, rect, style) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    const { x, y, w, h } = rect;
    const tail = Math.min(w * 0.14, h * 1.2);
    const dip = h * 0.18; // tails sit slightly lower than the strip
    const opts = nodeRoughOptions(style, true);
    // left tail (V-cut end), behind the strip
    g.appendChild(rc.polygon([[x, y + dip], [x + tail, y + dip], [x + tail, y + h + dip], [x, y + h + dip], [x + tail * 0.45, y + h / 2 + dip]], opts));
    g.appendChild(rc.polygon([[x + w - tail, y + dip], [x + w, y + dip], [x + w - tail * 0.45, y + h / 2 + dip], [x + w, y + h + dip], [x + w - tail, y + h + dip]], opts));
    // fold shadows where the strip overlaps the tails
    g.appendChild(rc.polygon([[x + tail, y + dip], [x + tail + h * 0.35, y], [x + tail, y]], nodeRoughOptions(style, false)));
    g.appendChild(rc.polygon([[x + w - tail, y + dip], [x + w - tail - h * 0.35, y], [x + w - tail, y]], nodeRoughOptions(style, false)));
    // central strip on top
    g.appendChild(rc.rectangle(x + tail * 0.7, y, w - tail * 1.4, h, opts));
    return g;
  });

  // Paper with a folded corner (documents, lists, "see the memo").
  registerShape("paper-fold", (rc, rect, style) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
    const { x, y, w, h } = rect;
    const f = Math.min(w, h) * 0.22;
    g.appendChild(
      rc.polygon(
        [
          [x, y],
          [x + w - f, y],
          [x + w, y + f],
          [x + w, y + h],
          [x, y + h],
        ],
        nodeRoughOptions(style, true),
      ),
    );
    g.appendChild(rc.polygon([[x + w - f, y], [x + w - f, y + f], [x + w, y + f]], nodeRoughOptions(style, false)));
    return g;
  });
}

// Eager registration for direct engine users (survives when this module is
// imported for its side effect, e.g. via the engine barrel).
registerBuiltinShapes();
