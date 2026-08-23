import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";

describe("annotation round-trip (commit-to-code parses back)", () => {
  it("parses the annotate block the live editor emits", () => {
    const src = `
scene {
  layout dag
  rect a "A"
  rect b "B"
  a --> b
}

annotate "live" {
  highlight a { color: yellow }
  underline b { color: #1971c2 }
  circle-mark a { color: #e8590c }
  point-at b { from: s, color: #1971c2 }
}
`;
    const { scene, diagnostics } = compileEdd(src);
    expect(diagnostics.errors).toEqual([]);
    expect(scene.annotations.length).toBe(4);
    const kinds = scene.annotations.map((a) => a.kind).sort();
    expect(kinds).toEqual(["circle-mark", "highlight", "point-at", "underline"]);
    const hl = scene.annotations.find((a) => a.kind === "highlight")!;
    expect(hl.target.ref).toBe("a");
    const pa = scene.annotations.find((a) => a.kind === "point-at")!;
    expect(pa.target.ref).toBe("b");
    expect(pa.options.from).toBe("s");
  });

  it("supports box over a set and spotlight", () => {
    const src = `
scene { rect a "A"; rect b "B"; a --> b }
annotate {
  box [a, b] "critical path" { color: red }
  spotlight a { dim: 0.7 }
}
`;
    const { scene, diagnostics } = compileEdd(src);
    expect(diagnostics.errors).toEqual([]);
    const box = scene.annotations.find((a) => a.kind === "box")!;
    expect(box.options.members).toEqual(["a", "b"]);
    expect(box.text).toBe("critical path");
    const spot = scene.annotations.find((a) => a.kind === "spotlight")!;
    expect(spot.options.dim).toBe(0.7);
  });
});

// ---- 0.13.1: `render()` alone must not silently drop always-on annotations ----

import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { AnnotationLayer, renderSceneWithAnnotations } from "@engine/annotate/layer.js";

const ANNOTATED = `
scene {
  layout dag
  rect a "A"
  rect b "B"
  a --> b
}

annotate "always" {
  highlight a { color: yellow }
  circle-mark b { color: #e8590c }
}
`;

describe("SvgRenderer.render paints the always-on annotations", () => {
  const mountRenderer = (opts?: { annotations?: boolean }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const r = new SvgRenderer(host, opts);
    r.mount();
    return r;
  };

  it("renders scene.annotations with no second object to construct", () => {
    const { scene, diagnostics } = compileEdd(ANNOTATED);
    expect(diagnostics.errors).toEqual([]);
    const r = mountRenderer();
    r.render(scene);
    expect(r.getLayer("annotations").querySelectorAll("[data-annotation]").length).toBe(2);
  });

  it("re-rendering replaces rather than stacks the marks", () => {
    const { scene } = compileEdd(ANNOTATED);
    const r = mountRenderer();
    r.render(scene);
    r.render(scene);
    expect(r.getLayer("annotations").querySelectorAll("[data-annotation]").length).toBe(2);
  });

  it("an explicit AnnotationLayer still owns the layer (timeline/step control)", () => {
    const { scene } = compileEdd(ANNOTATED);
    const r = mountRenderer();
    r.render(scene);
    new AnnotationLayer(r).render(scene, [], false);
    expect(r.getLayer("annotations").querySelectorAll("[data-annotation]").length).toBe(0);
  });

  it("`annotations: false` opts out for hosts that drive the layer themselves", () => {
    const { scene } = compileEdd(ANNOTATED);
    const r = mountRenderer({ annotations: false });
    r.render(scene);
    expect(r.getLayer("annotations").querySelectorAll("[data-annotation]").length).toBe(0);
  });

  it("renderSceneWithAnnotations is the one-call form (and takes a custom set)", () => {
    const { scene } = compileEdd(ANNOTATED);
    const r = mountRenderer({ annotations: false });
    renderSceneWithAnnotations(r, scene);
    expect(r.getLayer("annotations").querySelectorAll("[data-annotation]").length).toBe(2);
    expect(r.getLayer("nodes").querySelectorAll("[data-node]").length).toBe(2);
    renderSceneWithAnnotations(r, scene, scene.annotations.slice(0, 1));
    expect(r.getLayer("annotations").querySelectorAll("[data-annotation]").length).toBe(1);
  });
});
