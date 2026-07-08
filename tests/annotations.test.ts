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
