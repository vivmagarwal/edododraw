import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CameraController, autoDuration, lerp, logLerp } from "@engine/camera/controller.js";
import type { CameraTransform } from "@engine/render/svgRenderer.js";
import { compileEdd } from "@engine/dsl/index.js";

// --- deterministic rAF + performance.now so we can drive the tween frame-by-frame ---
let now = 0;
let rafQueue: Array<(t: number) => void> = [];

beforeEach(() => {
  now = 0;
  rafQueue = [];
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => rafQueue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

/** Advance the clock and run every frame currently queued (each may queue the next). */
function advance(ms: number): void {
  now += ms;
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(now);
}

/** Minimal SvgRenderer stub — just the surface CameraController touches. */
function makeRenderer(vp = { w: 800, h: 600 }) {
  let cam: CameraTransform = { cx: 0, cy: 0, zoom: 1 };
  const r = {
    getCamera: () => cam,
    applyCamera: (c: CameraTransform) => { cam = { ...c }; },
    getViewportSize: () => vp,
    screenToWorld: (p: { x: number; y: number }) => ({
      x: cam.cx + (p.x - vp.w / 2) / cam.zoom,
      y: cam.cy + (p.y - vp.h / 2) / cam.zoom,
    }),
  };
  return { r, get cam() { return cam; } };
}

function make() {
  const rr = makeRenderer();
  const c = new CameraController(rr.r as never);
  return { c, rr };
}

describe("camera timing/interp math", () => {
  it("logLerp interpolates zoom in log space (1x->4x passes through 2x at t=0.5)", () => {
    expect(logLerp(1, 4, 0)).toBeCloseTo(1);
    expect(logLerp(1, 4, 0.5)).toBeCloseTo(2);
    expect(logLerp(1, 4, 1)).toBeCloseTo(4);
    expect(lerp(0, 100, 0.25)).toBe(25);
  });

  it("autoDuration is clamped to 420..1300 and grows with travel + zoom change", () => {
    const still = { cx: 0, cy: 0, zoom: 1 };
    expect(autoDuration(still, still)).toBe(420); // no move -> floor
    expect(autoDuration(still, { cx: 100000, cy: 0, zoom: 1 })).toBe(1300); // far -> ceiling
    expect(autoDuration(still, { cx: 0, cy: 0, zoom: 4 })).toBeGreaterThan(420); // zoom change adds time
    expect(autoDuration(still, { cx: 0, cy: 0, zoom: 4 })).toBeLessThanOrEqual(1300);
  });
});

describe("CameraController immediate ops", () => {
  it("setImmediate applies the camera and fires onFrame", () => {
    const { c, rr } = make();
    const seen: CameraTransform[] = [];
    c.onFrame = (cam) => seen.push(cam);
    c.setImmediate({ cx: 5, cy: 6, zoom: 2 });
    expect(rr.cam).toEqual({ cx: 5, cy: 6, zoom: 2 });
    expect(seen).toEqual([{ cx: 5, cy: 6, zoom: 2 }]);
  });

  it("zoomBy clamps the resulting zoom to 0.05..8", () => {
    const { c } = make();
    c.setImmediate({ cx: 0, cy: 0, zoom: 1 });
    c.zoomBy(100);
    expect(c.current.zoom).toBe(8);
    c.setImmediate({ cx: 0, cy: 0, zoom: 1 });
    c.zoomBy(0.0001);
    expect(c.current.zoom).toBe(0.05);
  });

  it("zoomBy keeps the world point under the anchor fixed", () => {
    const { c, rr } = make();
    c.setImmediate({ cx: 0, cy: 0, zoom: 1 });
    const anchor = { x: 600, y: 300 }; // off-center
    const before = rr.r.screenToWorld(anchor);
    c.zoomBy(2, anchor);
    const after = rr.r.screenToWorld(anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(c.current.zoom).toBe(2);
  });

  it("panByScreen converts a screen delta to world (dx/zoom)", () => {
    const { c } = make();
    c.setImmediate({ cx: 0, cy: 0, zoom: 2 });
    c.panByScreen(20, 40);
    expect(c.current).toEqual({ cx: -10, cy: -20, zoom: 2 });
  });
});

describe("CameraController tween", () => {
  it("animateTo with duration 0 snaps immediately and resolves", async () => {
    const { c, rr } = make();
    const p = c.animateTo({ cx: 9, cy: 9, zoom: 3 }, { durationMs: 0 });
    expect(rr.cam).toEqual({ cx: 9, cy: 9, zoom: 3 });
    await expect(p).resolves.toBeUndefined();
  });

  it("tween eases position linearly and zoom in log space, then resolves", async () => {
    const { c } = make();
    c.setImmediate({ cx: 0, cy: 0, zoom: 1 });
    const p = c.animateTo({ cx: 100, cy: 0, zoom: 4 }, { durationMs: 1000, easing: "linear" });
    advance(0); // start frame (t=0)
    advance(500); // t=0.5
    expect(c.current.cx).toBeCloseTo(50); // linear midpoint
    expect(c.current.zoom).toBeCloseTo(2); // log midpoint of 1..4
    advance(500); // t=1
    expect(c.current.cx).toBeCloseTo(100);
    expect(c.current.zoom).toBeCloseTo(4);
    await expect(p).resolves.toBeUndefined();
  });

  it("mid-flight animateTo retargets from the current interpolated state and resolves the superseded move", async () => {
    const { c } = make();
    c.setImmediate({ cx: 0, cy: 0, zoom: 1 });
    let firstResolved = false;
    const p1 = c.animateTo({ cx: 100, cy: 0, zoom: 1 }, { durationMs: 1000, easing: "linear" });
    void p1.then(() => { firstResolved = true; });
    advance(0);
    advance(500); // cx now 50
    expect(c.current.cx).toBeCloseTo(50);
    c.animateTo({ cx: 100, cy: 100, zoom: 1 }, { durationMs: 1000, easing: "linear" }); // retarget from (50,0)
    await Promise.resolve(); // flush the superseded promise's microtask
    expect(firstResolved).toBe(true);
    advance(500); // half of (50,0)->(100,100)
    expect(c.current.cx).toBeCloseTo(75);
    expect(c.current.cy).toBeCloseTo(50);
  });

  it("stop() resolves the in-flight tween promise (no leak)", async () => {
    const { c } = make();
    c.setImmediate({ cx: 0, cy: 0, zoom: 1 });
    let resolved = false;
    const p = c.animateTo({ cx: 100, cy: 0, zoom: 1 }, { durationMs: 1000 });
    void p.then(() => { resolved = true; });
    advance(100);
    c.stop();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});

describe("CameraController high-level fit ops", () => {
  const src = `scene {\n  layout dag\n  rect a "A"\n  rect b "B"\n  a --> b\n}`;
  const scene = compileEdd(src).scene;

  it("fitAll frames the scene within the default (<=2.5x) zoom", async () => {
    const { c } = make();
    await c.fitAll(scene, { durationMs: 0 });
    expect(c.current.zoom).toBeGreaterThan(0);
    expect(c.current.zoom).toBeLessThanOrEqual(2.5);
  });

  it("focus honors an explicit zoom (bypassing the fit clamp)", async () => {
    const { c } = make();
    await c.focus(scene, ["a"], { durationMs: 0, zoom: 6 });
    expect(c.current.zoom).toBe(6); // explicit zoom is applied uncapped
  });

  it("focus with an unresolved id falls back to a finite fit-all camera", async () => {
    const { c } = make();
    await c.focus(scene, ["does-not-exist"], { durationMs: 0 });
    expect(Number.isFinite(c.current.zoom)).toBe(true);
    expect(Number.isFinite(c.current.cx)).toBe(true);
  });
});
