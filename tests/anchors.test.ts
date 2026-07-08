/**
 * Anchor-resolution tests — src/engine/scene/anchors.ts.
 * Verifies compass points, side fractions, polar angles, and the "auto" border
 * point (rect vs ellipse) that makes edges meet a node's outline.
 */

import { describe, expect, it } from "vitest";
import { resolveAnchor } from "@engine/scene/anchors.js";
import { makeNode } from "@engine/scene/defaults.js";
import type { Point } from "@engine/geometry.js";
import type { ShapeKind } from "@engine/scene/types.js";

/** A node whose rect is exactly (0,0)–(100,60) unless overridden. */
function rect(shape: ShapeKind = "rectangle", w = 100, h = 60) {
  return makeNode({ id: "n", shape, x: 0, y: 0, w, h });
}
function near(p: Point, x: number, y: number): void {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
}

describe("resolveAnchor — compass points on a 100×60 rect", () => {
  const r = rect();
  const expected: Array<[string, number, number]> = [
    ["c", 50, 30],
    ["center", 50, 30],
    ["n", 50, 0],
    ["top", 50, 0],
    ["s", 50, 60],
    ["bottom", 50, 60],
    ["e", 100, 30],
    ["right", 100, 30],
    ["w", 0, 30],
    ["left", 0, 30],
    ["ne", 100, 0],
    ["nw", 0, 0],
    ["se", 100, 60],
    ["sw", 0, 60],
  ];
  for (const [name, x, y] of expected) {
    it(`${name} → (${x}, ${y})`, () => near(resolveAnchor(r, name), x, y));
  }

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    near(resolveAnchor(r, "  NE  "), 100, 0);
  });

  it("falls back to the center for an unknown anchor name", () => {
    near(resolveAnchor(r, "banana"), 50, 30);
  });
});

describe("resolveAnchor — side fractions", () => {
  const r = rect(); // 100 wide, 60 tall
  it("top:0.3 → 30% along the top edge", () => near(resolveAnchor(r, "top:0.3"), 30, 0));
  it("right:0.75 → 75% down the right edge", () => near(resolveAnchor(r, "right:0.75"), 100, 45));
  it("bottom:0.5 → midpoint of the bottom edge", () => near(resolveAnchor(r, "bottom:0.5"), 50, 60));
  it("left:0.2 → 20% down the left edge", () => near(resolveAnchor(r, "left:0.2"), 0, 12));

  it("accepts single-letter side aliases (e:0.5)", () => near(resolveAnchor(r, "e:0.5"), 100, 30));

  it("clamps the fraction into [0,1] (top:2 → far corner)", () => near(resolveAnchor(r, "top:2"), 100, 0));

  it("tolerates spaces around the colon", () => near(resolveAnchor(r, "top : 0.3"), 30, 0));
});

describe("resolveAnchor — polar angle (0° = east, CW, y-down)", () => {
  const r = rect(); // center (50,30)
  it("angle:0 → east border", () => near(resolveAnchor(r, "angle:0"), 100, 30));
  it("angle:90 → south border", () => near(resolveAnchor(r, "angle:90"), 50, 60));
  it("angle:180 → west border", () => near(resolveAnchor(r, "angle:180"), 0, 30));

  it("angle:45 lands on the border toward the SE corner", () => {
    const p = resolveAnchor(r, "angle:45");
    // for a 100×60 box the 45° ray exits through the bottom edge
    expect(p.y).toBeCloseTo(60, 6);
    expect(p.x).toBeCloseTo(80, 6);
  });
});

describe("resolveAnchor — auto border point", () => {
  it("aims a rect's border toward a target to the east", () => {
    near(resolveAnchor(rect(), undefined, { x: 500, y: 30 }), 100, 30);
  });

  it("aims a rect's border toward a target above", () => {
    near(resolveAnchor(rect(), "auto", { x: 50, y: -200 }), 50, 0);
  });

  it("returns the center when the target coincides with the center", () => {
    near(resolveAnchor(rect(), undefined, { x: 50, y: 30 }), 50, 30);
  });

  it("uses the ellipse curve (not the bounding rect) for ellipse nodes", () => {
    // 200×100 ellipse → center (100,50), rx=100, ry=50
    const e = rect("ellipse", 200, 100);
    const p = resolveAnchor(e, undefined, { x: 1000, y: 50 });
    near(p, 200, 50); // due-east point on the ellipse
  });

  it("returns a point that lies ON the ellipse boundary for a diagonal target", () => {
    const e = rect("ellipse", 200, 100); // center (100,50), rx=100, ry=50
    const p = resolveAnchor(e, undefined, { x: 1100, y: 550 });
    const onEllipse = ((p.x - 100) / 100) ** 2 + ((p.y - 50) / 50) ** 2;
    expect(onEllipse).toBeCloseTo(1, 6);
  });

  it("treats `circle` shapes like ellipses for auto anchoring", () => {
    const c = rect("circle", 100, 100); // center (50,50), r=50
    near(resolveAnchor(c, undefined, { x: 1000, y: 50 }), 100, 50);
  });
});
