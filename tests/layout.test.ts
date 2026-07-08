/**
 * Auto-layout tests — exercises the dag / grid / pinned behaviour of
 * `applyLayout` against small scenes built from the Scene IR factories.
 */

import { describe, expect, it } from "vitest";

import { applyLayout } from "@engine/layout/index.js";
import { emptyScene, makeEdge, makeNode } from "@engine/scene/defaults.js";
import type { Scene, SceneNode } from "@engine/scene/types.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Does the positive-area intersection of two node rects have area > 0? */
function rectsOverlap(a: SceneNode, b: SceneNode): boolean {
  const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return overlapW > 0 && overlapH > 0;
}

/** Assert no pair of nodes overlaps. */
function expectNoOverlap(nodes: SceneNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(
        rectsOverlap(nodes[i], nodes[j]),
        `${nodes[i].id} overlaps ${nodes[j].id}`,
      ).toBe(false);
    }
  }
}

function byId(scene: Scene, id: string): SceneNode {
  const n = scene.nodes.find((node) => node.id === id);
  if (!n) throw new Error(`missing node ${id}`);
  return n;
}

// ---------------------------------------------------------------------------
// dag
// ---------------------------------------------------------------------------

describe("applyLayout — dag (TB)", () => {
  function buildDagScene(): Scene {
    const scene = emptyScene();
    scene.meta.layout = "dag";
    scene.nodes.push(
      makeNode({ id: "A", label: "A" }),
      makeNode({ id: "B", label: "B" }),
      makeNode({ id: "C", label: "C" }),
      makeNode({ id: "D", label: "D" }),
    );
    scene.edges.push(
      makeEdge({ id: "e1", from: "A", to: "B" }),
      makeEdge({ id: "e2", from: "B", to: "C" }),
      makeEdge({ id: "e3", from: "B", to: "D" }),
    );
    return scene;
  }

  it("gives every node a finite position", () => {
    const scene = buildDagScene();
    applyLayout(scene);
    for (const n of scene.nodes) {
      expect(Number.isFinite(n.x), `${n.id}.x finite`).toBe(true);
      expect(Number.isFinite(n.y), `${n.id}.y finite`).toBe(true);
    }
  });

  it("does not overlap any two nodes", () => {
    const scene = buildDagScene();
    applyLayout(scene);
    expectNoOverlap(scene.nodes);
  });

  it("normalises the bounding-box min corner to ~ (40, 40)", () => {
    const scene = buildDagScene();
    applyLayout(scene);
    const minX = Math.min(...scene.nodes.map((n) => n.x));
    const minY = Math.min(...scene.nodes.map((n) => n.y));
    expect(minX).toBeCloseTo(40, 3);
    expect(minY).toBeCloseTo(40, 3);
  });

  it("places downstream nodes below their source (greater y for TB)", () => {
    const scene = buildDagScene();
    applyLayout(scene);
    const a = byId(scene, "A");
    const b = byId(scene, "B");
    const c = byId(scene, "C");
    expect(b.y).toBeGreaterThan(a.y); // B is downstream of A
    expect(c.y).toBeGreaterThan(b.y); // C is downstream of B
  });
});

// ---------------------------------------------------------------------------
// grid
// ---------------------------------------------------------------------------

describe("applyLayout — grid", () => {
  it("arranges nodes in a roughly grid pattern", () => {
    const scene = emptyScene();
    scene.meta.layout = "grid";
    // Uniform sizes so the grid lines up exactly.
    for (const id of ["n0", "n1", "n2", "n3"]) {
      scene.nodes.push(makeNode({ id, label: id, w: 100, h: 60 }));
    }
    applyLayout(scene);

    const [n0, n1, n2, n3] = scene.nodes;

    // 4 nodes -> ceil(sqrt(4)) = 2 columns -> a 2x2 grid, row-major.
    // Row 0 (n0, n1) share a y; row 1 (n2, n3) share a y.
    expect(n0.y).toBeCloseTo(n1.y, 3);
    expect(n2.y).toBeCloseTo(n3.y, 3);
    // Column 0 (n0, n2) share an x; column 1 (n1, n3) share an x.
    expect(n0.x).toBeCloseTo(n2.x, 3);
    expect(n1.x).toBeCloseTo(n3.x, 3);
    // Second row is below the first; second column is right of the first.
    expect(n2.y).toBeGreaterThan(n0.y);
    expect(n1.x).toBeGreaterThan(n0.x);

    expectNoOverlap(scene.nodes);
  });
});

// ---------------------------------------------------------------------------
// pinned
// ---------------------------------------------------------------------------

describe("applyLayout — pinned nodes", () => {
  it("keeps a pinned node's coordinates untouched", () => {
    const scene = emptyScene();
    scene.meta.layout = "grid";
    const pinned = makeNode({ id: "pin", label: "pin", x: 500, y: 500, pinned: true });
    scene.nodes.push(
      pinned,
      makeNode({ id: "a", label: "a", w: 100, h: 60 }),
      makeNode({ id: "b", label: "b", w: 100, h: 60 }),
    );

    applyLayout(scene);

    expect(pinned.x).toBe(500);
    expect(pinned.y).toBe(500);
    // The movable nodes were still positioned.
    for (const id of ["a", "b"]) {
      const n = byId(scene, id);
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// robustness
// ---------------------------------------------------------------------------

describe("applyLayout — robustness", () => {
  it("never throws on an empty scene", () => {
    const scene = emptyScene();
    expect(() => applyLayout(scene)).not.toThrow();
  });

  it("leaves positions alone for manual layout", () => {
    const scene = emptyScene();
    scene.meta.layout = "manual";
    scene.nodes.push(makeNode({ id: "m", label: "m", x: 123, y: 321 }));
    applyLayout(scene);
    const m = byId(scene, "m");
    expect(m.x).toBe(123);
    expect(m.y).toBe(321);
  });
});
