/**
 * The seamless ellipse (0.16.1).
 *
 * rough.js starts an ellipse near 12 o'clock and trails its end past the start
 * and inward (0.98r, then 0.9r) — the overlapping pen of a sketch. Under the
 * pinned tuning the smooth presets declare, that trail read as a notch at the
 * top of every circle, and a camera fit magnified it. Pinned ellipses now draw a
 * closed spline with a periodic wobble; `classic-rough` keeps rough.js's own.
 */
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { seamlessEllipsePath } from "@engine/render/shapes.js";

function strokeOf(src: string): string {
  const { scene, diagnostics } = compileEdd(src);
  expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = new SvgRenderer(host);
  r.mount();
  r.render(scene);
  const node = r.world.querySelector('[data-node="a"]');
  expect(node).not.toBeNull();
  const drawn = [...node!.querySelectorAll("path")].filter((p) => (p.getAttribute("fill") ?? "") === "none");
  return drawn[drawn.length - 1]?.getAttribute("d") ?? "";
}

const points = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

describe("seamless ellipse", () => {
  it("a pinned circle's outline is ONE subpath that ends where it starts", () => {
    const d = strokeOf(`meta { style: hand-clean }\nscene { circle a "Hub" }`);
    expect(d.match(/M/g)?.length).toBe(1);
    expect(d.trim().endsWith("Z")).toBe(true);
    const n = points(d);
    // the last curve's end point is the first move point: no tail, no notch
    expect(n[n.length - 2]).toBeCloseTo(n[0], 5);
    expect(n[n.length - 1]).toBeCloseTo(n[1], 5);
  });

  it("classic-rough keeps rough.js's own sketch ellipse, trail and all", () => {
    const d = strokeOf(`meta { style: classic-rough }\nscene { circle a "Hub" }`);
    // rough.js multi-stroke: two passes, each its own subpath
    expect((d.match(/M/g)?.length ?? 0)).toBeGreaterThan(1);
  });

  it("is deterministic per seed and still hand-drawn (not a perfect circle)", () => {
    const a = seamlessEllipsePath(100, 100, 120, 120, { roughness: 0.45, seed: 7 });
    const b = seamlessEllipsePath(100, 100, 120, 120, { roughness: 0.45, seed: 7 });
    const c = seamlessEllipsePath(100, 100, 120, 120, { roughness: 0.45, seed: 8 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    const n = points(a);
    const radii: number[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) radii.push(Math.hypot(n[i] - 100, n[i + 1] - 100));
    const spread = Math.max(...radii) - Math.min(...radii);
    expect(spread).toBeGreaterThan(0.2); // a hand
    expect(spread).toBeLessThan(6); // not an egg
  });

  it("roughness 0 puts every on-curve point exactly on the ellipse", () => {
    const n = points(seamlessEllipsePath(0, 0, 200, 100, { roughness: 0, seed: 3 }));
    // `M x y` then per segment `C c1x c1y c2x c2y x y`: on-curve points are the
    // move point and every 6th pair after it.
    const onCurve: Array<[number, number]> = [[n[0], n[1]]];
    for (let i = 2 + 4; i + 1 < n.length; i += 6) onCurve.push([n[i], n[i + 1]]);
    expect(onCurve.length).toBeGreaterThan(11);
    for (const [x, y] of onCurve) expect((x * x) / 10000 + (y * y) / 2500).toBeCloseTo(1, 3);
  });
});
