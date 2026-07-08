/**
 * Parser + compile tests (via compileEdd). Asserts on the resulting Scene IR:
 * the three node forms, edge chains / fan-outs / labels, attribute-block
 * separators, the diamond-vs-attribute-block brace decision, forward
 * references, duplicate-id merge, and multi-error recovery.
 *
 * Complements dsl-smoke.test.ts (end-to-end examples) with focused grammar
 * coverage.
 */

import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import type { Scene, SceneEdge, SceneNode } from "@engine/scene/types.js";

function node(scene: Scene, id: string): SceneNode {
  const n = scene.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`missing node ${id} (have: ${scene.nodes.map((x) => x.id).join(",")})`);
  return n;
}
function edgeBetween(scene: Scene, from: string, to: string): SceneEdge | undefined {
  return scene.edges.find((e) => e.from.node === from && e.to.node === to);
}

describe("parser — node forms", () => {
  it("lowers mermaid shape sugar to the right shapes + labels", () => {
    const { scene, diagnostics } = compileEdd(`
scene {
  r[Rectangle]
  p([Pill])
  c((Circle))
  d{Diamond}
  cy[(Cylinder)]
}
`);
    expect(diagnostics.hasErrors).toBe(false);
    expect(node(scene, "r").shape).toBe("rectangle");
    expect(node(scene, "p").shape).toBe("pill");
    expect(node(scene, "c").shape).toBe("circle");
    expect(node(scene, "d").shape).toBe("diamond");
    expect(node(scene, "cy").shape).toBe("cylinder");
    // sugar labels are captured raw
    expect(node(scene, "r").label).toBe("Rectangle");
    expect(node(scene, "p").label).toBe("Pill");
    expect(node(scene, "cy").label).toBe("Cylinder");
  });

  // `{{Label}}` brace sugar -> hexagon (regression: the shape used to be
  // dropped and fell back to diamond; parseNodeBlock now forwards cap.shape).
  it("lowers `a{{X}}` hexagon sugar and `a{X}` diamond sugar", () => {
    const { scene } = compileEdd(`scene { h{{Gateway}}; d{Decide?} }`);
    expect(node(scene, "h").shape).toBe("hexagon");
    expect(node(scene, "h").label).toBe("Gateway");
    expect(node(scene, "d").shape).toBe("diamond");
    expect(node(scene, "d").label).toBe("Decide?");
  });

  it("captures inline brace sugar on edge endpoints (diamond/hexagon)", () => {
    const { scene, diagnostics } = compileEdd(`scene { a[Work] --> c{OK?} --> gw{{Gateway}}; a -> c { color: red } }`);
    expect(diagnostics.hasErrors).toBe(false);
    expect(node(scene, "c").shape).toBe("diamond");
    expect(node(scene, "c").label).toBe("OK?");
    expect(node(scene, "gw").shape).toBe("hexagon");
    // the `{ color: red }` after `a -> c` is an edge attr block, not a node
    const edge = scene.edges.find((e) => e.from.node === "a" && e.to.node === "c" && e.style.stroke === "#e03131");
    expect(edge).toBeTruthy();
  });

  it("accepts brace sugar followed by an attribute block", () => {
    const { scene, diagnostics } = compileEdd(`scene { gw{{API Gateway}} { fill: violet }; d{Decide?} { fill: yellow } }`);
    expect(diagnostics.hasErrors).toBe(false);
    expect(node(scene, "gw").shape).toBe("hexagon");
    expect(node(scene, "gw").style.fill).toBeTruthy();
    expect(node(scene, "d").shape).toBe("diamond");
    expect(node(scene, "d").style.fill).toBeTruthy();
  });

  it("parses the keyword node form `cylinder db \"Postgres\"`", () => {
    const { scene, diagnostics } = compileEdd(`scene { cylinder db "Postgres" }`);
    expect(diagnostics.hasErrors).toBe(false);
    expect(node(scene, "db").shape).toBe("cylinder");
    expect(node(scene, "db").label).toBe("Postgres");
  });

  it("parses the explicit node form `node x \"L\" as diamond`", () => {
    const { scene, diagnostics } = compileEdd(`scene { node x "Choose" as diamond }`);
    expect(diagnostics.hasErrors).toBe(false);
    expect(node(scene, "x").shape).toBe("diamond");
    expect(node(scene, "x").label).toBe("Choose");
  });

  it("defaults a bare id node to a rectangle labelled by its id", () => {
    const { scene } = compileEdd(`scene { plain }`);
    expect(node(scene, "plain").shape).toBe("rectangle");
    expect(node(scene, "plain").label).toBe("plain");
  });
});

describe("parser — edges", () => {
  it("lowers a chain `a -> b -> c` into 2 edges", () => {
    const { scene } = compileEdd(`scene { a -> b -> c }`);
    expect(scene.edges.length).toBe(2);
    expect(edgeBetween(scene, "a", "b")).toBeTruthy();
    expect(edgeBetween(scene, "b", "c")).toBeTruthy();
    expect(edgeBetween(scene, "a", "c")).toBeFalsy();
  });

  it("fans out `a -> b & c` into 2 edges from the same source", () => {
    const { scene } = compileEdd(`scene { a -> b & c }`);
    expect(scene.edges.length).toBe(2);
    expect(edgeBetween(scene, "a", "b")).toBeTruthy();
    expect(edgeBetween(scene, "a", "c")).toBeTruthy();
  });

  it("fans in `a & b -> c` into 2 edges into the same target", () => {
    const { scene } = compileEdd(`scene { a & b -> c }`);
    expect(scene.edges.length).toBe(2);
    expect(edgeBetween(scene, "a", "c")).toBeTruthy();
    expect(edgeBetween(scene, "b", "c")).toBeTruthy();
  });

  it("reads a mid label `a -->|yes| b`", () => {
    const { scene } = compileEdd(`scene { a -->|yes| b }`);
    const e = edgeBetween(scene, "a", "b")!;
    expect(e.label).toBe("yes");
  });

  it("reads a trailing quoted label `a -> b \"go\"`", () => {
    const { scene } = compileEdd(`scene { a -> b "go" }`);
    expect(edgeBetween(scene, "a", "b")!.label).toBe("go");
  });

  it("applies a mid label per hop but not the trailing label across a chain", () => {
    const { scene } = compileEdd(`scene { a -->|first| b --> c }`);
    expect(edgeBetween(scene, "a", "b")!.label).toBe("first");
    expect(edgeBetween(scene, "b", "c")!.label).toBe("");
  });
});

describe("parser — attribute blocks", () => {
  it("accepts commas AND newlines as attribute separators", () => {
    const { scene, diagnostics } = compileEdd(`
scene {
  rect a "A" { fill: red, stroke: blue }
  rect b "B" {
    fill: green
    stroke: yellow
  }
}
`);
    expect(diagnostics.hasErrors).toBe(false);
    // named colors resolve through the palette (fill -> soft bg, stroke -> hue)
    expect(node(scene, "a").style.fill).toBe("#ffc9c9"); // red soft fill
    expect(node(scene, "a").style.stroke).toBe("#1971c2"); // blue stroke
    expect(node(scene, "b").style.fill).toBe("#b2f2bb"); // green soft fill
    expect(node(scene, "b").style.stroke).toBe("#f08c00"); // yellow stroke
  });

  it("accepts `=` as well as `:` inside attribute entries", () => {
    const { scene } = compileEdd(`scene { rect a "A" { fill = red } }`);
    expect(node(scene, "a").style.fill).toBe("#ffc9c9");
  });
});

describe("parser — the D1 brace decision (diamond label vs attribute block)", () => {
  it("treats `d{Label}` as a DIAMOND node (raw label capture)", () => {
    const { scene } = compileEdd(`scene { d{Is Ready?} }`);
    expect(node(scene, "d").shape).toBe("diamond");
    expect(node(scene, "d").label).toBe("Is Ready?");
  });

  it("treats `n { fill: red }` as an ATTRIBUTE block (rectangle node)", () => {
    const { scene } = compileEdd(`scene { n { fill: red } }`);
    const n = node(scene, "n");
    expect(n.shape).toBe("rectangle");
    expect(n.style.fill).toBe("#ffc9c9");
    expect(n.label).toBe("n"); // no label supplied → id
  });

  it("treats an empty `{}` as an attribute block, not a diamond", () => {
    const { scene } = compileEdd(`scene { e {} }`);
    expect(node(scene, "e").shape).toBe("rectangle");
  });
});

describe("parser — references + merging", () => {
  it("creates forward-referenced nodes from edges alone", () => {
    const { scene } = compileEdd(`scene { start -> middle -> end }`);
    expect(scene.nodes.map((n) => n.id).sort()).toEqual(["end", "middle", "start"]);
    // an edge-only node is labelled by its id
    expect(node(scene, "end").label).toBe("end");
  });

  it("merges duplicate ids: later label wins, earlier shape is retained", () => {
    const { scene } = compileEdd(`
scene {
  rect a "First"
  a "Second"
}
`);
    // exactly one node for id `a`
    expect(scene.nodes.filter((n) => n.id === "a").length).toBe(1);
    expect(node(scene, "a").shape).toBe("rectangle"); // kept from the rect decl
    expect(node(scene, "a").label).toBe("Second"); // overridden by the later decl
  });

  it("accumulates classes across a duplicate id (`a:::x` then `a:::y`)", () => {
    const { scene } = compileEdd(`
style .x { stroke: red }
style .y { fill: green }
scene {
  a:::x "A"
  a:::y
}
`);
    const classes = (node(scene, "a").data as { classes?: string[] }).classes ?? [];
    expect(classes).toContain("x");
    expect(classes).toContain("y");
    // both class styles cascaded onto the single node
    expect(node(scene, "a").style.stroke).toBe("#e03131"); // red from .x
    expect(node(scene, "a").style.fill).toBe("#b2f2bb"); // green soft fill from .y
  });
});

describe("parser — error recovery", () => {
  it("reports garbage lines but still compiles the good statements", () => {
    const { scene, diagnostics } = compileEdd(`
scene {
  rect a "A"
  ??? total nonsense !!!
  rect b "B"
  a -> b
}
`);
    expect(diagnostics.items.length).toBeGreaterThan(0);
    // the surrounding good statements survived
    expect(node(scene, "a")).toBeTruthy();
    expect(node(scene, "b")).toBeTruthy();
    expect(edgeBetween(scene, "a", "b")).toBeTruthy();
  });

  it("reports an unknown top-level construct but keeps a valid scene", () => {
    const { scene, diagnostics } = compileEdd(`
wibble wobble
scene { rect a "A" }
`);
    expect(diagnostics.hasErrors).toBe(true);
    expect(diagnostics.items.some((d) => d.code === "E-TOP")).toBe(true);
    expect(node(scene, "a").label).toBe("A");
  });
});
