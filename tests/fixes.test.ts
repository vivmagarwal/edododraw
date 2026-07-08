import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { resolveAnchor } from "@engine/scene/anchors.js";
import { makeNode } from "@engine/scene/defaults.js";
import { registerBuiltinShapes } from "@engine/plugins/builtins.js";
import { getShapePlugin, listShapePlugins } from "@engine/plugins/registry.js";

describe("doc-validation regressions", () => {
  it("D1: built-in star shape is registered (survives lib build path)", () => {
    registerBuiltinShapes();
    expect(typeof getShapePlugin("star")).toBe("function");
    expect(listShapePlugins()).toContain("star");
  });

  it("D2: side-fraction and angle anchors parse on edge endpoints", () => {
    const { scene, diagnostics } = compileEdd(`scene {
      rect a "A"; rect b "B"
      a.top:0.3 -> b
      a.angle:45 -> b { }
      a@(1, 0.5) -> b
    }`);
    expect(diagnostics.errors).toEqual([]);
    // anchors are carried onto the edges
    const anchors = scene.edges.map((e) => e.from.anchor);
    expect(anchors).toContain("top:0.3");
    expect(anchors).toContain("angle:45");
    expect(anchors.some((a) => a && a.startsWith("@"))).toBe(true);
  });

  it("D2b: @(u,v) resolves to the right point on a node box", () => {
    const n = makeNode({ id: "n", x: 100, y: 200, w: 200, h: 100 });
    // u=1, v=0.5 -> right-middle
    const p = resolveAnchor(n, "@1,0.5");
    expect(p.x).toBeCloseTo(300, 5); // 100 + 200*1
    expect(p.y).toBeCloseTo(250, 5); // 200 + 100*0.5
    // side fraction top:0.25 -> 25% along the top edge
    const p2 = resolveAnchor(n, "top:0.25");
    expect(p2.x).toBeCloseTo(150, 5); // 100 + 200*0.25
    expect(p2.y).toBeCloseTo(200, 5); // top edge
  });
});
