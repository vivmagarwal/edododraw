/**
 * Tree/fan-shaped visualizations: mindmap (+ side/orientation variants),
 * decision, root-causes, converge/lens, diverge, prism.
 * Geometry follows design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { NodeStyle } from "../../scene/types.js";
import { polar, rad, radialAlign } from "./util.js";

// ---- shared helpers ----------------------------------------------------------

/** Sample a cubic bezier into a polyline (for smooth S-curve connectors). */
function cubicPts(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], segs = 16): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

/** S-curve with horizontal tangents at both ends (mindmap/converge fans). */
function sCurveH(x1: number, y1: number, x2: number, y2: number, segs = 16): Array<[number, number]> {
  const mx = (x1 + x2) / 2;
  return cubicPts([x1, y1], [mx, y1], [mx, y2], [x2, y2], segs);
}

/** Rounded elbow corner: quadratic p0 → (control c) → p1, sampled. */
function qCorner(p0: [number, number], c: [number, number], p1: [number, number], segs = 6): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}

/** Neutral outline style (canopy, lens, prism glyphs). */
function outline(ctx: VizContext, color: string, strokeWidth?: number): Partial<NodeStyle> {
  return { stroke: color, fill: null, fillStyle: "none", strokeWidth: strokeWidth ?? ctx.preset.strokeWidth, roughness: ctx.preset.roughness };
}

/** Small solid dot (leader-line endpoints, diverge hub). */
function dot(ctx: VizContext, cx: number, cy: number, d: number): void {
  ctx.shape("circle", cx - d / 2, cy - d / 2, d, d, { stroke: ctx.ink, fill: ctx.ink, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 });
}

/** Tag `fn`'s elements as item `itemId` when the emission belongs to a real
 *  data item — roots/questions/outputs may instead come from the title or a
 *  block option, in which case they stay untagged. */
function scoped(ctx: VizContext, itemId: string | undefined, fn: () => void): void {
  if (itemId) ctx.item(itemId, fn);
  else fn();
}

/**
 * A tapering root sliver: a closed outline that starts `halfW` wide at `base`,
 * bows sideways (`bow` = -1|0|1), and narrows to a point `len` away at `ang°`.
 * Returns the boundary points + the tip. Reads like a real tree root.
 */
function taperRoot(base: [number, number], angDeg: number, len: number, halfW: number, bow: number): { outline: Array<[number, number]>; tip: [number, number] } {
  const a = rad(angDeg);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const tip: [number, number] = [base[0] + dx * len, base[1] + dy * len];
  const ctrl: [number, number] = [base[0] + dx * len * 0.55 + px * bow * len * 0.17, base[1] + dy * len * 0.55 + py * bow * len * 0.17];
  const segs = 14;
  const spine: Array<[number, number]> = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = 1 - t;
    spine.push([u * u * base[0] + 2 * u * t * ctrl[0] + t * t * tip[0], u * u * base[1] + 2 * u * t * ctrl[1] + t * t * tip[1]]);
  }
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = spine[i];
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(segs, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const w = halfW * (1 - t) * (1 - t * 0.15); // taper to a point
    left.push([p[0] - ty * w, p[1] + tx * w]);
    right.push([p[0] + ty * w, p[1] - tx * w]);
  }
  return { outline: [...left, ...right.reverse()], tip };
}

/** Measured wrapped text for a small labelled box (mindmap nodes). */
function nodeBox(ctx: VizContext, label: string, fs: number, maxW: number, padX: number): { text: string; w: number; h: number } {
  const text = ctx.wrap(label, maxW, fs, "heading", 2);
  const lines = text.split("\n");
  const w = Math.max(...lines.map((l) => ctx.measure(l, fs, "heading")), fs) + padX * 2;
  const h = lines.length * fs * 1.35 + fs * 0.8;
  return { text, w, h };
}

// ---- mindmap (+ variants) ------------------------------------------------------

interface MindmapRoot {
  /** Set when the root is a real data item (drives per-item tagging). */
  id?: string;
  label: string;
  detail?: string;
  color?: string;
}

/**
 * Root resolution: an explicit `root`/`center` entry wins; else a lone
 * top-level item with children is the root; else spec.title is the root and
 * every top-level item is a branch.
 */
function resolveMindmap(spec: VizSpec): { root: MindmapRoot; branches: VizItem[]; fromTitle: boolean } {
  const explicit = spec.items.find((i) => i.kind === "root" || i.kind === "center");
  if (explicit) {
    return { root: explicit, branches: [...explicit.children, ...spec.items.filter((i) => i !== explicit)], fromTitle: false };
  }
  const top = spec.items;
  if (top.length === 1 && top[0].children.length) return { root: top[0], branches: top[0].children, fromTitle: false };
  if (spec.title) return { root: { label: spec.title }, branches: top, fromTitle: true };
  if (top.length > 1) return { root: top[0], branches: [...top[0].children, ...top.slice(1)], fromTitle: false };
  return { root: { id: top[0]?.id, label: top[0]?.label ?? "Topic" }, branches: top[0]?.children ?? [], fromTitle: false };
}

/** Vertical stack of clusters with given heights → center-y of each, centred on 0. */
function stackCenters(heights: number[], gap: number): number[] {
  const total = heights.reduce((s, h) => s + h, 0) + Math.max(0, heights.length - 1) * gap;
  let cursor = -total / 2;
  return heights.map((h) => {
    const c = cursor + h / 2;
    cursor += h + gap;
    return c;
  });
}

const CHILD_PITCH = 38;

/** Draw a branch node + its children column + connectors. dir: +1 right / -1 left. */
function drawBranchCluster(ctx: VizContext, branch: VizItem, roleIdx: number, n: number, rootEdge: [number, number], branchX: number, cy: number, dir: 1 | -1): void {
  const role = ctx.role(roleIdx, { n, color: branch.color });
  const bb = nodeBox(ctx, branch.label, 15, 170, 12);
  const bx = dir > 0 ? branchX : branchX - bb.w;
  ctx.item(branch.id, () => {
    ctx.shape("round-rectangle", bx, cy - bb.h / 2, bb.w, bb.h, role, {
      id: ctx.uid(branch.id),
      label: bb.text,
      style: { fontSize: 15 },
    });
    // root → branch fan (connector color from the preset)
    ctx.line(sCurveH(rootEdge[0], rootEdge[1], dir > 0 ? bx - 2 : bx + bb.w + 2, cy), { color: ctx.preset.edge, width: 1.8 });
  });
  // children column, further out, in the branch color
  const kids = branch.children;
  if (!kids.length) return;
  const childGap = 56;
  const startY = cy - ((kids.length - 1) * CHILD_PITCH) / 2;
  const branchEdgeX = dir > 0 ? bx + bb.w : bx;
  kids.forEach((child, k) =>
    ctx.item(child.id, () => {
      const kRole = ctx.role(roleIdx, { n, color: child.color ?? role.color });
      const kb = nodeBox(ctx, child.label, 12, 150, 10);
      const ky = startY + k * CHILD_PITCH;
      const kx = dir > 0 ? branchEdgeX + childGap : branchEdgeX - childGap - kb.w;
      ctx.shape("round-rectangle", kx, ky - kb.h / 2, kb.w, kb.h, kRole, {
        id: ctx.uid(child.id),
        label: kb.text,
        style: { fontSize: 12 },
      });
      ctx.line(sCurveH(branchEdgeX + dir * 2, cy, dir > 0 ? kx - 2 : kx + kb.w + 2, ky, 14), { color: role.color, width: 1.5 });
    }),
  );
}

function clusterHeight(branch: VizItem, minH: number): number {
  return Math.max(minH, branch.children.length * CHILD_PITCH + 10);
}

/** mindmap / mindmap-left / mindmap-right — root centered, branch fans per side. */
function genMindmapSides(spec: VizSpec, ctx: VizContext, side: "both" | "left" | "right"): void {
  const { root, branches, fromTitle } = resolveMindmap(spec);
  if (fromTitle) ctx.titleHandled = true;
  const n = Math.max(branches.length, 1);
  const rb = nodeBox(ctx, root.label, 16, 200, 16);
  const rootW = Math.max(rb.w, 120);
  const rootH = Math.max(rb.h, 46);
  const rootRole = ctx.role(0, { neutral: true, color: root.color });
  scoped(ctx, root.id, () => {
    ctx.shape("round-rectangle", -rootW / 2, -rootH / 2, rootW, rootH, rootRole, { id: ctx.uid("root"), label: rb.text, style: { fontSize: 16 } });
  });

  const right: Array<{ item: VizItem; idx: number }> = [];
  const left: Array<{ item: VizItem; idx: number }> = [];
  branches.forEach((item, idx) => {
    if (side === "left") left.push({ item, idx });
    else if (side === "right") right.push({ item, idx });
    else (idx < Math.ceil(branches.length / 2) ? right : left).push({ item, idx });
  });

  const gap = 36;
  const branchGapX = 130;
  for (const [list, dir] of [
    [right, 1],
    [left, -1],
  ] as Array<[Array<{ item: VizItem; idx: number }>, 1 | -1]>) {
    if (!list.length) continue;
    const centers = stackCenters(
      list.map(({ item }) => clusterHeight(item, 52)),
      gap,
    );
    list.forEach(({ item, idx }, j) => {
      const branchX = dir > 0 ? rootW / 2 + branchGapX : -(rootW / 2 + branchGapX);
      drawBranchCluster(ctx, item, idx, n, [dir > 0 ? rootW / 2 : -rootW / 2, 0], branchX, centers[j], dir);
    });
  }
}

/** mindmap-horizontal — root at left, branch column right, children a column beyond. */
function genMindmapHorizontal(spec: VizSpec, ctx: VizContext): void {
  const { root, branches, fromTitle } = resolveMindmap(spec);
  if (fromTitle) ctx.titleHandled = true;
  const n = Math.max(branches.length, 1);
  const rb = nodeBox(ctx, root.label, 16, 180, 16);
  const rootW = Math.max(rb.w, 120);
  const rootH = Math.max(rb.h, 46);
  const rootRole = ctx.role(0, { neutral: true, color: root.color });
  scoped(ctx, root.id, () => {
    ctx.shape("round-rectangle", 0, -rootH / 2, rootW, rootH, rootRole, { id: ctx.uid("root"), label: rb.text, style: { fontSize: 16 } });
  });

  const centers = stackCenters(
    branches.map((b) => clusterHeight(b, 52)),
    30,
  );
  const branchX = rootW + 110;
  branches.forEach((item, idx) => {
    drawBranchCluster(ctx, item, idx, n, [rootW, 0], branchX, centers[idx], 1);
  });
}

/** mindmap-vertical — org-chart: root center, wide cards above/below, T-bus elbows. */
function genMindmapVertical(spec: VizSpec, ctx: VizContext): void {
  const { root, branches, fromTitle } = resolveMindmap(spec);
  if (fromTitle) ctx.titleHandled = true;
  const n = Math.max(branches.length, 1);

  const rootRole = ctx.role(0, { neutral: true, color: root.color });
  const rt = ctx.wrap(root.label, 240, 22, "heading", 2);
  const rootW = Math.max(200, Math.max(...rt.split("\n").map((l) => ctx.measure(l, 22, "heading"))) + 56);
  const rootH = 70;
  scoped(ctx, root.id, () => {
    ctx.shape("round-rectangle", -rootW / 2, -rootH / 2, rootW, rootH, rootRole, { id: ctx.uid("root"), label: rt, style: { fontSize: 22 } });
  });

  const cardW = 260;
  const cardGap = 28;
  const headingWeight = ctx.preset.fonts.headingWeight;

  interface Card {
    idx: number;
    titleText: string;
    titleW: number;
    titleH: number;
    descLines: string[];
    h: number;
  }
  const measureCard = (branch: VizItem, idx: number): Card => {
    const titleText = ctx.wrap(branch.label, cardW - 24, 20, "heading", 2);
    const tLines = titleText.split("\n");
    const titleW = Math.max(...tLines.map((l) => ctx.measure(l, 20, "heading")));
    const titleH = tLines.length * 26;
    const descLines: string[] = [];
    if (branch.detail) descLines.push(...ctx.wrap(branch.detail, cardW - 24, 15, "body", 4).split("\n"));
    for (const c of branch.children) descLines.push(...ctx.wrap(c.label, cardW - 24, 15, "body", 2).split("\n"));
    const h = titleH + (descLines.length ? descLines.length * 20 + 8 : 0);
    return { idx, titleText, titleW, titleH, descLines, h };
  };
  const drawCard = (card: Card, branch: VizItem, x: number, top: number): void => {
    const role = ctx.role(card.idx, { n, color: branch.color });
    const cx = x + cardW / 2;
    const titleCy = top + card.titleH / 2;
    ctx.label(card.titleText, cx, titleCy, { size: 20, color: role.color, font: "heading", weight: headingWeight });
    const seg = (cardW - card.titleW) / 2 - 12;
    if (seg > 10) {
      ctx.line(
        [
          [x, titleCy],
          [x + seg, titleCy],
        ],
        { color: role.color, width: 2 },
      );
      ctx.line(
        [
          [x + cardW - seg, titleCy],
          [x + cardW, titleCy],
        ],
        { color: role.color, width: 2 },
      );
    }
    if (card.descLines.length) {
      ctx.label(card.descLines.join("\n"), cx, top + card.titleH + 8, { size: 15, color: ctx.mutedInk, vAnchor: "top", maxW: cardW - 24 });
    }
  };

  const aboveCount = Math.ceil(branches.length / 2);
  const rows: Array<{ list: VizItem[]; base: number; dir: 1 | -1 }> = [
    { list: branches.slice(0, aboveCount), base: -110, dir: -1 },
    { list: branches.slice(aboveCount), base: 110, dir: 1 },
  ];
  rows.forEach(({ list, base, dir }, r) => {
    if (!list.length) return;
    const rowW = list.length * cardW + (list.length - 1) * cardGap;
    const busY = base + dir * -40; // between root and cards
    const cxs: number[] = [];
    list.forEach((branch, j) => {
      const idx = r === 0 ? j : aboveCount + j;
      const card = measureCard(branch, idx);
      const x = -rowW / 2 + j * (cardW + cardGap);
      const top = dir < 0 ? base - card.h : base;
      const cx = x + cardW / 2;
      cxs.push(cx);
      ctx.item(branch.id, () => {
        drawCard(card, branch, x, top);
        // elbow drop from the bus into the card
        ctx.line(
          [
            [cx, busY],
            [cx, base],
          ],
          { color: ctx.preset.edge, width: 1.8 },
        );
      });
    });
    // trunk from root to bus + horizontal bus
    ctx.line(
      [
        [0, dir < 0 ? -rootH / 2 : rootH / 2],
        [0, busY],
      ],
      { color: ctx.preset.edge, width: 1.8 },
    );
    if (cxs.length > 1 || Math.abs(cxs[0]) > 2) {
      ctx.line(
        [
          [Math.min(...cxs, 0), busY],
          [Math.max(...cxs, 0), busY],
        ],
        { color: ctx.preset.edge, width: 1.8 },
      );
    }
  });
}

function mindmapDef(name: string, summary: string, variant: "both" | "left" | "right" | "horizontal" | "vertical", sweetSpot?: { min: number; max: number }) {
  registerViz({
    name,
    category: "Mindmap",
    summary,
    entryKinds: ["item", "root", "center"],
    sweetSpot,
    generate(spec: VizSpec, ctx: VizContext) {
      if (variant === "vertical") genMindmapVertical(spec, ctx);
      else if (variant === "horizontal") genMindmapHorizontal(spec, ctx);
      else genMindmapSides(spec, ctx, variant);
    },
  });
}

mindmapDef("mindmap", "Root with branches fanning left and right; children beyond each branch.", "both", { min: 3, max: 8 });
mindmapDef("mindmap-left", "Mindmap with every branch on the left of the root.", "left", { min: 2, max: 5 });
mindmapDef("mindmap-right", "Mindmap with every branch on the right of the root.", "right", { min: 2, max: 5 });
mindmapDef("mindmap-horizontal", "Root at the left; branches one column right, children beyond.", "horizontal", { min: 2, max: 6 });
mindmapDef("mindmap-vertical", "Org-chart mindmap: root center, branch cards above/below with elbow trunks.", "vertical", { min: 2, max: 6 });

// ---- decision -------------------------------------------------------------------

registerViz({
  name: "decision",
  category: "Comparison",
  summary: "A person weighing a question, elbow branches fanning to the options.",
  entryKinds: ["item", "option", "question"],
  options: [{ name: "question", type: "string", description: "the question posed (falls back to a question entry, then the title)" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const options = itemsOf(spec, "item", "option");
    const n = Math.max(options.length, 1);
    const questionEntry = spec.items.find((i) => i.kind === "question");
    const question = questionEntry?.label ?? optStr(spec.options, "question") ?? spec.title;
    if (question && question === spec.title) ctx.titleHandled = true;

    // row pitch grows to fit the tallest option block (long descriptions)
    const rowH = Math.max(0, ...options.map((o) => ctx.measureLabelBlock(o.label, o.detail, { maxW: 280 }).h));
    const pitch = Math.max(78, rowH + 26);
    const rowTop = 84;
    const rows = options.map((_, i) => rowTop + i * pitch);
    const midY = rowTop + ((n - 1) * pitch) / 2;

    // question at the top
    if (question) {
      scoped(ctx, questionEntry?.id, () => {
        ctx.label(ctx.wrap(question, 360, 20, "heading", 3), 140, 24, { size: 20, color: ctx.ink, weight: 700, font: "heading", align: "left" });
      });
    }

    // person at mid-left, vertically centered on the option list
    ctx.icon("user", 36, midY, 70, ctx.ink);

    // ONE horizontal line person → splitter bar, then rounded orthogonal
    // elbows from the splitter to each option row
    const splitX = 290;
    const optX = 380;
    const endX = optX - 14;
    const r = 16;
    const edgeStyle = { color: ctx.preset.edge, width: 1.8 };
    ctx.line(
      [
        [78, midY],
        [splitX - r, midY],
      ],
      edgeStyle,
    );
    options.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const y = rows[i];
        if (Math.abs(y - midY) < 2) {
          ctx.line(
            [
              [splitX - r, midY],
              [endX, y],
            ],
            edgeStyle,
          );
        } else {
          const s = y > midY ? 1 : -1;
          const pts: Array<[number, number]> = [
            ...qCorner([splitX - r, midY], [splitX, midY], [splitX, midY + s * r]),
            ...qCorner([splitX, y - s * r], [splitX, y], [splitX + r, y]),
            [endX, y],
          ];
          ctx.line(pts, edgeStyle);
        }
        if (item.icon) ctx.icon(item.icon, optX + 17, y, 34, role.color);
        else {
          ctx.shape("circle", optX + 4, y - 13, 26, 26, role, { id: ctx.uid(item.id) });
          ctx.label(String(i + 1), optX + 17, y, { size: 15, color: role.textColor, weight: 700, font: "heading" });
        }
        ctx.labelBlock(item.label, item.detail, optX + 48, y, { color: ctx.ink, align: "left", maxW: 280 });
      }),
    );
  },
});

// ---- root-causes ------------------------------------------------------------------

registerViz({
  name: "root-causes",
  aliases: ["root-cause"],
  category: "Cause and Effect",
  summary: "A leafy tree — the problem is the crown, the causes are its roots.",
  entryKinds: ["item", "cause", "problem", "center"],
  sweetSpot: { min: 2, max: 7 },
  generate(spec: VizSpec, ctx: VizContext) {
    const causes = itemsOf(spec, "item", "cause");
    const n = Math.max(causes.length, 1);
    const problemEntry = spec.items.find((i) => i.kind === "problem" || i.kind === "center");
    const problem = problemEntry?.label ?? spec.title;
    if (problem && problem === spec.title) ctx.titleHandled = true;

    // leafy crown: a cluster of overlapping puffs (circle outlines)
    const puffs: Array<[number, number, number]> = [
      [0, -92, 60],
      [-62, -60, 48],
      [62, -60, 48],
      [-98, -14, 40],
      [98, -14, 40],
      [-48, 6, 46],
      [48, 6, 46],
      [0, -32, 56],
    ];
    for (const [px, py, pr] of puffs) {
      ctx.shape("circle", px - pr, py - pr, pr * 2, pr * 2, outline(ctx, ctx.ink, 2));
    }
    // problem stated above the crown (the tree "grows from" it)
    if (problem) {
      scoped(ctx, problemEntry?.id, () => {
        ctx.label(ctx.wrap(problem, 320, 20, "heading", 2), 0, -182, { size: 20, color: ctx.ink, weight: 700, font: "heading", z: 3 });
      });
    }

    // tapering trunk flaring into buttress roots at the ground line
    const groundY = 214;
    const trunk: Array<[number, number]> = [
      [-13, 4],
      [-19, 70],
      [-27, 142],
      [-42, groundY - 6],
      [-56, groundY],
      [-20, groundY + 5],
      [0, groundY + 12],
      [20, groundY + 5],
      [56, groundY],
      [42, groundY - 6],
      [27, 142],
      [19, 70],
      [13, 4],
    ];
    ctx.poly(trunk, outline(ctx, ctx.ink, 2), { id: ctx.uid("trunk") });

    // tapering root tendrils spreading down + outward from the base.
    // (angles: 90° = straight down, <90 = down-right, >90 = down-left)
    const base: [number, number] = [0, groundY + 8];
    const rootSpecs = [
      { ang: 143, len: 158, hw: 11, bow: 1 },
      { ang: 122, len: 132, hw: 9, bow: 1 },
      { ang: 104, len: 106, hw: 8, bow: -1 },
      { ang: 90, len: 150, hw: 10, bow: 0 },
      { ang: 76, len: 106, hw: 8, bow: 1 },
      { ang: 58, len: 132, hw: 9, bow: -1 },
      { ang: 37, len: 158, hw: 11, bow: -1 },
    ];
    const tips: Array<[number, number]> = [];
    for (const r of rootSpecs) {
      const { outline: shape, tip } = taperRoot(base, r.ang, r.len, r.hw, r.bow);
      ctx.poly(shape, outline(ctx, ctx.ink, 1.6));
      tips.push(tip);
    }

    // causes: colored label + gray detail, each leader terminating on a distinct
    // root tip — pairs at root level left/right, an odd last one lower-center
    const leftTipIdx = [0, 1, 2];
    const rightTipIdx = [6, 5, 4];
    const leader = { color: ctx.preset.edge, width: 1.5 };
    let leftJ = 0;
    let rightJ = 0;
    causes.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const bottom = i === causes.length - 1 && causes.length % 2 === 1 && causes.length >= 3;
        if (bottom) {
          const tip = tips[3];
          const lx = 92;
          const topY = tip[1] + 74;
          ctx.line([tip, [tip[0], topY - 24], [lx, topY - 24], [lx, topY - 6]], leader);
          ctx.labelBlock(item.label, item.detail, lx, topY, { color: role.color, align: "center", maxW: 280, vAnchor: "top" });
          return;
        }
        const side = i % 2 === 0 ? -1 : 1;
        const j = side < 0 ? leftJ++ : rightJ++;
        const tip = tips[side < 0 ? leftTipIdx[Math.min(j, 2)] : rightTipIdx[Math.min(j, 2)]];
        const y = tip[1] + Math.max(0, j - 2) * 78;
        const bx = side * 220;
        ctx.labelBlock(item.label, item.detail, bx, y, { color: role.color, align: side < 0 ? "right" : "left", maxW: 220 });
        const sx = bx + side * -8;
        if (Math.abs(y - tip[1]) < 2) {
          ctx.line([[sx, y], tip], leader);
        } else {
          const mx = (sx + tip[0]) / 2;
          ctx.line([[sx, y], [mx, y], [mx, tip[1]], tip], leader);
        }
      }),
    );
  },
});

// ---- converge / lens -----------------------------------------------------------------

function genConverge(spec: VizSpec, ctx: VizContext): void {
  const inputs = [...itemsOf(spec, "item", "input")];
  let output: VizItem | undefined = spec.items.find((i) => i.kind === "output" || i.kind === "out");
  let outputLabel = optStr(spec.options, "output");
  let outputDetail: string | undefined;
  if (!output && !outputLabel && inputs.length > 1) output = inputs.pop();
  if (output) {
    outputLabel = output.label;
    outputDetail = output.detail;
  }
  const n = Math.max(inputs.length, 1);

  const pitch = 114;
  const ys = inputs.map((_, i) => i * pitch);
  const midY = ((n - 1) * pitch) / 2;

  // lens glyph (tall ellipse outline, neutral)
  const lensH = Math.max(280, (n - 1) * pitch + 100);
  const lensW = 72;
  const lensCx = 410;
  ctx.shape("ellipse", lensCx - lensW / 2, midY - lensH / 2, lensW, lensH, outline(ctx, ctx.mutedInk), { id: ctx.uid("lens") });

  // inputs, left
  inputs.forEach((item, i) =>
    ctx.item(item.id, () => {
      const role = ctx.role(i, { n: n + 1, color: item.color });
      const y = ys[i];
      if (item.icon) ctx.icon(item.icon, 23, y, 46, role.color);
      else {
        ctx.shape("circle", 5, y - 18, 36, 36, role, { id: ctx.uid(item.id) });
        ctx.label(String(i + 1), 23, y, { size: 18, color: role.textColor, weight: 700, font: "heading" });
      }
      const block = ctx.labelBlock(item.label, item.detail, 56, y, { color: role.color, align: "left", maxW: 230 });
      // S-curve attached to the row's text block, converging INTO the lens
      const startX = block.x + block.w + 8;
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 44;
      ctx.line(sCurveH(startX, y, lensCx + lensW / 2 - 12, midY + t), { color: ctx.preset.edge, width: 1.8 });
    }),
  );

  // output, right
  const outRole = ctx.role(inputs.length, { n: n + 1, color: output?.color });
  const outX = lensCx + lensW / 2 + 14;
  scoped(ctx, output?.id, () => {
    ctx.arrow(outX, midY, outX + 66, midY, { color: ctx.preset.edge, width: 1.8 });
    const blockX = outX + 84;
    if (output?.icon) ctx.icon(output.icon, blockX + 23, midY, 46, outRole.color);
    const textX = output?.icon ? blockX + 56 : blockX;
    ctx.labelBlock(outputLabel ?? "Outcome", outputDetail, textX, midY, { color: outRole.color, align: "left", maxW: 220 });
  });
}

registerViz({
  name: "converge",
  category: "Brainstorming",
  summary: "Inputs funnel through a lens into one outcome.",
  entryKinds: ["item", "input", "output", "out"],
  options: [{ name: "output", type: "string", description: "outcome label when no output entry (else the last item is the output)" }],
  sweetSpot: { min: 2, max: 5 },
  generate: genConverge,
});

registerViz({
  name: "lens",
  category: "Visual Metaphors",
  summary: "A focusing lens — several inputs concentrated into one output.",
  entryKinds: ["item", "input", "output", "out"],
  options: [{ name: "output", type: "string", description: "outcome label when no output entry (else the last item is the output)" }],
  sweetSpot: { min: 2, max: 5 },
  generate: genConverge,
});

// ---- diverge ---------------------------------------------------------------------------

/**
 * Curved fat arrow for diverge, hand-authored in a 120×160 design space:
 * a thick J that enters at the top and bends to point straight down, shifted
 * left (head at bottom-left, tail at top-right). DIVERGE_CURVE_R is its exact
 * x-mirror (x' = 120 - x) — ctx.path can't flip, so the twin is rewritten.
 */
const DIVERGE_CURVE_VW = 120;
const DIVERGE_CURVE_VH = 160;
const DIVERGE_CURVE_L = "M70 0 L106 0 C106 88 46 92 46 128 L56 128 L28 160 L0 128 L10 128 C10 84 70 80 70 0 Z";
const DIVERGE_CURVE_R = "M50 0 L14 0 C14 88 74 92 74 128 L64 128 L92 160 L120 128 L110 128 C110 84 50 80 50 0 Z";

registerViz({
  name: "diverge",
  category: "Brainstorming",
  summary: "A question radiating thick arrows to option blocks at the corners.",
  entryKinds: ["item", "option", "question", "center"],
  sweetSpot: { min: 2, max: 4 },
  generate(spec: VizSpec, ctx: VizContext) {
    const options = itemsOf(spec, "item", "option");
    const n = Math.max(options.length, 1);
    const questionEntry = spec.items.find((i) => i.kind === "question" || i.kind === "center");
    const question = questionEntry?.label ?? spec.title;
    if (question && question === spec.title) ctx.titleHandled = true;

    if (question) {
      scoped(ctx, questionEntry?.id, () => {
        ctx.label(ctx.wrap(question, 420, 25, "heading", 2), 0, -14, { size: 25, color: ctx.ink, weight: 700, font: "heading" });
      });
    }

    // arrow geometry — four uniform outlined block arrows radiating from the
    // origin under the question: straight fat arrows left/right, curved fat
    // arrows (thick Js) bending 90° down between them
    const top = 60; // tail top edge, just under the question
    const AW = 170; // straight arrow length
    const AH = 76; // straight arrow height
    const gapX = 80; // origin → straight arrow tail
    const rowCy = top + AH / 2;
    const CW = DIVERGE_CURVE_VW * 1.1;
    const CH = DIVERGE_CURVE_VH * 1.1;
    const sx = (v: number): number => v * (CW / DIVERGE_CURVE_VW);

    type Slot = { kind: "left" | "right" | "down-left" | "down-right" | "down-center" | "ray"; angle?: number };
    let slots: Slot[];
    if (n === 1) slots = [{ kind: "right" }];
    else if (n === 2) slots = [{ kind: "left" }, { kind: "right" }];
    else if (n === 3) slots = [{ kind: "left" }, { kind: "down-center" }, { kind: "right" }];
    else {
      slots = [{ kind: "left" }, { kind: "down-left" }, { kind: "down-right" }, { kind: "right" }];
      const extraAngles = [142, 38, 162, 18, 115, 65];
      for (let k = 4; k < n; k++) slots.push({ kind: "ray", angle: extraAngles[k - 4] ?? 90 });
    }
    const C: [number, number] = [0, rowCy];
    if (slots.some((s) => s.kind === "ray")) dot(ctx, C[0], C[1], 10);

    options.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const slot = slots[i];
        switch (slot.kind) {
          case "left":
          case "right": {
            const dir: 1 | -1 = slot.kind === "right" ? 1 : -1;
            const bx = dir > 0 ? gapX : -gapX - AW;
            ctx.shape("block-arrow", bx, rowCy - AH / 2, AW, AH, role, {
              id: ctx.uid(item.id),
              data: { dir: dir > 0 ? "right" : "left" },
            });
            // item icon inside the arrow body, near the head
            if (item.icon) ctx.icon(item.icon, bx + AW * (dir > 0 ? 0.62 : 0.38), rowCy, 30, role.textColor);
            const tipX = dir > 0 ? bx + AW : bx;
            ctx.labelBlock(item.label, item.detail, tipX + dir * 16, rowCy, { color: role.color, align: dir > 0 ? "left" : "right", maxW: 200 });
            break;
          }
          case "down-left":
          case "down-right":
          case "down-center": {
            const mirrored = slot.kind !== "down-left";
            // seat the tail beside the origin (down-center: straddle it)
            const bx = slot.kind === "down-left" ? -10 - sx(106) : slot.kind === "down-right" ? 10 - sx(14) : -CW / 2;
            ctx.path(mirrored ? DIVERGE_CURVE_R : DIVERGE_CURVE_L, DIVERGE_CURVE_VW, DIVERGE_CURVE_VH, bx, top, CW, CH, role, { id: ctx.uid(item.id) });
            const headX = bx + sx(mirrored ? 92 : 28);
            // item icon inside the descending body, near the head
            if (item.icon) ctx.icon(item.icon, headX, top + (CH * 105) / DIVERGE_CURVE_VH, 28, role.textColor);
            const tipY = top + CH;
            const shift = slot.kind === "down-left" ? -30 : slot.kind === "down-right" ? 30 : 0;
            ctx.labelBlock(item.label, item.detail, headX + shift, tipY + 16, { color: role.color, align: "center", maxW: 210, vAnchor: "top" });
            break;
          }
          case "ray": {
            const a = slot.angle ?? 90;
            const from = polar(C[0], C[1], 50, a);
            const to = polar(C[0], C[1], 190, a);
            ctx.line([from, to], { color: role.color, width: 5, arrow: true, id: ctx.uid(item.id) });
            const tip = polar(C[0], C[1], 214, a);
            const align = radialAlign(a);
            const shift = align === "left" ? 14 : align === "right" ? -14 : 0;
            if (item.icon) ctx.icon(item.icon, tip[0], tip[1] + 18, 34, role.color);
            ctx.labelBlock(item.label, item.detail, tip[0] + shift, tip[1] + (item.icon ? 44 : 14), { color: role.color, align, maxW: 190, vAnchor: "top" });
            break;
          }
        }
      }),
    );
  },
});

// ---- prism -----------------------------------------------------------------------------

registerViz({
  name: "prism",
  category: "Visual Metaphors",
  summary: "One input beam split by a prism into several outputs.",
  entryKinds: ["item", "output", "out", "input", "in"],
  options: [{ name: "input", type: "string", description: "input label when no input entry" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const outputs = itemsOf(spec, "item", "output", "out");
    const n = Math.max(outputs.length, 1);
    const inputEntry = spec.items.find((i) => i.kind === "input" || i.kind === "in");
    const inputLabel = inputEntry?.label ?? optStr(spec.options, "input") ?? "Input";

    // prism: front triangle + parallelogram top side, neutral
    const triX = 230;
    const triY = 20;
    const triW = 200;
    const triH = 190;
    const cy = triY + triH * 0.62;
    ctx.shape("triangle", triX, triY, triW, triH, outline(ctx, ctx.mutedInk), { id: ctx.uid("prism") });
    ctx.poly(
      [
        [triX + triW / 2, triY],
        [triX + triW / 2 + 64, triY - 22],
        [triX + triW + 64, triY + triH - 22],
        [triX + triW, triY + triH],
      ],
      outline(ctx, ctx.mutedInk),
    );

    // input node + beam in
    const inRole = inputEntry?.color ? ctx.role(0, { color: inputEntry.color }) : undefined;
    const inColor = inRole?.color ?? ctx.ink;
    scoped(ctx, inputEntry?.id, () => {
      ctx.shape("round-rectangle", 0, cy - 36, 72, 72, outline(ctx, inColor), { id: ctx.uid("input") });
      ctx.icon(inputEntry?.icon ?? "bulb", 36, cy, 40, inColor);
      ctx.label(ctx.wrap(inputLabel, 150, 20, "heading", 2), 36, cy + 62, { size: 20, color: inColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
      ctx.line(
        [
          [74, cy],
          [triX + 66, cy],
        ],
        { color: ctx.preset.edge, width: 2 },
      );
    });

    // output beams fanning right to rounded-square nodes
    const pitch = 84;
    const nodeX = 560;
    const startY = cy - ((n - 1) * pitch) / 2;
    outputs.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const y = startY + i * pitch;
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 44;
        ctx.line(
          [
            [triX + triW - 30, cy + t * 0.4],
            [nodeX - 6, y],
          ],
          { color: role.color, width: 2.2, arrow: true },
        );
        ctx.shape("round-rectangle", nodeX, y - 35, 70, 70, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, nodeX + 35, y, 36, role.textColor);
        else ctx.label(String(i + 1), nodeX + 35, y, { size: 24, color: role.textColor, weight: 700, font: "heading" });
        ctx.labelBlock(item.label, item.detail, nodeX + 88, y, { color: role.color, align: "left", maxW: 210 });
      }),
    );
  },
});
