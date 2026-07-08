/**
 * Geometry primitives shared across the engine.
 * All engine coordinates are in "world" space (unbounded, y-down) unless a
 * function name says otherwise. The camera converts world <-> screen.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Axis-aligned rectangle by top-left corner + size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounding box by extents. */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const rectCenter = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const rectToBBox = (r: Rect): BBox => ({
  minX: r.x,
  minY: r.y,
  maxX: r.x + r.w,
  maxY: r.y + r.h,
});

export const bboxToRect = (b: BBox): Rect => ({
  x: b.minX,
  y: b.minY,
  w: b.maxX - b.minX,
  h: b.maxY - b.minY,
});

export const bboxCenter = (b: BBox): Point => ({
  x: (b.minX + b.maxX) / 2,
  y: (b.minY + b.maxY) / 2,
});

export const bboxSize = (b: BBox): Size => ({
  w: b.maxX - b.minX,
  h: b.maxY - b.minY,
});

export const emptyBBox = (): BBox => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
});

export const isEmptyBBox = (b: BBox): boolean =>
  !Number.isFinite(b.minX) || b.maxX < b.minX || b.maxY < b.minY;

export const bboxUnion = (a: BBox, b: BBox): BBox => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

export const bboxOfPoints = (points: Point[]): BBox => {
  const b = emptyBBox();
  for (const p of points) {
    if (p.x < b.minX) b.minX = p.x;
    if (p.y < b.minY) b.minY = p.y;
    if (p.x > b.maxX) b.maxX = p.x;
    if (p.y > b.maxY) b.maxY = p.y;
  }
  return b;
};

export const expandBBox = (b: BBox, pad: number): BBox => ({
  minX: b.minX - pad,
  minY: b.minY - pad,
  maxX: b.maxX + pad,
  maxY: b.maxY + pad,
});

export const pointInRect = (p: Point, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * Intersection of the segment from the rect center toward `target` with the
 * rect border. Used to make an edge touch a node's border instead of its
 * center. Returns the border point (falls back to center if degenerate).
 */
export const borderPointToward = (r: Rect, target: Point): Point => {
  const c = rectCenter(r);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = r.w / 2;
  const hh = r.h / 2;
  // scale so that the larger normalized axis hits +/-1 (the border)
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(scaleX, scaleY);
  return { x: c.x + dx * s, y: c.y + dy * s };
};

/**
 * Border point for an ellipse toward a target (used for ellipse/circle nodes so
 * edges meet the curve, not the bounding rect).
 */
export const ellipseBorderToward = (r: Rect, target: Point): Point => {
  const c = rectCenter(r);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const rx = r.w / 2;
  const ry = r.h / 2;
  const denom = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  if (denom === 0) return c;
  return { x: c.x + dx / denom, y: c.y + dy / denom };
};

/** Deterministic 32-bit hash of a string — used for stable rough.js seeds. */
export const hashString = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
