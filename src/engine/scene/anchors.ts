/**
 * Anchor resolution — maps an anchor spec on a node to a concrete world point.
 *
 * EDodoDraw exposes far more connection points than Excalidraw's 4:
 *  - 8 compass points + center: n s e w ne nw se sw c
 *  - aliases: top bottom left right center
 *  - fractional side positions: "top:0.3" (30% along the top edge, l->r)
 *    also right:0.75, bottom:0.5, left:0.2
 *  - polar angle from center: "angle:45" (degrees, 0 = east, CW)
 *  - auto (undefined): border point aimed at the other endpoint
 */

import type { Point, Rect } from "../geometry.js";
import { borderPointToward, ellipseBorderToward, rectCenter } from "../geometry.js";
import type { SceneNode } from "./types.js";

export function nodeRect(n: SceneNode): Rect {
  return { x: n.x, y: n.y, w: n.w, h: n.h };
}

const COMPASS: Record<string, (r: Rect) => Point> = {
  c: (r) => rectCenter(r),
  center: (r) => rectCenter(r),
  n: (r) => ({ x: r.x + r.w / 2, y: r.y }),
  top: (r) => ({ x: r.x + r.w / 2, y: r.y }),
  s: (r) => ({ x: r.x + r.w / 2, y: r.y + r.h }),
  bottom: (r) => ({ x: r.x + r.w / 2, y: r.y + r.h }),
  e: (r) => ({ x: r.x + r.w, y: r.y + r.h / 2 }),
  right: (r) => ({ x: r.x + r.w, y: r.y + r.h / 2 }),
  w: (r) => ({ x: r.x, y: r.y + r.h / 2 }),
  left: (r) => ({ x: r.x, y: r.y + r.h / 2 }),
  ne: (r) => ({ x: r.x + r.w, y: r.y }),
  nw: (r) => ({ x: r.x, y: r.y }),
  se: (r) => ({ x: r.x + r.w, y: r.y + r.h }),
  sw: (r) => ({ x: r.x, y: r.y + r.h }),
};

/**
 * Resolve a named/parametric anchor to a world point.
 * `toward` is the opposite endpoint (used for "auto"/border computation).
 */
export function resolveAnchor(
  node: SceneNode,
  anchor: string | undefined,
  toward?: Point,
): Point {
  const r = nodeRect(node);
  if (!anchor || anchor === "auto") {
    const target = toward ?? rectCenter(r);
    if (node.shape === "ellipse" || node.shape === "circle") {
      return ellipseBorderToward(r, target);
    }
    return borderPointToward(r, target);
  }

  const key = anchor.trim().toLowerCase();
  if (key in COMPASS) return COMPASS[key](r);

  // side:fraction — e.g. "top:0.3"
  const frac = key.match(/^(top|bottom|left|right|n|s|e|w)\s*:\s*([0-9.]+)$/);
  if (frac) {
    const side = frac[1];
    const t = Math.max(0, Math.min(1, parseFloat(frac[2])));
    switch (side) {
      case "top":
      case "n":
        return { x: r.x + r.w * t, y: r.y };
      case "bottom":
      case "s":
        return { x: r.x + r.w * t, y: r.y + r.h };
      case "left":
      case "w":
        return { x: r.x, y: r.y + r.h * t };
      case "right":
      case "e":
        return { x: r.x + r.w, y: r.y + r.h * t };
    }
  }

  // angle:deg — polar from center, clipped to border
  const ang = key.match(/^angle\s*:\s*(-?[0-9.]+)$/);
  if (ang) {
    const deg = parseFloat(ang[1]);
    const rad = (deg * Math.PI) / 180;
    const c = rectCenter(r);
    const far: Point = { x: c.x + Math.cos(rad) * 1e5, y: c.y + Math.sin(rad) * 1e5 };
    if (node.shape === "ellipse" || node.shape === "circle") {
      return ellipseBorderToward(r, far);
    }
    return borderPointToward(r, far);
  }

  // Unknown anchor -> center (safe fallback)
  return rectCenter(r);
}
