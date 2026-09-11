/**
 * Tree/fan-shaped visualizations: mindmap (+ side/orientation variants),
 * decision, root-causes, converge/lens, diverge, prism.
 * Geometry follows design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { NodeStyle } from "../../scene/types.js";
import { mix, parseHex } from "../../style/color.js";
import { cubicPoints, polar, radialAlign, scallopedBlob, smoothPath, taperedOutline, type Anchor } from "./util.js";

// ---- shared helpers ----------------------------------------------------------

type P = [number, number];

/** Rounded elbow corner: quadratic p0 → (control c) → p1, sampled. */
function qCorner(p0: P, c: P, p1: P, segs = 6): P[] {
  const pts: P[] = [];
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

/** Small solid dot (ports, junctions, the lens focus). */
function dot(ctx: VizContext, cx: number, cy: number, d: number, color?: string, z?: number): void {
  const c = color ?? ctx.ink;
  ctx.shape("circle", cx - d / 2, cy - d / 2, d, d, { stroke: c, fill: c, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 }, { z });
}

/**
 * An open stroke through world-space segments — each `[c1, c2, to]` a cubic,
 * each `[to]` a straight run — emitted as ONE path node. A connector drawn
 * this way is a true curve: a sampled polyline (rc.linearPath) draws one
 * straight rough segment per sample, and uniform-t sampling puts the fewest
 * samples where an S-curve bends hardest, so it always showed a knee at each
 * end (28.9° at the first vertex of a 110×300 trunk; still 12.8° at 48
 * samples). Drawn in its own design box at 1:1, so the width is world units.
 */
function strokePath(ctx: VizContext, start: P, segs: P[][], opts: { color?: string; width?: number; z?: number; id?: string } = {}): void {
  const all = [start, ...segs.flat()];
  const minX = Math.min(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const w = Math.max(Math.max(...all.map((p) => p[0])) - minX, 0.01);
  const h = Math.max(Math.max(...all.map((p) => p[1])) - minY, 0.01);
  const f = (p: P) => `${(p[0] - minX).toFixed(2)},${(p[1] - minY).toFixed(2)}`;
  const d = `M${f(start)}` + segs.map((s) => (s.length === 3 ? ` C${f(s[0])} ${f(s[1])} ${f(s[2])}` : ` L${f(s[0])}`)).join("");
  ctx.path(
    d,
    w,
    h,
    minX,
    minY,
    w,
    h,
    { stroke: opts.color ?? ctx.preset.edge, fill: null, fillStyle: "none", strokeWidth: opts.width ?? 1.8, roughness: ctx.preset.roughness },
    { id: opts.id, z: opts.z, role: "line" },
  );
}

/** The cubic segment of an S-curve with horizontal tangents at both ends. */
function sSeg(x1: number, y1: number, x2: number, y2: number): P[] {
  const mx = (x1 + x2) / 2;
  return [
    [mx, y1],
    [mx, y2],
    [x2, y2],
  ];
}

/** S-curve connector with horizontal end tangents (mindmap fans), one true cubic. */
function curveH(ctx: VizContext, x1: number, y1: number, x2: number, y2: number, opts: { color?: string; width?: number; z?: number } = {}): void {
  strokePath(ctx, [x1, y1], [sSeg(x1, y1, x2, y2)], opts);
}

/**
 * How far a connector may run INTO the node it meets. An opaque node caps the
 * joint, so ending a few units inside it leaves no sliver of paper between
 * line and box (the 2-unit stand-off showed as 4px of paper at every join);
 * an unfilled or hatched node gets none.
 */
function tuck(style: { fill?: string | null; fillStyle?: string }): number {
  return style.fill && style.fillStyle === "solid" ? 3 : 0;
}

/**
 * Offset of connector k of `count` along a node side of height `h`. Exits are
 * spread along the edge: connectors sharing one point AND one tangent fuse
 * into a solid wedge that reads as an arrowhead aimed into the node.
 */
function spreadAt(k: number, count: number, h: number, step: number, pad: number): number {
  if (count <= 1) return 0;
  return (k - (count - 1) / 2) * Math.min(step, Math.max(0, h - pad) / (count - 1));
}

/** Tag `fn`'s elements as item `itemId` when the emission belongs to a real
 *  data item — roots/questions/outputs may instead come from the title or a
 *  block option, in which case they stay untagged. */
function scoped(ctx: VizContext, itemId: string | undefined, fn: () => void): void {
  if (itemId) ctx.item(itemId, fn);
  else fn();
}

/** Measured wrapped text for a small labelled box (mindmap nodes). */
function nodeBox(ctx: VizContext, label: string, fs: number, maxW: number, padX: number): { text: string; w: number; h: number } {
  const text = ctx.wrap(label, maxW, fs, "heading", 2);
  const lines = text.split("\n");
  const w = Math.max(...lines.map((l) => ctx.measure(l, fs, "heading")), fs) + padX * 2;
  const h = lines.length * fs * 1.35 + fs * 0.8;
  return { text, w, h };
}

/**
 * Wrap to the NARROWEST width that keeps the greedy line count, so a two-line
 * label splits near its middle instead of orphaning its last word.
 */
function balancedWrap(ctx: VizContext, text: string, maxW: number, size: number, font: string, maxLines: number): string {
  const first = ctx.wrap(text, maxW, size, font, maxLines);
  const lines = first.split("\n").length;
  if (lines < 2) return first;
  const flat = (t: string) => t.replace(/\n/g, " ");
  let lo = maxW * 0.4;
  let hi = maxW;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    const t = ctx.wrap(text, mid, size, font, maxLines);
    if (t.split("\n").length > lines || flat(t) !== flat(first)) lo = mid;
    else hi = mid;
  }
  return ctx.wrap(text, hi, size, font, maxLines);
}

/** The anchor node of a map/hub: bold, ink-outlined, paper-filled — the most
 *  prominent mark on the card, not a grey peer of its branches. */
function anchorStyle(ctx: VizContext, color?: string): Partial<NodeStyle> {
  const base = ctx.role(0, { neutral: true, color });
  return { ...base, stroke: color ? base.color : ctx.ink, strokeWidth: ctx.preset.strokeWidth * 1.4, fill: ctx.preset.background, fillStyle: "solid", textColor: ctx.ink };
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

/** Vertical stack of boxes with given heights → center-y of each, centred on 0. */
function stackCenters(heights: number[], gap: number): number[] {
  const total = heights.reduce((s, h) => s + h, 0) + Math.max(0, heights.length - 1) * gap;
  let cursor = -total / 2;
  return heights.map((h) => {
    const c = cursor + h / 2;
    cursor += h + gap;
    return c;
  });
}

// Three levels, three weights: root 22 bold ink-outlined, branch 18 soft fill
// with a heavier hue outline, child 15 in ink on paper with a light hue outline.
const MM_ROOT_FS = 22;
const MM_BRANCH_FS = 18;
const MM_CHILD_FS = 15;
const CHILD_PITCH = 46;
/** Connectors sit under every node, so a node's fill caps each joint. */
const CONNECTOR_Z = -1;

interface Cluster {
  item: VizItem;
  idx: number;
  /** Branch / child font sizes (a one-column map is height-bound, so it can afford larger type). */
  fs: [number, number];
  box: { text: string; w: number; h: number };
  kids: Array<{ text: string; w: number; h: number }>;
  kidYs: number[];
  h: number;
}

function measureCluster(ctx: VizContext, item: VizItem, idx: number, typeScale = 1): Cluster {
  const fs: [number, number] = [Math.round(MM_BRANCH_FS * typeScale), Math.round(MM_CHILD_FS * typeScale)];
  const box = nodeBox(ctx, item.label, fs[0], 190 * typeScale, 14);
  const kids = item.children.map((c) => nodeBox(ctx, c.label, fs[1], 170 * typeScale, 12));
  const kidHs = kids.map((k) => Math.max(k.h, CHILD_PITCH - 12));
  const kidYs = stackCenters(kidHs, 12);
  const kidsSpan = kidHs.reduce((s, h) => s + h, 0) + Math.max(0, kids.length - 1) * 12;
  return { item, idx, fs, box, kids, kidYs, h: Math.max(60, box.h + 20, kidsSpan + 12) };
}

/** Half the span of `list` laid out at ONE even pitch that clears every neighbour pair. */
function halfSpan(list: Cluster[], gap: number): number {
  let pitch = 0;
  for (let j = 0; j + 1 < list.length; j++) pitch = Math.max(pitch, (list[j].h + list[j + 1].h) / 2 + gap);
  return (pitch * Math.max(0, list.length - 1)) / 2;
}

/** `count` centres spread evenly over ±half — the middle of an odd count sits on 0. */
function evenCenters(count: number, half: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, j) => -half + (2 * half * j) / (count - 1));
}

/**
 * Draw one branch + its children. `nearX` is the branch box's edge facing the
 * root, `colX` the children column's edge facing the branch (every child of a
 * side starts on that one column), `exit` the trunk's start on the root.
 */
function drawCluster(ctx: VizContext, c: Cluster, n: number, exit: P, exitTuck: number, nearX: number, cy: number, dir: 1 | -1, colX: number): void {
  const role = ctx.role(c.idx, { n, color: c.item.color });
  const bStyle = { ...role, strokeWidth: role.strokeWidth * 1.3 };
  const bx = dir > 0 ? nearX : nearX - c.box.w;
  const farX = dir > 0 ? bx + c.box.w : bx;
  ctx.item(c.item.id, () => {
    curveH(ctx, exit[0] - dir * exitTuck, exit[1], nearX + dir * tuck(bStyle), cy, { color: ctx.preset.edge, width: 1.8, z: CONNECTOR_Z });
    ctx.shape("round-rectangle", bx, cy - c.box.h / 2, c.box.w, c.box.h, bStyle, {
      id: ctx.uid(c.item.id),
      label: c.box.text,
      style: { fontSize: c.fs[0], fontWeight: ctx.preset.fonts.headingWeight },
    });
  });
  const kids = c.item.children;
  kids.forEach((child, k) =>
    ctx.item(child.id, () => {
      const kRole = ctx.role(c.idx, { n, color: child.color ?? role.color });
      const kStyle = { ...kRole, fill: ctx.preset.background, fillStyle: "solid" as const, strokeWidth: Math.min(1.3, kRole.strokeWidth), textColor: ctx.ink };
      const kb = c.kids[k];
      const ky = cy + c.kidYs[k];
      const kx = dir > 0 ? colX : colX - kb.w;
      const ey = cy + spreadAt(k, kids.length, c.box.h, 9, 14);
      curveH(ctx, farX - dir * tuck(bStyle), ey, colX + dir * tuck(kStyle), ky, { color: role.color, width: 1.5, z: CONNECTOR_Z });
      ctx.shape("round-rectangle", kx, ky - kb.h / 2, kb.w, kb.h, kStyle, {
        id: ctx.uid(child.id),
        label: kb.text,
        style: { fontSize: c.fs[1] },
      });
    }),
  );
}

/** The root node, vertically centred on 0: its left edge at `left`, or centred on x=0 when omitted. */
function drawMindmapRoot(ctx: VizContext, root: MindmapRoot, left?: number): { w: number; h: number; style: Partial<NodeStyle> } {
  const rb = nodeBox(ctx, root.label, MM_ROOT_FS, 230, 20);
  const w = Math.max(rb.w, 150);
  const h = Math.max(rb.h, 56);
  const style = anchorStyle(ctx, root.color);
  scoped(ctx, root.id, () => {
    ctx.shape("round-rectangle", left ?? -w / 2, -h / 2, w, h, style, { id: ctx.uid("root"), label: rb.text, style: { fontSize: MM_ROOT_FS, fontWeight: 700 } });
  });
  return { w, h, style };
}

/** mindmap / mindmap-left / mindmap-right — root centered, branch fans per side. */
function genMindmapSides(spec: VizSpec, ctx: VizContext, side: "both" | "left" | "right"): void {
  const { root, branches, fromTitle } = resolveMindmap(spec);
  if (fromTitle) ctx.titleHandled = true;
  const n = Math.max(branches.length, 1);
  const r = drawMindmapRoot(ctx, root);

  const right: Cluster[] = [];
  const left: Cluster[] = [];
  branches.forEach((item, idx) => {
    const c = measureCluster(ctx, item, idx, side === "both" ? 1 : 1.12);
    if (side === "left") left.push(c);
    else if (side === "right") right.push(c);
    else (idx < Math.ceil(branches.length / 2) ? right : left).push(c);
  });

  // both sides share one outer extent, each at an even pitch, so the map is
  // symmetric and an odd side's middle trunk runs straight out of the root
  const half = Math.max(halfSpan(right, 36), halfSpan(left, 36));
  const oneSided = side !== "both";
  const branchGapX = oneSided ? 150 : 104;
  const childGap = oneSided ? 72 : 52;
  for (const [list, dir] of [
    [right, 1],
    [left, -1],
  ] as Array<[Cluster[], 1 | -1]>) {
    if (!list.length) continue;
    const centers = evenCenters(list.length, half);
    const nearX = dir * (r.w / 2 + branchGapX);
    const colX = nearX + dir * (Math.max(...list.map((c) => c.box.w)) + childGap);
    list.forEach((c, j) => drawCluster(ctx, c, n, [(dir * r.w) / 2, spreadAt(j, list.length, r.h, 12, 18)], tuck(r.style), nearX, centers[j], dir, colX));
  }
}

/** mindmap-horizontal — root at left, branch column right, children a column beyond. */
function genMindmapHorizontal(spec: VizSpec, ctx: VizContext): void {
  const { root, branches, fromTitle } = resolveMindmap(spec);
  if (fromTitle) ctx.titleHandled = true;
  const n = Math.max(branches.length, 1);
  const r = drawMindmapRoot(ctx, root, 0);

  // one column stacks at even GAPS (the height is this template's budget)
  const clusters = branches.map((b, idx) => measureCluster(ctx, b, idx, 1.12));
  const centers = stackCenters(
    clusters.map((c) => c.h),
    22,
  );
  const extent = clusters.length ? Math.max(...centers) - Math.min(...centers) : 0;
  // the horizontal gaps grow with the vertical spread: trunks stay shallow
  // and the block approaches the band's shape instead of a square
  const nearX = r.w + Math.min(260, Math.max(140, extent * 0.38));
  const colX = nearX + Math.max(0, ...clusters.map((c) => c.box.w)) + 90;
  clusters.forEach((c, j) => drawCluster(ctx, c, n, [r.w, spreadAt(j, clusters.length, r.h, 12, 18)], tuck(r.style), nearX, centers[j], 1, colX));
}

/** mindmap-vertical — org-chart: root center, wide cards above/below, T-bus elbows. */
function genMindmapVertical(spec: VizSpec, ctx: VizContext): void {
  const { root, branches, fromTitle } = resolveMindmap(spec);
  if (fromTitle) ctx.titleHandled = true;
  const n = Math.max(branches.length, 1);

  const rootStyle = anchorStyle(ctx, root.color);
  const rt = ctx.wrap(root.label, 260, MM_ROOT_FS + 2, "heading", 2);
  const rootW = Math.max(210, Math.max(...rt.split("\n").map((l) => ctx.measure(l, MM_ROOT_FS + 2, "heading"))) + 56);
  const rootH = 70;
  scoped(ctx, root.id, () => {
    ctx.shape("round-rectangle", -rootW / 2, -rootH / 2, rootW, rootH, rootStyle, { id: ctx.uid("root"), label: rt, style: { fontSize: MM_ROOT_FS + 2, fontWeight: 700 } });
  });

  const cardW = 280;
  const cardGap = 40;
  const padX = 20;
  const padY = 16;
  const headingWeight = ctx.preset.fonts.headingWeight;

  interface Card {
    idx: number;
    titleText: string;
    titleH: number;
    detail: string[];
    bullets: string[][];
    h: number;
  }
  const measureCard = (branch: VizItem, idx: number): Card => {
    const titleText = ctx.wrap(branch.label, cardW - 2 * padX, 20, "heading", 2);
    const titleH = titleText.split("\n").length * 26;
    const detail = branch.detail ? ctx.wrap(branch.detail, cardW - 2 * padX, 15, "body", 3).split("\n") : [];
    const bullets = branch.children.map((c) => ctx.wrap(c.label, cardW - 2 * padX - 18, 16, "body", 2).split("\n"));
    const bulletLines = bullets.reduce((s, b) => s + b.length, 0);
    const body = (detail.length ? detail.length * 20 + (bullets.length ? 8 : 0) : 0) + (bulletLines ? bulletLines * 22 + (bullets.length - 1) * 4 : 0);
    const h = padY + titleH + (body ? 14 + body : 0) + padY;
    return { idx, titleText, titleH, detail, bullets, h };
  };
  // a real card per branch: the role's soft fill and hue outline, title
  // over a hue rule, the description in muted ink, children as bullets
  const drawCard = (card: Card, branch: VizItem, x: number, top: number): void => {
    const role = ctx.role(card.idx, { n, color: branch.color });
    ctx.shape("round-rectangle", x, top, cardW, card.h, { ...role, strokeWidth: role.strokeWidth * 1.3 }, { id: ctx.uid(branch.id) });
    const cx = x + cardW / 2;
    const titleTop = top + padY;
    ctx.label(card.titleText, cx, titleTop + card.titleH / 2, { size: 20, color: role.textColor, font: "heading", weight: headingWeight });
    let y = titleTop + card.titleH + 6;
    if (!card.detail.length && !card.bullets.length) return;
    ctx.line(
      [
        [x + padX, y],
        [x + cardW - padX, y],
      ],
      { color: role.color, width: 1.5 },
    );
    y += 8;
    if (card.detail.length) {
      ctx.label(card.detail.join("\n"), x + padX, y, { size: 15, color: ctx.mutedInk, vAnchor: "top", align: "left", role: "detail" });
      y += card.detail.length * 20 + 8;
    }
    for (const lines of card.bullets) {
      dot(ctx, x + padX + 4, y + 11, 6, role.color);
      ctx.label(lines.join("\n"), x + padX + 18, y, { size: 16, color: ctx.ink, vAnchor: "top", align: "left" });
      y += lines.length * 22 + 4;
    }
  };

  const aboveCount = Math.ceil(branches.length / 2);
  const base = rootH / 2 + 48; // root edge → card edge
  const rows: Array<{ list: VizItem[]; dir: 1 | -1 }> = [
    { list: branches.slice(0, aboveCount), dir: -1 },
    { list: branches.slice(aboveCount), dir: 1 },
  ];
  const edge = { color: ctx.preset.edge, width: 1.8, z: CONNECTOR_Z };
  rows.forEach(({ list, dir }, r) => {
    if (!list.length) return;
    const rowW = list.length * cardW + (list.length - 1) * cardGap;
    const cardEdge = dir * base; // the row's cards all meet the bus on this line
    const busY = dir * (rootH / 2 + 24);
    const cxs: number[] = [];
    list.forEach((branch, j) => {
      const idx = r === 0 ? j : aboveCount + j;
      const card = measureCard(branch, idx);
      const x = -rowW / 2 + j * (cardW + cardGap);
      const top = dir < 0 ? cardEdge - card.h : cardEdge;
      const cx = x + cardW / 2;
      cxs.push(cx);
      const role = ctx.role(idx, { n, color: branch.color });
      ctx.item(branch.id, () => {
        drawCard(card, branch, x, top);
        // drop from the bus onto the card's edge (tucked under its fill)
        ctx.line(
          [
            [cx, busY],
            [cx, cardEdge + dir * tuck(role)],
          ],
          edge,
        );
      });
    });
    // trunk from root to bus + horizontal bus
    ctx.line(
      [
        [0, dir * (rootH / 2 - tuck(rootStyle))],
        [0, busY],
      ],
      edge,
    );
    if (cxs.length > 1 || Math.abs(cxs[0]) > 2) {
      ctx.line(
        [
          [Math.min(...cxs, 0), busY],
          [Math.max(...cxs, 0), busY],
        ],
        edge,
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
    const blockW = 280;
    const blocks = options.map((o) => ctx.measureLabelBlock(o.label, o.detail, { maxW: blockW }));
    const rowH = Math.max(0, ...blocks.map((b) => b.h));
    const pitch = Math.max(78, rowH + 26);
    const rows = options.map((_, i) => i * pitch);
    const midY = ((n - 1) * pitch) / 2;
    const span = (n - 1) * pitch + rowH;

    // the person deciding — a sketchnote figure at the diagram's line weight,
    // sized to the option list and centred on it
    const charH = Math.min(230, Math.max(150, span * 0.9));
    const fig = ctx.character("thinking", 0, midY + charH / 2, charH);

    // ONE trunk person → split, then a spine and rounded elbows into each
    // option row; every branch ends in an arrowhead at its option
    const trunkX = fig.x + fig.w + 14;
    const splitX = trunkX + 64;
    const optX = splitX + 76;
    const endX = optX - 6;
    const r = 16;
    const edgeStyle = { color: ctx.preset.edge, width: 1.8 };
    ctx.line(
      [
        [trunkX, midY],
        [n > 1 ? splitX : endX, midY],
      ],
      { ...edgeStyle, arrow: n === 1 },
    );
    if (n > 1) {
      ctx.line(
        [
          [splitX, rows[0] + r],
          [splitX, rows[n - 1] - r],
        ],
        edgeStyle,
      );
      dot(ctx, splitX, midY, 7, ctx.preset.edge);
    }
    options.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const y = rows[i];
        if (n > 1) {
          const pts: P[] =
            Math.abs(y - midY) < 2
              ? [
                  [splitX, y],
                  [endX, y],
                ]
              : [...qCorner([splitX, y + (y < midY ? r : -r)], [splitX, y], [splitX + r, y]), [endX, y]];
          ctx.line(pts, { ...edgeStyle, arrow: true });
        }
        if (item.icon) ctx.icon(item.icon, optX + 17, y, 34, role.color);
        else {
          ctx.shape("circle", optX + 4, y - 13, 26, 26, role, { id: ctx.uid(item.id) });
          ctx.label(String(i + 1), optX + 17, y, { size: 15, color: role.textColor, weight: 700, font: "heading" });
        }
        ctx.labelBlock(item.label, item.detail, optX + 48, y, { color: ctx.ink, align: "left", maxW: blockW });
      }),
    );

    // the question heads the card, centred over the whole composition
    if (question) {
      const right = optX + 48 + Math.max(0, ...blocks.map((b) => b.w));
      const qText = ctx.wrap(question, 600, 26, "title", 2);
      const qH = qText.split("\n").length * 26 * 1.25;
      const contentTop = Math.min(fig.y, (rows[0] ?? midY) - rowH / 2);
      scoped(ctx, questionEntry?.id, () => {
        ctx.label(qText, (fig.x + right) / 2, contentTop - 34 - qH / 2, {
          size: 26,
          color: ctx.ink,
          weight: 700,
          font: "title",
          role: question === spec.title ? "title" : "label",
        });
      });
    }
  },
});

// ---- root-causes ------------------------------------------------------------------

/** The palette role closest to foliage green, for the crown's wash (null when the palette has none). */
function foliageColor(ctx: VizContext): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (let i = 0; i < 8; i++) {
    const c = ctx.role(i).color;
    const rgb = parseHex(c);
    if (!rgb) continue;
    const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 0.12) continue;
    let hue = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
    hue = (hue * 60 + 360) % 360;
    const score = Math.max(0, 1 - Math.abs(hue - 125) / 50) * (max - min);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

registerViz({
  name: "root-causes",
  aliases: ["root-cause"],
  category: "Cause and Effect",
  summary: "A leafy tree — the problem is the crown, the causes are its roots.",
  entryKinds: ["item", "cause", "problem", "center"],
  sweetSpot: { min: 2, max: 7 },
  generate(spec: VizSpec, ctx: VizContext) {
    const causes = itemsOf(spec, "item", "cause");
    const n = causes.length;
    const problemEntry = spec.items.find((i) => i.kind === "problem" || i.kind === "center");
    const problem = problemEntry?.label ?? spec.title;
    if (problem && problem === spec.title) ctx.titleHandled = true;

    // Proportioned for a wide band: a broad crown on a short, sturdy trunk and
    // a root system that spreads sideways, not a tall stem.
    const groundY = 115;
    const canopyCy = -70;
    const Z_TRUNK = 80;

    // crown: three scalloped lobes merged into ONE silhouette. Every lobe is
    // stroked at double width, then every lobe is painted again fill-only on
    // top: the fills erase each internal seam and leave exactly the outer half
    // of the stroke — one clean outline, no slivers where the lobes meet.
    const leaf = foliageColor(ctx);
    const wash = leaf ? mix(ctx.preset.background, leaf, 0.15) : ctx.preset.background;
    const lobes: Array<[number, number, number, number, number]> = [
      [-122, canopyCy + 22, 92, 58, 9],
      [122, canopyCy + 22, 92, 58, 9],
      [0, canopyCy - 6, 170, 86, 13],
    ];
    const crownW = 2.2;
    for (const [cx, cy, rx, ry, bumps] of lobes) {
      ctx.path(scallopedBlob(rx, ry, bumps), rx * 2, ry * 2, cx - rx, cy - ry, rx * 2, ry * 2, { ...outline(ctx, ctx.ink, crownW * 2), fill: ctx.preset.background, fillStyle: "solid" }, { z: Z_TRUNK + 1 });
    }
    for (const [cx, cy, rx, ry, bumps] of lobes) {
      ctx.path(scallopedBlob(rx, ry, bumps), rx * 2, ry * 2, cx - rx, cy - ry, rx * 2, ry * 2, { stroke: "transparent", strokeWidth: 0, fill: wash, fillStyle: "solid", roughness: 0 }, { z: Z_TRUNK + 2 });
    }
    if (problem) {
      scoped(ctx, problemEntry?.id, () => {
        ctx.label(balancedWrap(ctx, problem, 250, 26, "heading", 3), 0, canopyCy - 4, { size: 26, color: ctx.ink, weight: 700, font: "heading", z: Z_TRUNK + 3 });
      });
    }

    // trunk: short and sturdy, flaring into the roots. The fill (which hides
    // the roots' tops) and the outline are separate nodes, and the outline is
    // just the two sides — no stroke hems the base, so each side runs straight
    // on into the outer root instead of roots hanging off a skirt.
    const flare = 54;
    const side: Anchor[] = [
      [-28, canopyCy + 60],
      [-30, 40],
      [-35, 78],
      [-44, groundY - 16],
      [-flare, groundY + 2],
    ];
    const fillAnchors: Anchor[] = [...side, [0, groundY + 5], ...side.map(([x, y]) => [-x, y] as Anchor).reverse()];
    const trunkPath = (anchors: Anchor[], closed: boolean, style: Partial<NodeStyle>, id?: string) => {
      const xs = anchors.map((a) => a[0]);
      const ys = anchors.map((a) => a[1]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const w = Math.max(Math.max(...xs) - minX, 1);
      const h = Math.max(Math.max(...ys) - minY, 1);
      const local = anchors.map(([x, y]) => [x - minX, y - minY] as Anchor);
      ctx.path(smoothPath(local, { closed }), w, h, minX, minY, w, h, style, { id, z: Z_TRUNK });
    };
    trunkPath(fillAnchors, true, { stroke: "transparent", strokeWidth: 0, fill: ctx.preset.background, fillStyle: "solid", roughness: 0 }, ctx.uid("trunk"));
    trunkPath(side, false, outline(ctx, ctx.ink, 2));
    trunkPath(
      side.map(([x, y]) => [-x, y] as Anchor),
      false,
      outline(ctx, ctx.ink, 2),
    );

    // label column pitch: wide enough for the widest label, tighter at high counts
    const labelSize = 23;
    const detailSize = 18;
    const widest = Math.max(0, ...causes.map((c) => ctx.measure(c.label, labelSize, "heading")));
    const pitch = n <= 3 ? Math.min(320, Math.max(260, widest + 44)) : n <= 5 ? 230 : 190;
    const spread = pitch * Math.max(n, 1);

    // the ground: dashed either side of the trunk — below it is underground,
    // where the causes live
    const gy = groundY + 8;
    const groundHalf = Math.max(spread / 2 + 30, 300);
    ctx.line([[-groundHalf, gy], [-flare - 16, gy]], { color: ctx.mutedInk, width: 1.6, dash: true });
    ctx.line([[flare + 16, gy], [groundHalf, gy]], { color: ctx.mutedInk, width: 1.6, dash: true });

    // roots: one tapered root per cause, fanning from under the trunk to its
    // own column and ending pointing straight down at the cause's label — so
    // one, three or seven causes all read as one root system, a label per
    // root. Every root gets its own z band (outer roots lowest), painted fill
    // first and outline last, so where roots cross they overlap like real
    // roots and no tint eats half of an outline.
    const spineTo = (t: number, tipX: number, tipY: number): P[] =>
      cubicPoints([t * (flare - 4), groundY - 8], [t * (flare + 8), groundY + 44], [tipX, tipY - 56], [tipX, tipY], 20);
    const rootlet = (spine: P[], k: number, turn: number, len: number): P[] => {
      const [px, py] = spine[k];
      const [qx, qy] = spine[k + 1];
      const l = Math.hypot(qx - px, qy - py) || 1;
      let ux = ((qx - px) * Math.cos(turn) - (qy - py) * Math.sin(turn)) / l;
      let uy = ((qx - px) * Math.sin(turn) + (qy - py) * Math.cos(turn)) / l;
      // roots grow down: a rootlet never heads upward, however sideways its root runs
      if (uy < 0.3) {
        uy = 0.3;
        ux = Math.sign(ux || 1) * Math.sqrt(1 - uy * uy);
      }
      // it grows out along the turned tangent and then curls down
      return cubicPoints([px, py], [px + ux * len * 0.4, py + uy * len * 0.4], [px + ux * len * 0.8, py + uy * len * 0.8 + len * 0.3], [px + ux * len, py + uy * len + len * 0.7], 8);
    };
    const rootOutline = outline(ctx, ctx.ink, 2);
    const drawRoot = (t: number, tipX: number, tipY: number, tint: string | null, tintStyle: NodeStyle["fillStyle"], hw: number, band: number) => {
      const spine = spineTo(t, tipX, tipY);
      const outer = t < 0 ? 1 : t > 0 ? -1 : 1;
      const layer = (pts: P[], z: number) => {
        ctx.poly(pts, { stroke: "transparent", strokeWidth: 0, fill: ctx.preset.background, fillStyle: "solid", roughness: 0 }, { z });
        if (tint) ctx.poly(pts, { stroke: "transparent", fill: tint, fillStyle: tintStyle, strokeWidth: 0, roughness: 0 }, { z: z + 1 });
        ctx.poly(pts, rootOutline, { z: z + 2 });
      };
      const z0 = band * 6;
      layer(taperedOutline(rootlet(spine, 7, outer * 0.7, 34), hw * 0.4, 0.8), z0);
      layer(taperedOutline(rootlet(spine, 12, -outer * 0.65, 24), hw * 0.32, 0.8), z0);
      layer(taperedOutline(spine, hw, 1.2), z0 + 3);
    };
    const tipYAt = (t: number) => groundY + 90 + 24 * (1 - Math.abs(t));
    // outer roots get the lowest bands so the inner ones lie on top of them
    const bandOf = (t: number) => Math.round((1 - Math.abs(t)) * 8);
    // with fewer than three causes, neutral filler roots keep the root ball full
    if (n <= 1) {
      drawRoot(-0.8, -170, tipYAt(0.8), null, "none", 8, 0);
      drawRoot(0.8, 170, tipYAt(0.8), null, "none", 8, 0);
    } else if (n === 2) {
      drawRoot(0, 0, tipYAt(0) - 10, null, "none", 8, 0);
    }
    causes.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const tipX = -spread / 2 + pitch * (i + 0.5);
        const t = n > 1 ? tipX / (spread / 2) : 0;
        const tipY = tipYAt(t);
        drawRoot(t, tipX, tipY, role.fill, role.fillStyle, 10, 1 + bandOf(t));
        // cause label + detail under the tip, each wrapped to balanced lines
        const maxW = pitch - 40;
        const lab = ctx.label(balancedWrap(ctx, item.label, maxW, labelSize, "heading", 3), tipX, tipY + 18, {
          size: labelSize,
          color: role.color,
          font: "heading",
          weight: ctx.preset.fonts.headingWeight,
          vAnchor: "top",
          z: Z_TRUNK + 4,
        });
        if (item.detail) {
          ctx.label(balancedWrap(ctx, item.detail, maxW, detailSize, "body", 4), tipX, lab.y + lab.h + 6, {
            size: detailSize,
            color: ctx.mutedInk,
            vAnchor: "top",
            role: "detail",
            z: Z_TRUNK + 4,
          });
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

  const pitch = 84;
  const ys = inputs.map((_, i) => i * pitch);
  const midY = ((n - 1) * pitch) / 2;
  const textX = 56;
  const blockW = 230;
  const blocks = inputs.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: blockW }));
  // each beam leaves its label through a port dot, clear of the text
  const portX = (i: number) => textX + blocks[i].w + 20;
  const maxPort = Math.max(textX + 40, ...inputs.map((_, i) => portX(i)));

  // lens glyph (tall ellipse outline, neutral)
  const lensH = Math.max(240, (n - 1) * pitch + 60);
  const lensW = 72;
  const lensCx = maxPort + 170 + lensW / 2;
  ctx.shape("ellipse", lensCx - lensW / 2, midY - lensH / 2, lensW, lensH, outline(ctx, ctx.mutedInk), { id: ctx.uid("lens") });
  // the focus: every beam meets here, the output leaves from here
  const focusX = lensCx + lensW / 2 + 46;

  // inputs, left: an S-curve carries each beam, level, onto the lens's left
  // face; from there it runs straight through the glass to the focus
  inputs.forEach((item, i) =>
    ctx.item(item.id, () => {
      const role = ctx.role(i, { n: n + 1, color: item.color });
      const y = ys[i];
      if (item.icon) ctx.icon(item.icon, 23, y, 46, role.color);
      else {
        ctx.shape("circle", 5, y - 18, 36, 36, role, { id: ctx.uid(item.id) });
        ctx.label(String(i + 1), 23, y, { size: 18, color: role.textColor, weight: 700, font: "heading" });
      }
      ctx.labelBlock(item.label, item.detail, textX, y, { color: role.color, align: "left", maxW: blockW });
      const sx = portX(i);
      const ey = midY + (y - midY) * 0.35;
      const k = (ey - midY) / (lensH / 2);
      const faceX = lensCx - (lensW / 2) * Math.sqrt(Math.max(0, 1 - k * k));
      strokePath(ctx, [sx, y], [sSeg(sx, y, faceX, ey), [[focusX, midY]]], { color: role.color, width: 1.8 });
      dot(ctx, sx, y, 6, role.color, 1);
    }),
  );
  dot(ctx, focusX, midY, 8, ctx.ink, 1);

  // output, right
  const outRole = ctx.role(inputs.length, { n: n + 1, color: output?.color });
  scoped(ctx, output?.id, () => {
    ctx.arrow(focusX, midY, focusX + 66, midY, { color: ctx.preset.edge, width: 1.8 });
    const blockX = focusX + 84;
    if (output?.icon) ctx.icon(output.icon, blockX + 23, midY, 46, outRole.color);
    const outTextX = output?.icon ? blockX + 56 : blockX;
    ctx.labelBlock(outputLabel ?? "Outcome", outputDetail, outTextX, midY, { color: outRole.color, align: "left", maxW: 220 });
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

    // the question is the hub: a pill every arrow leaves from — the straight
    // arrows from its sides, the curved ones from its underside
    const qText = question ? ctx.wrap(question, 420, 25, "heading", 2) : "";
    const qLines = qText ? qText.split("\n") : [];
    const pillW = qLines.length ? Math.max(...qLines.map((l) => ctx.measure(l, 25, "heading"))) + 56 : 120;
    const pillH = Math.max(64, qLines.length * 25 * 1.3 + 28);
    const hub = anchorStyle(ctx);
    scoped(ctx, questionEntry?.id, () => {
      if (!qText) return;
      ctx.shape("round-rectangle", -pillW / 2, -pillH / 2, pillW, pillH, { ...hub, roundness: pillH / 2 }, { id: ctx.uid("hub") });
      ctx.label(qText, 0, 0, { size: 25, color: ctx.ink, weight: 700, font: "heading" });
    });

    // arrow geometry — four uniform outlined block arrows: straight fat
    // arrows left/right, curved fat arrows (thick Js) bending 90° down between
    const top = pillH / 2 - 2; // J tails tuck under the pill's lower edge
    const AW = 170; // straight arrow length
    const AH = 76; // straight arrow height
    const gapX = pillW / 2 - 2; // straight arrow tails tuck under the pill's sides
    const rowCy = 0;
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
    // a ray leaves the pill's rim (an ellipse through its sides and ends)
    const rim = (a: number): number => {
      const rx = pillW / 2 + 4;
      const ry = pillH / 2 + 4;
      const c = Math.cos((a * Math.PI) / 180);
      const s = Math.sin((a * Math.PI) / 180);
      return 1 / Math.sqrt((c / rx) ** 2 + (s / ry) ** 2);
    };

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
              z: -1,
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
            // seat the tail beside the pill's centre (down-center: straddle it)
            const bx = slot.kind === "down-left" ? -10 - sx(106) : slot.kind === "down-right" ? 10 - sx(14) : -CW / 2;
            ctx.path(mirrored ? DIVERGE_CURVE_R : DIVERGE_CURVE_L, DIVERGE_CURVE_VW, DIVERGE_CURVE_VH, bx, top, CW, CH, role, { id: ctx.uid(item.id), z: -1 });
            const headX = bx + sx(mirrored ? 92 : 28);
            // item icon on the body's centreline where the J runs near-vertical
            // (at the head's own x the body has already swung away from it)
            if (item.icon) ctx.icon(item.icon, bx + sx(mirrored ? 89 : 31), top + (CH * 116) / DIVERGE_CURVE_VH, 24, role.textColor);
            const tipY = top + CH;
            const shift = slot.kind === "down-left" ? -30 : slot.kind === "down-right" ? 30 : 0;
            ctx.labelBlock(item.label, item.detail, headX + shift, tipY + 16, { color: role.color, align: "center", maxW: 210, vAnchor: "top" });
            break;
          }
          case "ray": {
            const a = slot.angle ?? 90;
            const r0 = rim(a);
            const from = polar(0, 0, r0, a);
            const to = polar(0, 0, r0 + 130, a);
            ctx.line([from, to], { color: role.color, width: 5, arrow: true, id: ctx.uid(item.id) });
            const tip = polar(0, 0, r0 + 154, a);
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
    // the beam leaves through ONE point on the far face, at its own height —
    // on the solid's outward boundary, so no ray re-enters the prism
    const s = (cy - (triY - 22)) / triH;
    const exitX = triX + triW / 2 + 64 + s * (triW / 2);

    // input node + beam in, straight through the glass to the exit point
    const inRole = inputEntry?.color ? ctx.role(0, { color: inputEntry.color }) : undefined;
    const inColor = inRole?.color ?? ctx.ink;
    scoped(ctx, inputEntry?.id, () => {
      ctx.shape("round-rectangle", 0, cy - 36, 72, 72, outline(ctx, inColor), { id: ctx.uid("input") });
      ctx.icon(inputEntry?.icon ?? "bulb", 36, cy, 40, inColor);
      ctx.label(ctx.wrap(inputLabel, 150, 20, "heading", 2), 36, cy + 62, { size: 20, color: inColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
      ctx.line(
        [
          [74, cy],
          [exitX, cy],
        ],
        { color: ctx.preset.edge, width: 2 },
      );
    });

    // output beams fanning right from the exit point to rounded-square nodes
    const pitch = 84;
    const nodeX = 580;
    const startY = cy - ((n - 1) * pitch) / 2;
    outputs.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const y = startY + i * pitch;
        ctx.line(
          [
            [exitX, cy],
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
    dot(ctx, exitX, cy, 7, ctx.preset.edge, 1);
  },
});
