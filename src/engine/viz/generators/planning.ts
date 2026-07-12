/**
 * Planning & analysis visualizations (viz roadmap tier 2, 2026-07):
 * okr, kanban, decision-tree, heatmap, slope-chart, tug-of-war.
 * See design-notes/viz-roadmap-2026-07.md for the selection rationale.
 */

import type { NodeStyle } from "../../scene/types.js";
import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { fmtNum } from "./util.js";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// ---- okr -----------------------------------------------------------------------

registerViz({
  name: "okr",
  category: "Business Frameworks",
  summary: "One objective branching into key-result cards with progress bars.",
  entryKinds: ["item", "kr", "objective"],
  options: [
    { name: "objective", type: "string", description: "objective text (or use an `objective` entry / the title)" },
    { name: "showValues", type: "boolean", description: "print progress percentages (default true)" },
  ],
  sweetSpot: { min: 2, max: 4 },
  generate(spec: VizSpec, ctx: VizContext) {
    const krs = itemsOf(spec, "item", "kr");
    const n = Math.max(krs.length, 1);
    const objEntry = spec.items.find((i) => i.kind === "objective");
    const objective = objEntry?.label ?? optStr(spec.options, "objective") ?? spec.title;
    if (objective && objective === spec.title) ctx.titleHandled = true;

    const cardW = 224;
    const gap = 30;
    const totalW = n * cardW + (n - 1) * gap;

    // objective banner, centered above the key results
    const objText = ctx.wrap(objective ?? "Objective", 300, 20, "heading", 3);
    const objW = Math.max(220, ...objText.split("\n").map((l) => ctx.measure(l, 20, "heading"))) + 48;
    const objH = objText.split("\n").length * 26 + 30;
    const objX = totalW / 2 - objW / 2;
    const drawObj = () => {
      ctx.shape("round-rectangle", objX, 0, objW, objH, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.6, roughness: ctx.preset.roughness, roundness: 12 }, { id: ctx.uid("objective") });
      ctx.label(objText, totalW / 2, objH / 2, { size: 20, color: ctx.ink, weight: 700, font: "heading" });
    };
    if (objEntry) ctx.item(objEntry.id, drawObj);
    else drawObj();

    // key-result cards: label + progress track + percentage
    const cardTop = objH + 58;
    const labelHs = krs.map((kr) => ctx.measureLabelBlock(kr.label, kr.detail, { maxW: cardW - 40, size: 16 }).h);
    const cardH = Math.max(96, ...labelHs.map((h) => h + 58));
    krs.forEach((kr, i) =>
      ctx.item(kr.id, () => {
        const role = ctx.role(i, { n, color: kr.color });
        const x = i * (cardW + gap);
        const cx = x + cardW / 2;
        // elbow connector from the objective down into the card
        const midY = objH + 28;
        ctx.line(
          [
            [totalW / 2, objH],
            [totalW / 2, midY],
            [cx, midY],
            [cx, cardTop],
          ],
          { color: ctx.preset.edge, width: 1.6 },
        );
        ctx.shape("round-rectangle", x, cardTop, cardW, cardH, { stroke: role.color, fill: null, fillStyle: "none", strokeWidth: 2, roughness: ctx.preset.roughness, roundness: 10 }, { id: ctx.uid(kr.id) });
        ctx.labelBlock(kr.label, kr.detail, x + 16, cardTop + 16, { color: ctx.ink, align: "left", maxW: cardW - 40, vAnchor: "top", size: 16 });
        // progress: values ≤ 1 read as fractions, else percentages
        const raw = kr.value ?? 0;
        const pct = clamp(raw <= 1 ? raw * 100 : raw, 0, 100);
        const barY = cardTop + cardH - 30;
        const barW = cardW - 32 - (ctx.showValue(kr) ? 46 : 0);
        ctx.shape("round-rectangle", x + 16, barY, barW, 13, { stroke: ctx.mutedInk, fill: null, fillStyle: "none", strokeWidth: 1.2, roughness: ctx.preset.roughness, roundness: 6 });
        if (pct > 3) {
          ctx.shape("round-rectangle", x + 16, barY, Math.max(10, (barW * pct) / 100), 13, { stroke: role.color, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: 1, roughness: ctx.preset.roughness, roundness: 6 });
        }
        if (ctx.showValue(kr)) ctx.label(`${Math.round(pct)}%`, x + cardW - 16, barY + 7, { size: 16, color: role.color, weight: 700, align: "right", font: "heading", role: "value" });
      }),
    );
  },
});

// ---- kanban ---------------------------------------------------------------------

registerViz({
  name: "kanban",
  category: "Process",
  summary: "Named columns of hand-drawn cards — the task board.",
  entryKinds: ["column", "lane", "item"],
  sweetSpot: { min: 2, max: 4 },
  generate(spec: VizSpec, ctx: VizContext) {
    const columns = itemsOf(spec, "column", "lane", "item").filter((c) => c.children.length || c.kind !== "item");
    const n = Math.max(columns.length, 1);
    const colW = 216;
    const gap = 24;
    const headerH = 52;
    const cardGap = 12;

    // measure card stacks first so all panels share one height
    const stacks = columns.map((col) =>
      col.children.map((card) => {
        const text = ctx.wrap(card.label, colW - 56, 15, "body", 3);
        return { card, text, h: text.split("\n").length * 19 + 24 };
      }),
    );
    const panelH = Math.max(170, ...stacks.map((s) => headerH + s.reduce((a, c) => a + c.h + cardGap, 0) + 16));

    columns.forEach((col, i) => {
      const role = ctx.role(i, { n, color: col.color });
      const x = i * (colW + gap);
      ctx.item(col.id, () => {
        ctx.shape("round-rectangle", x, 0, colW, panelH, { stroke: ctx.mutedInk, fill: null, fillStyle: "none", strokeWidth: 1.6, roughness: ctx.preset.roughness, roundness: 12 }, { id: ctx.uid(col.id) });
        ctx.label(col.label, x + 18, headerH / 2 + 2, { size: 18, color: role.color, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" });
        // count chip
        const chipX = x + colW - 34;
        ctx.shape("circle", chipX, headerH / 2 - 13, 28, 28, { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 1.6, roughness: ctx.preset.roughness });
        ctx.label(String(col.children.length), chipX + 14, headerH / 2 + 1, { size: 15, color: role.color, weight: 700, font: "heading" });
        ctx.line([[x + 12, headerH], [x + colW - 12, headerH]], { color: ctx.mutedInk, width: 1.2 });
      });
      let y = headerH + 14;
      stacks[i].forEach(({ card, text, h }) => {
        ctx.item(card.id, () => {
          ctx.shape("round-rectangle", x + 12, y, colW - 24, h, { stroke: role.stroke, fill: role.softFill, fillStyle: "solid", strokeWidth: 1.6, roughness: ctx.preset.roughness, roundness: 8 }, { id: ctx.uid(card.id) });
          if (card.icon) ctx.icon(card.icon, x + 30, y + h / 2, 18, role.color);
          ctx.label(text, x + (card.icon ? 44 : 26), y + h / 2, { size: 15, color: ctx.ink, align: "left" });
        });
        y += h + cardGap;
      });
    });
  },
});

// ---- decision-tree ---------------------------------------------------------------

interface TreeNode {
  item: VizItem;
  children: TreeNode[];
  /** leaf rows this subtree occupies */
  rows: number;
  /** assigned center y */
  y: number;
  /** color role index (leaves get distinct roles) */
  role: number;
}

registerViz({
  name: "decision-tree",
  category: "Comparison",
  summary: "Questions branching left-to-right through labeled yes/no edges to outcomes.",
  entryKinds: ["item", "question", "option"],
  sweetSpot: { min: 2, max: 3 },
  generate(spec: VizSpec, ctx: VizContext) {
    const top = itemsOf(spec, "item", "question", "option");
    if (!top.length) return;
    // one top-level entry is the root; several = synthesize a root from the title
    let rootItem: VizItem;
    if (top.length === 1) rootItem = top[0];
    else {
      rootItem = { kind: "question", id: "root", label: spec.title ?? "Decide", detail: undefined, value: undefined, values: [], strings: [], opts: {}, children: top };
      if (spec.title) ctx.titleHandled = true;
    }

    let leafSeq = 0;
    const build = (item: VizItem): TreeNode => {
      const children = item.children.map(build);
      const rows = children.length ? children.reduce((a, c) => a + c.rows, 0) : 1;
      return { item, children, rows, y: 0, role: children.length ? -1 : leafSeq++ };
    };
    const root = build(rootItem);
    const nLeaves = Math.max(leafSeq, 1);

    const rowH = 66;
    const assign = (node: TreeNode, topRow: number): void => {
      node.y = (topRow + node.rows / 2) * rowH;
      let r = topRow;
      for (const c of node.children) {
        assign(c, r);
        r += c.rows;
      }
    };
    assign(root, 0);

    // per-depth column widths from the widest wrapped label in that column
    // (icon nodes reserve extra room so the glyph never overlaps the text)
    const colW: number[] = [];
    const measure = (node: TreeNode, depth: number): void => {
      const w = Math.max(96, ...ctx.wrap(node.item.label, 168, 16, "heading", 3).split("\n").map((l) => ctx.measure(l, 16, "heading"))) + (node.item.icon ? 72 : 40);
      colW[depth] = Math.max(colW[depth] ?? 0, w);
      node.children.forEach((c) => measure(c, depth + 1));
    };
    measure(root, 0);
    const hGap = 86;
    const colX: number[] = [];
    colW.forEach((w, d) => (colX[d] = d === 0 ? 0 : colX[d - 1] + colW[d - 1] + hGap));

    const draw = (node: TreeNode, depth: number): void => {
      const isLeaf = !node.children.length;
      const w = colW[depth];
      const text = ctx.wrap(node.item.label, 168, 16, "heading", 3);
      const h = Math.max(46, text.split("\n").length * 21 + 18);
      const x = colX[depth];
      ctx.item(node.item.id, () => {
        const role = isLeaf ? ctx.role(node.role, { n: nLeaves, color: node.item.color }) : undefined;
        if (isLeaf && role) {
          ctx.shape("pill", x, node.y - h / 2, w, h, role, { id: ctx.uid(node.item.id) });
          if (node.item.icon) {
            ctx.icon(node.item.icon, x + 26, node.y, 20, role.textColor);
            ctx.label(text, x + 44, node.y, { size: 16, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" });
          } else {
            ctx.label(text, x + w / 2, node.y, { size: 16, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
          }
        } else {
          ctx.shape("round-rectangle", x, node.y - h / 2, w, h, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.2, roughness: ctx.preset.roughness, roundness: 10 }, { id: ctx.uid(node.item.id) });
          ctx.label(text, x + w / 2, node.y, { size: 16, color: ctx.ink, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        }
        if (node.item.detail && isLeaf) {
          ctx.label(ctx.wrap(node.item.detail, 180, 13, "body", 2), x + w + 12, node.y, { size: 13, color: ctx.mutedInk, align: "left", role: "detail" });
        }
      });
      node.children.forEach((c) => {
        // elbow connector, labeled with the branch condition (`when:`)
        const x1 = x + w;
        const x2 = colX[depth + 1];
        const mx = x1 + (x2 - x1) / 2;
        ctx.item(c.item.id, () => {
          ctx.line(
            [
              [x1, node.y],
              [mx, node.y],
              [mx, c.y],
              [x2 - 8, c.y],
            ],
            { color: ctx.preset.edge, width: 1.7, arrow: true },
          );
          const when = typeof c.item.opts.when === "string" ? c.item.opts.when : typeof c.item.opts.label === "string" ? c.item.opts.label : undefined;
          // condition label rides above the horizontal run into the child
          if (when) ctx.label(when, (mx + x2 - 8) / 2, c.y - 13, { size: 13, color: ctx.mutedInk, weight: 700 });
        });
        draw(c, depth + 1);
      });
    };
    draw(root, 0);
  },
});

// ---- heatmap --------------------------------------------------------------------

registerViz({
  name: "heatmap",
  category: "Data",
  summary: "A matrix of intensity-shaded cells — risk matrices, skills grids.",
  entryKinds: ["row", "item"],
  options: [
    { name: "cols", type: "string[]", description: 'column headers, e.g. ["Q1","Q2","Q3"]' },
    { name: "max", type: "number", description: "intensity ceiling (default: largest value)" },
    { name: "showValues", type: "boolean", description: "print cell values (default true)" },
  ],
  sweetSpot: { min: 2, max: 7 },
  generate(spec: VizSpec, ctx: VizContext) {
    const rows = itemsOf(spec, "row", "item");
    const colNames = (spec.options.cols as unknown[] | undefined)?.map(String) ?? ((spec.options.columns as unknown[] | undefined)?.map(String) ?? []);
    const nCols = Math.max(colNames.length, ...rows.map((r) => r.values.length), 1);
    const max = optNum(spec.options, "max") ?? Math.max(1, ...rows.flatMap((r) => r.values));
    const cellW = 72;
    const cellH = 48;
    const gap = 7;
    const labelW = 20 + Math.max(60, ...rows.map((r) => ctx.measure(r.label, 16)));
    const accent = ctx.role(0, { n: 1 }).color;

    for (let c = 0; c < nCols; c++) {
      ctx.label(colNames[c] ?? String(c + 1), labelW + c * (cellW + gap) + cellW / 2, 0, { size: 15, color: ctx.mutedInk, weight: ctx.preset.fonts.headingWeight, font: "heading" });
    }
    rows.forEach((row, r) =>
      ctx.item(row.id, () => {
        const cy = 26 + r * (cellH + gap) + cellH / 2;
        ctx.label(row.label, labelW - 14, cy, { size: 16, color: ctx.ink, align: "right" });
        for (let c = 0; c < nCols; c++) {
          const v = row.values[c];
          const x = labelW + c * (cellW + gap);
          if (v === undefined) {
            ctx.shape("round-rectangle", x, cy - cellH / 2, cellW, cellH, { stroke: ctx.mutedInk, fill: null, fillStyle: "none", strokeWidth: 1, roughness: ctx.preset.roughness, roundness: 8, strokeStyle: "dashed" });
            continue;
          }
          const t = clamp(v / max, 0, 1);
          ctx.shape("round-rectangle", x, cy - cellH / 2, cellW, cellH, { stroke: accent, fill: accent, fillStyle: "solid", strokeWidth: 1.2, roughness: ctx.preset.roughness, roundness: 8, opacity: Math.round(16 + t * 82) });
          if (ctx.showValue(row)) {
            ctx.label(fmtNum(v), x + cellW / 2, cy, { size: 15, color: t > 0.55 ? ctx.preset.background : ctx.ink, weight: 700, font: "heading", role: "value", z: 3 });
          }
        }
      }),
    );
  },
});

// ---- slope-chart ------------------------------------------------------------------

registerViz({
  name: "slope-chart",
  category: "Data",
  summary: "Before → after lines, one per series — rank and magnitude change at a glance.",
  entryKinds: ["item", "series"],
  options: [
    { name: "left", type: "string", description: 'left column header (default "Before")' },
    { name: "right", type: "string", description: 'right column header (default "After")' },
    { name: "showValues", type: "boolean", description: "print endpoint values (default true)" },
  ],
  sweetSpot: { min: 2, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "series").filter((i) => i.values.length >= 2);
    const n = Math.max(items.length, 1);
    const leftHdr = optStr(spec.options, "left") ?? "Before";
    const rightHdr = optStr(spec.options, "right") ?? "After";
    const H = Math.max(240, n * 62);
    const xL = 0;
    const xR = 300;
    const all = items.flatMap((i) => [i.values[0], i.values[1]]);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = hi - lo || 1;
    const yOf = (v: number) => 26 + (H - 52) * (1 - (v - lo) / span);

    // headers + the two axis posts
    ctx.label(leftHdr, xL, -26, { size: 17, color: ctx.mutedInk, weight: ctx.preset.fonts.headingWeight, font: "heading" });
    ctx.label(rightHdr, xR, -26, { size: 17, color: ctx.mutedInk, weight: ctx.preset.fonts.headingWeight, font: "heading" });
    ctx.line([[xL, 0], [xL, H]], { color: ctx.mutedInk, width: 1.4 });
    ctx.line([[xR, 0], [xR, H]], { color: ctx.mutedInk, width: 1.4 });

    // label rows relaxed so close values never overlap
    const relax = (ys: number[]): number[] => {
      const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
      const out = [...ys];
      for (let k = 1; k < order.length; k++) {
        const [prevY] = [out[order[k - 1][1]]];
        if (out[order[k][1]] - prevY < 26) out[order[k][1]] = prevY + 26;
      }
      return out;
    };
    const yLs = relax(items.map((i) => yOf(i.values[0])));
    const yRs = relax(items.map((i) => yOf(i.values[1])));

    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const [v0, v1] = item.values;
        const y0 = yOf(v0);
        const y1 = yOf(v1);
        ctx.line([[xL, y0], [xR, y1]], { color: role.color, width: 2.6 });
        for (const [px, py] of [[xL, y0], [xR, y1]] as Array<[number, number]>) {
          ctx.shape("circle", px - 6, py - 6, 12, 12, { stroke: role.color, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0.7 });
        }
        const lv = ctx.showValue(item) ? `  ${fmtNum(v0)}` : "";
        const rv = ctx.showValue(item) ? `${fmtNum(v1)}` : "";
        ctx.label(`${item.label}${lv}`, xL - 14, yLs[i], { size: 16, color: role.color, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "right" });
        if (rv) ctx.label(rv, xR + 14, yRs[i], { size: 16, color: role.color, weight: 700, font: "heading", align: "left", role: "value" });
      }),
    );
  },
});

// ---- tug-of-war ------------------------------------------------------------------

registerViz({
  name: "tug-of-war",
  category: "Visual Metaphors",
  summary: "Two teams pulling a rope — the marker drifts toward the stronger side.",
  entryKinds: ["side", "team"],
  options: [{ name: "tilt", type: "left|right|balanced", description: "override the computed balance" }],
  sweetSpot: { min: 2, max: 2 },
  generate(spec: VizSpec, ctx: VizContext) {
    const sides = itemsOf(spec, "side", "team").slice(0, 2);
    if (!sides.length) return;
    const weigh = (s: VizItem | undefined): number => s?.value ?? (s?.children.reduce((a, c) => a + (c.value ?? 1), 0) || 1);
    const [L, R] = [sides[0], sides[1]];
    const wL = weigh(L);
    const wR = weigh(R);
    const tilt = optStr(spec.options, "tilt");
    const bias = tilt === "left" ? -0.5 : tilt === "right" ? 0.5 : tilt === "balanced" ? 0 : clamp((wR - wL) / (wL + wR), -0.5, 0.5);

    const ropeY = 150;
    const midX = 280;
    const knotX = midX + bias * 120;

    // center reference + rope with a slight sag at the marker knot
    ctx.line([[midX, ropeY - 40], [midX, ropeY + 52]], { color: ctx.mutedInk, width: 1.3, dash: true });
    ctx.line([[92, ropeY - 4], [knotX, ropeY + 5]], { color: ctx.ink, width: 3 });
    ctx.line([[knotX, ropeY + 5], [468, ropeY - 4]], { color: ctx.ink, width: 3 });
    // marker ribbon on the knot
    ctx.line([[knotX, ropeY + 5], [knotX, ropeY + 34]], { color: ctx.ink, width: 2 });
    ctx.poly(
      [
        [knotX, ropeY + 12],
        [knotX + 26, ropeY + 19],
        [knotX, ropeY + 26],
      ],
      { stroke: ctx.ink, fill: ctx.ink, fillStyle: "solid", strokeWidth: 1.4, roughness: ctx.preset.roughness },
    );

    // stick figure hauling backward: leaning AWAY from center, hands on the
    // rope toward center, front leg braced, back leg dug in
    const figure = (x: number, away: -1 | 1, color: string) => {
      const grip = x - away * 26;
      const hipX = x + away * 6;
      const shX = x + away * 17;
      ctx.shape("circle", x + away * 23 - 8, ropeY - 40, 16, 16, { stroke: color, fill: null, fillStyle: "none", strokeWidth: 2, roughness: ctx.preset.roughness });
      ctx.line([[hipX, ropeY + 14], [shX, ropeY - 24]], { color, width: 2.2 }); // torso leaning back
      ctx.line([[shX, ropeY - 22], [grip, ropeY - 2]], { color, width: 2 }); // upper arm
      ctx.line([[shX, ropeY - 16], [grip + away * 7, ropeY + 2]], { color, width: 2 }); // lower arm
      ctx.line([[hipX, ropeY + 14], [x - away * 13, ropeY + 44]], { color, width: 2.2 }); // braced front leg
      ctx.line([[hipX, ropeY + 14], [x + away * 17, ropeY + 44]], { color, width: 2.2 }); // dug-in back leg
      ctx.line([[x - away * 22, ropeY + 46], [x + away * 26, ropeY + 46]], { color: ctx.mutedInk, width: 1.5 }); // ground
    };

    sides.forEach((side, si) =>
      ctx.item(side.id, () => {
        const role = ctx.role(si, { n: 2, color: side.color });
        const away = (si === 0 ? -1 : 1) as -1 | 1;
        figure(si === 0 ? 200 : 360, away, role.color);
        figure(si === 0 ? 148 : 412, away, role.color);
        // side label + its forces beneath the team
        const lx = si === 0 ? 40 : 520;
        const align = si === 0 ? "left" : "right";
        ctx.label(side.label, lx, ropeY + 84, { size: 19, color: role.color, weight: 700, font: "heading", align });
        side.children.forEach((f, fi) => {
          ctx.label(ctx.wrap(f.label, 210, 14, "body", 2), lx, ropeY + 112 + fi * 26, { size: 14, color: ctx.mutedInk, align, role: "detail" });
        });
        if (side.icon) ctx.icon(side.icon, si === 0 ? lx + 12 : lx - 12, ropeY - 78, 28, role.color);
      }),
    );
  },
});
