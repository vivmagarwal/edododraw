/**
 * Geometry primitive tests — src/engine/geometry.ts.
 * bbox math, border-point projection (rect + ellipse), the deterministic string
 * hash used for stable rough.js seeds, and the clamp / lerp scalars.
 */

import { describe, expect, it } from "vitest";
import {
  bboxCenter,
  bboxOfPoints,
  bboxSize,
  bboxUnion,
  borderPointToward,
  clamp,
  ellipseBorderToward,
  emptyBBox,
  expandBBox,
  hashString,
  isEmptyBBox,
  lerp,
  pointInRect,
  rectCenter,
} from "@engine/geometry.js";

describe("bboxUnion", () => {
  it("unions two overlapping boxes to their combined extents", () => {
    const u = bboxUnion({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 5, minY: 5, maxX: 20, maxY: 20 });
    expect(u).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
  });

  it("unions two disjoint boxes", () => {
    const u = bboxUnion({ minX: -30, minY: -5, maxX: -10, maxY: 5 }, { minX: 100, minY: 200, maxX: 120, maxY: 260 });
    expect(u).toEqual({ minX: -30, minY: -5, maxX: 120, maxY: 260 });
  });

  it("is a no-op when unioning a box with the empty bbox", () => {
    const b = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    expect(bboxUnion(b, emptyBBox())).toEqual(b);
  });
});

describe("bboxOfPoints", () => {
  it("computes the tight bbox of a point cloud", () => {
    const b = bboxOfPoints([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: -3, y: 20 },
      { x: 4, y: -8 },
    ]);
    expect(b).toEqual({ minX: -3, minY: -8, maxX: 10, maxY: 20 });
  });

  it("returns an empty bbox for no points", () => {
    const b = bboxOfPoints([]);
    expect(isEmptyBBox(b)).toBe(true);
    expect(b.minX).toBe(Infinity);
    expect(b.maxX).toBe(-Infinity);
  });

  it("handles a single point (zero-area box centered on it)", () => {
    const b = bboxOfPoints([{ x: 7, y: -2 }]);
    expect(b).toEqual({ minX: 7, minY: -2, maxX: 7, maxY: -2 });
    expect(bboxCenter(b)).toEqual({ x: 7, y: -2 });
    expect(bboxSize(b)).toEqual({ w: 0, h: 0 });
  });
});

describe("borderPointToward (rectangle)", () => {
  const r = { x: 0, y: 0, w: 100, h: 60 }; // center (50,30)

  it("projects onto the correct edge for an east target", () => {
    expect(borderPointToward(r, { x: 500, y: 30 })).toEqual({ x: 100, y: 30 });
  });

  it("projects onto the top edge for a target above center", () => {
    expect(borderPointToward(r, { x: 50, y: -400 })).toEqual({ x: 50, y: 0 });
  });

  it("exits through the nearer (top/bottom) edge for a far diagonal target", () => {
    const p = borderPointToward(r, { x: 1000, y: 1000 });
    expect(p.y).toBeCloseTo(60, 6); // clipped by the shorter half-height first
    expect(p.x).toBeGreaterThan(50);
    expect(p.x).toBeLessThan(100);
  });

  it("returns the center when the target is the center (degenerate)", () => {
    expect(borderPointToward(r, rectCenter(r))).toEqual({ x: 50, y: 30 });
  });
});

describe("ellipseBorderToward", () => {
  const r = { x: 0, y: 0, w: 200, h: 100 }; // center (100,50), rx=100, ry=50

  it("returns the due-east point for a target to the east", () => {
    expect(ellipseBorderToward(r, { x: 5000, y: 50 })).toEqual({ x: 200, y: 50 });
  });

  it("always returns a point lying on the ellipse boundary", () => {
    for (const target of [
      { x: 400, y: 400 },
      { x: -300, y: 90 },
      { x: 100, y: -999 },
      { x: 130, y: 62 },
    ]) {
      const p = ellipseBorderToward(r, target);
      const v = ((p.x - 100) / 100) ** 2 + ((p.y - 50) / 50) ** 2;
      expect(v).toBeCloseTo(1, 6);
    }
  });

  it("returns the center for a degenerate (center) target", () => {
    expect(ellipseBorderToward(r, { x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
  });
});

describe("hashString", () => {
  it("is deterministic for the same input", () => {
    expect(hashString("edge-a-b")).toBe(hashString("edge-a-b"));
    expect(hashString("")).toBe(hashString(""));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(hashString("node1")).not.toBe(hashString("node2"));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const s of ["", "x", "a-long-identifier-name", "🙂 unicode", "12345"]) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });

  it("uses the documented FNV-1a offset basis for the empty string", () => {
    expect(hashString("")).toBe(2166136261);
  });
});

describe("clamp", () => {
  it("returns the value when inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps below the low bound and above the high bound", () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
  it("returns the bound when equal to it", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  it("hits both endpoints", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
  it("interpolates the midpoint and quarter point", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
  it("extrapolates for t outside [0,1]", () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe("expandBBox / pointInRect (supporting helpers)", () => {
  it("expandBBox pads all four sides", () => {
    expect(expandBBox({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 5)).toEqual({ minX: -5, minY: -5, maxX: 15, maxY: 15 });
  });
  it("pointInRect is inclusive of the border", () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(pointInRect({ x: 5, y: 5 }, r)).toBe(true);
    expect(pointInRect({ x: 0, y: 0 }, r)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, r)).toBe(true);
    expect(pointInRect({ x: 11, y: 5 }, r)).toBe(false);
  });
});
