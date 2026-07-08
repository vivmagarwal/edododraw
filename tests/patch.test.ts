import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { addEdge, addNode, deleteElements, renameNode, styleNode, writeOverrides } from "@engine/dsl/patch.js";

const node = (src: string, id: string) => compileEdd(src).scene.nodes.find((n) => n.id === id);

describe("source patcher (direct-edit round-trip)", () => {
  const base = `scene {
  layout dag
  ellipse hello "Hello"
  rect idea "Diagrams as CODE" { fill: blue }
  hello --> idea
}`;

  it("writeOverrides pins nodes at coords, compileEdd honors them", () => {
    const src = writeOverrides(base, [
      { id: "idea", x: 400, y: 250 },
      { id: "hello", x: 400, y: 100, w: 160, h: 90 },
    ]);
    expect(src).toContain("overrides {");
    expect(src).toContain("idea at (400, 250)");
    expect(src).toContain("hello at (400, 100) size (160, 90)");
    const { scene, diagnostics } = compileEdd(src);
    expect(diagnostics.errors).toEqual([]);
    const idea = scene.nodes.find((n) => n.id === "idea")!;
    expect(idea.x).toBe(400);
    expect(idea.y).toBe(250);
    expect(idea.pinned).toBe(true);
    const hello = scene.nodes.find((n) => n.id === "hello")!;
    expect(hello.w).toBe(160);
    expect(hello.h).toBe(90);
  });

  it("writeOverrides replaces an existing block (not duplicate)", () => {
    let src = writeOverrides(base, [{ id: "idea", x: 1, y: 2 }]);
    src = writeOverrides(src, [{ id: "idea", x: 9, y: 9 }]);
    expect((src.match(/overrides \{/g) ?? []).length).toBe(1);
    expect(src).toContain("idea at (9, 9)");
  });

  it("renameNode replaces the label in place", () => {
    const src = renameNode(base, "idea", "API Service");
    expect(src).toContain('rect idea "API Service"');
    expect(src).not.toContain("Diagrams as CODE");
    expect(node(src, "idea")!.label).toBe("API Service");
  });

  it("styleNode upserts fill/stroke/shape attrs", () => {
    const src = styleNode(base, "idea", { fill: "green", shape: "round-rect" });
    const n = node(src, "idea")!;
    expect(n.shape).toBe("round-rectangle");
    expect(compileEdd(src).diagnostics.errors).toEqual([]);
    // existing fill:blue replaced with green
    expect(src).toMatch(/idea "Diagrams as CODE" \{[^}]*fill: green/);
  });

  it("styleNode adds an attr block when the node has none", () => {
    const src = styleNode(base, "hello", { fill: "yellow" });
    expect(src).toMatch(/ellipse hello "Hello" \{ fill: yellow \}/);
    expect(node(src, "hello")!.style.fill).toBeTruthy();
  });

  it("styleNode appends new attrs cleanly (no stray space before the comma)", () => {
    // regression: inserting beside an existing attr used to yield `yellow , shape`
    const withAttr = `scene {\n  ellipse hello "Hi" { fill: yellow }\n}`;
    const src = styleNode(withAttr, "hello", { fill: "green", shape: "hexagon" });
    expect(src).toContain("{ fill: green, shape: hexagon }");
    expect(src).not.toMatch(/ ,/); // never a space directly before a comma
  });

  it("addNode + addEdge append to the scene", () => {
    let src = addNode(base, { id: "db", shape: "cylinder", label: "Postgres" });
    src = addEdge(src, { from: "idea", to: "db", label: "store" });
    const { scene, diagnostics } = compileEdd(src);
    expect(diagnostics.errors).toEqual([]);
    expect(scene.nodes.find((n) => n.id === "db")!.shape).toBe("cylinder");
    expect(scene.edges.some((e) => e.from.node === "idea" && e.to.node === "db")).toBe(true);
  });

  it("deleteElements removes a node + its edges + its override", () => {
    let src = writeOverrides(base, [{ id: "idea", x: 5, y: 5 }]);
    src = deleteElements(src, ["idea"]);
    const { scene } = compileEdd(src);
    expect(scene.nodes.some((n) => n.id === "idea")).toBe(false);
    expect(scene.edges.some((e) => e.to.node === "idea")).toBe(false);
    expect(src).not.toContain("idea at (5, 5)");
  });
});
