import { describe, expect, it } from "vitest";
import { cameraForBBox, cameraForCenter } from "@engine/camera/fit.js";
import { EASINGS, easingByName } from "@engine/camera/easing.js";

describe("camera fit math", () => {
  it("centers on the bbox center", () => {
    const cam = cameraForBBox({ minX: 100, minY: 200, maxX: 300, maxY: 400 }, { w: 800, h: 600 }, { padding: 0 });
    expect(cam.cx).toBe(200);
    expect(cam.cy).toBe(300);
  });

  it("zooms so the bbox fits within the padded viewport", () => {
    // 200x200 box in an 800x600 viewport, 50px padding -> avail 700x500
    const cam = cameraForBBox({ minX: 0, minY: 0, maxX: 200, maxY: 200 }, { w: 800, h: 600 }, { padding: 50 });
    // min(700/200, 500/200) = min(3.5, 2.5) = 2.5, clamped by maxZoom 2.5
    expect(cam.zoom).toBeCloseTo(2.5, 5);
  });

  it("clamps zoom to maxZoom", () => {
    const cam = cameraForBBox({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { w: 800, h: 600 }, { padding: 0, maxZoom: 3 });
    expect(cam.zoom).toBe(3);
  });

  it("handles empty bbox safely", () => {
    const cam = cameraForBBox({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, { w: 800, h: 600 });
    expect(cam).toEqual({ cx: 0, cy: 0, zoom: 1 });
  });

  it("clamps a huge bbox up to minZoom (0.05)", () => {
    const cam = cameraForBBox({ minX: 0, minY: 0, maxX: 1_000_000, maxY: 1_000_000 }, { w: 800, h: 600 }, { padding: 0 });
    expect(cam.zoom).toBe(0.05);
  });

  it("handles a degenerate zero-size bbox without dividing by zero", () => {
    const cam = cameraForBBox({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, { w: 800, h: 600 }, { padding: 0 });
    expect(cam.cx).toBe(5);
    expect(cam.cy).toBe(5);
    expect(Number.isFinite(cam.zoom)).toBe(true);
    expect(cam.zoom).toBeGreaterThan(0);
  });

  it("cameraForCenter centers at an explicit zoom", () => {
    expect(cameraForCenter({ x: 12, y: 34 }, 1.5)).toEqual({ cx: 12, cy: 34, zoom: 1.5 });
  });
});

describe("easing catalog", () => {
  it("all easings hit the endpoints", () => {
    for (const name of Object.keys(EASINGS) as (keyof typeof EASINGS)[]) {
      const fn = EASINGS[name];
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
  });

  it("linear is identity", () => {
    expect(EASINGS.linear(0.37)).toBeCloseTo(0.37, 6);
  });

  it("ease-out is above linear in the first half (fast start)", () => {
    expect(EASINGS["ease-out"](0.25)).toBeGreaterThan(0.25);
  });

  it("falls back to ease-in-out for unknown names", () => {
    expect(easingByName(undefined)).toBe(EASINGS["ease-in-out"]);
    // @ts-expect-error — exercise the runtime fallback for an unrecognized name
    expect(easingByName("not-a-real-easing")).toBe(EASINGS["ease-in-out"]);
  });

  it("returns the requested easing when the name is valid", () => {
    expect(easingByName("spring")).toBe(EASINGS.spring);
    expect(easingByName("linear")).toBe(EASINGS.linear);
  });
});
