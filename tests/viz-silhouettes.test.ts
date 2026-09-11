/**
 * The three silhouette templates redrawn against real infographics
 * (2026-08-30): head-thoughts, root-causes, balance. These pin the shape
 * decisions, not pixels — one smooth silhouette, a root (and a label) per
 * cause at any count, a balance whose pans hang from the beam ends — and
 * the util helpers the silhouettes are authored with.
 */
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { smoothPath, taperedOutline } from "@engine/viz/generators/util.js";
import type { SceneNode } from "@engine/scene/types.js";

function nodesOf(src: string): SceneNode[] {
  const { scene, diagnostics } = compileEdd(src);
  const errors = diagnostics.items.filter((d) => d.severity === "error");
  expect(errors, errors.map((e) => e.message).join("; ")).toEqual([]);
  return scene.nodes;
}
const item = (n: SceneNode): string | undefined => (n.data as { vizItem?: string } | undefined)?.vizItem;
const role = (n: SceneNode): string | undefined => (n.data as { vizRole?: string } | undefined)?.vizRole;
const inside = (n: SceneNode, box: SceneNode): boolean => n.x >= box.x && n.y >= box.y && n.x + n.w <= box.x + box.w && n.y + n.h <= box.y + box.h;

describe("viz util — silhouette helpers", () => {
  it("smoothPath passes through every anchor as cubic segments and closes", () => {
    const d = smoothPath([[0, 0], [100, 0], [100, 100], [0, 100]]);
    expect(d.startsWith("M0.0,0.0")).toBe(true);
    expect(d.match(/ C/g)?.length).toBe(4);
    expect(d.endsWith(" Z")).toBe(true);
    expect(d).toContain("100.0,100.0");
  });

  it("a corner anchor keeps its crease: the handles leaving it lie on the straight chords", () => {
    const smooth = smoothPath([[0, 0], [100, 0], [100, 100], [0, 100]], { closed: false });
    const creased = smoothPath([[0, 0], [100, 0, "corner"], [100, 100], [0, 100]], { closed: false });
    expect(creased).not.toBe(smooth);
    // second segment leaves the corner along the chord towards (100,100): x stays 100
    const seg = creased.split(" C")[2];
    expect(seg.startsWith("100.0,")).toBe(true);
  });

  it("mirrorX flips the drawing about that x", () => {
    const d = smoothPath([[10, 0], [90, 0], [50, 60]], { mirrorX: 100 });
    expect(d.startsWith("M90.0,0.0")).toBe(true);
    expect(d).toContain("10.0,0.0");
  });

  it("taperedOutline wraps a spine into a closed band that narrows to the tip", () => {
    const spine: Array<[number, number]> = [[0, 0], [0, 50], [0, 100]];
    const out = taperedOutline(spine, 10, 1);
    expect(out.length).toBe(6);
    expect(Math.abs(out[0][0] - out[5][0])).toBeCloseTo(20, 5);
    expect(Math.abs(out[2][0] - out[3][0])).toBeCloseTo(2, 5);
  });
});

describe("viz head-thoughts", () => {
  const src = (facing?: string, n = 4) =>
    `viz head-thoughts "In Their Head" {\n  who: "The buyer"\n${facing ? `  facing: ${facing}\n` : ""}${Array.from({ length: n }, (_, i) => `  item "Thought ${i + 1}" { icon: bulb }`).join("\n")}\n}`;

  it("draws ONE smooth silhouette (cubic segments, no polyline) with a wash", () => {
    const nodes = nodesOf(src());
    const head = nodes.find((n) => n.id.endsWith(".head"))!;
    expect(head.shape).toBe("path");
    const d = (head.data as { d: string }).d;
    expect(d.match(/ C/g)?.length).toBeGreaterThan(20);
    expect(d).not.toContain(" L");
    expect(head.style.fill).toBeTruthy();
  });

  it("every thought sits inside the head at any count, behind the face", () => {
    for (const n of [1, 2, 4, 6]) {
      const nodes = nodesOf(src(undefined, n));
      const head = nodes.find((n) => n.id.endsWith(".head"))!;
      const rows = nodes.filter((n) => role(n) === "label");
      expect(rows.length, `${n} thoughts`).toBe(n);
      for (const r of rows) expect(inside(r, head), `${n} thoughts: ${r.label}`).toBe(true);
      // the face is the right 20% of the box — rows stop before it
      for (const r of rows) expect(r.x + r.w, `${n} thoughts: ${r.label}`).toBeLessThan(head.x + head.w * 0.82);
    }
  });

  it("facing: left mirrors the silhouette in the same box and keeps the rows inside it", () => {
    const right = nodesOf(src());
    const left = nodesOf(src("left"));
    const hr = right.find((n) => n.id.endsWith(".head"))!;
    const hl = left.find((n) => n.id.endsWith(".head"))!;
    expect([hl.x, hl.y, hl.w, hl.h]).toEqual([hr.x, hr.y, hr.w, hr.h]);
    expect((hl.data as { d: string }).d).not.toBe((hr.data as { d: string }).d);
    for (const r of left.filter((n) => role(n) === "label")) {
      expect(inside(r, hl), r.label).toBe(true);
      expect(r.x, r.label).toBeGreaterThan(hl.x + hl.w * 0.15);
    }
  });
});

describe("viz root-causes", () => {
  const src = (n: number) => `viz root-causes "Why" {\n${Array.from({ length: n }, (_, i) => `  item "Cause ${i + 1}" "Because of reason ${i + 1}"`).join("\n")}\n}`;

  it.each([1, 2, 3, 4, 5, 6, 7])("%i cause(s): each has its own root and its label under the tip, no two labels overlap", (n) => {
    const nodes = nodesOf(src(n));
    const trunk = nodes.find((x) => x.id.endsWith(".trunk"))!;
    expect(trunk.shape).toBe("path");
    const ground = trunk.y + trunk.h;
    const ids = new Set(nodes.map(item).filter(Boolean));
    expect(ids.size).toBe(n);
    const labels: SceneNode[] = [];
    for (const id of ids) {
      const mine = nodes.filter((x) => item(x) === id);
      const roots = mine.filter((x) => x.shape === "polygon");
      // the root, its two rootlets, each with a paper layer under its tint
      expect(roots.length, id).toBeGreaterThanOrEqual(3);
      const label = mine.find((x) => role(x) === "label")!;
      const tip = Math.max(...roots.map((r) => r.y + r.h));
      expect(label.y, `${id}: label under the root tip`).toBeGreaterThanOrEqual(tip);
      // the root reaches down from the trunk base
      expect(Math.min(...roots.map((r) => r.y)), `${id}: root starts at the trunk`).toBeLessThan(ground);
      labels.push(label);
    }
    for (const a of labels) for (const b of labels) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x, `${a.label} vs ${b.label}`).toBe(true);
    // the root ball stays full at low counts: neutral filler roots, untagged
    const fillers = nodes.filter((x) => x.shape === "polygon" && !item(x));
    expect(fillers.length > 0, `${n}: fillers`).toBe(n <= 2);
  });
});

describe("viz balance", () => {
  // `crayon` fills translucently — the case the opaque card exists for (the default `classic` is outline-only)
  const src = (tilt: string, rows = 2, style = "classic") =>
    `meta { style: ${style} }\nviz balance "B" {\n  tilt: ${tilt}\n  side "Left" {\n${Array.from({ length: rows }, (_, i) => `    item "Row ${i + 1}" { icon: star }`).join("\n")}\n  }\n  side "Right" {\n    item "Only one"\n  }\n}`;
  const pan = (nodes: SceneNode[], side: string) => nodes.find((n) => n.shape === "path" && item(n)?.endsWith(`.${side}`) && role(n) === "shape")!;

  it("tilt lowers that side's pan; level hangs both pans at one height", () => {
    const level = nodesOf(src("level"));
    expect(pan(level, "left").y).toBeCloseTo(pan(level, "right").y, 6);
    const left = nodesOf(src("left"));
    expect(pan(left, "left").y).toBeGreaterThan(pan(left, "right").y + 30);
    const right = nodesOf(src("right"));
    expect(pan(right, "right").y).toBeGreaterThan(pan(right, "left").y + 30);
  });

  it("the items ride on an opaque card that fits in the pan, however many rows", () => {
    for (const rows of [1, 3, 5]) {
      const nodes = nodesOf(src("level", rows, "crayon"));
      const p = pan(nodes, "left");
      const cards = nodes.filter((n) => n.shape === "round-rectangle" && item(n)?.endsWith(".left"));
      // paper layer + tint layer, same box
      expect(cards.length, `${rows} rows`).toBe(2);
      expect(cards[0].style.fill, "paper under the tint").toBeTruthy();
      expect([cards[1].x, cards[1].w]).toEqual([cards[0].x, cards[0].w]);
      expect(cards[0].w, `${rows} rows: card narrower than the pan`).toBeLessThan(p.w);
      expect(cards[0].y + cards[0].h, `${rows} rows: card sits in the pan`).toBeLessThanOrEqual(p.y);
      const labels = nodes.filter((n) => role(n) === "label" && item(n)?.endsWith(".left"));
      // the rows + the side's name
      expect(labels.length, `${rows} rows`).toBe(rows + 1);
      for (const l of labels.slice(0, rows)) expect(inside(l, cards[0]), l.label).toBe(true);
    }
    // an outline preset has no tint to hide: one paper layer only
    const outlined = nodesOf(src("level", 2)).filter((n) => n.shape === "round-rectangle" && item(n)?.endsWith(".left"));
    expect(outlined.length).toBe(1);
  });
});
