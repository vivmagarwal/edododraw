import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { addEdge, addNode, deleteEdge, deleteElements, reconnectEdge, renameNode, setEdgeLabel, styleNode, writeOverrides } from "@engine/dsl/patch.js";

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

  it("clone sequence (duplicate/paste) round-trips: fresh id, copied fill, offset override", () => {
    // Mirrors EditController.cloneSpecs: addNode -> styleNode(fill) -> writeOverrides.
    let src = addNode(base, { id: "copy1", shape: "rect", label: "Diagrams as CODE" });
    src = styleNode(src, "copy1", { fill: "#a5d8ff" });
    src = writeOverrides(src, [{ id: "copy1", x: 216, y: 116, w: 160, h: 80 }]);
    const { scene, diagnostics } = compileEdd(src);
    expect(diagnostics.errors).toEqual([]);
    const copy = scene.nodes.find((n) => n.id === "copy1")!;
    expect(copy).toBeTruthy();
    expect(copy.label).toBe("Diagrams as CODE");
    expect(copy.x).toBe(216);
    expect(copy.y).toBe(116);
    expect(copy.style.fill).toBeTruthy(); // hex fill accepted + applied
  });

  it("deleteElements removes several nodes + their edges + overrides at once", () => {
    let src = writeOverrides(base, [{ id: "idea", x: 5, y: 5 }, { id: "hello", x: 6, y: 6 }]);
    src = deleteElements(src, ["idea", "hello"]);
    const { scene } = compileEdd(src);
    expect(scene.nodes.some((n) => n.id === "idea" || n.id === "hello")).toBe(false);
    expect(scene.edges.length).toBe(0);
    expect(src).not.toContain("at (5, 5)");
    expect(src).not.toContain("at (6, 6)");
  });

  it("deleteEdge removes a simple arrow, keeping its nodes", () => {
    const src = `scene {\n  rect a "A"\n  rect b "B"\n  a -> b "req"\n}`;
    const out = deleteEdge(src, "a", "b");
    const { scene, diagnostics } = compileEdd(out);
    expect(diagnostics.errors).toEqual([]);
    expect(scene.edges.length).toBe(0);
    expect(scene.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(out).not.toMatch(/a -> b/);
  });

  it("reconnectEdge re-points the 'to' end to another node", () => {
    const src = `scene {\n  rect a "A"\n  rect b "B"\n  rect c "C"\n  a -> b "req"\n}`;
    const out = reconnectEdge(src, "a", "b", "to", "c");
    const { scene, diagnostics } = compileEdd(out);
    expect(diagnostics.errors).toEqual([]);
    expect(scene.edges.some((e) => e.from.node === "a" && e.to.node === "c")).toBe(true);
    expect(scene.edges.some((e) => e.to.node === "b")).toBe(false);
    expect(out).toContain('a -> c "req"'); // label preserved
  });

  it("setEdgeLabel replaces / adds a simple edge label", () => {
    const withLabel = setEdgeLabel(`scene {\n  rect a "A"\n  rect b "B"\n  a -> b "old"\n}`, "a", "b", "new");
    expect(withLabel).toContain('a -> b "new"');
    expect(withLabel).not.toContain('"old"');
    const added = setEdgeLabel(`scene {\n  rect a "A"\n  rect b "B"\n  a -> b\n}`, "a", "b", "hi");
    expect(added).toContain('a -> b "hi"');
    expect(compileEdd(added).diagnostics.errors).toEqual([]);
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
