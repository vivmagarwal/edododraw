/**
 * Grid / panel visualizations: swot, pestel, quadrant, table, pros-and-cons,
 * versus, problem-solution, transformation.
 * Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { RoleStyle } from "../../style/presets.js";
import { lerp } from "./util.js";

/** Accent color that reads on top of a role-styled panel across fill modes:
 *  the raw palette color on unfilled (outline) panels, contrast ink on filled ones. */
const onPanel = (role: RoleStyle): string => (role.fill ? role.textColor : role.color);

/** Body-text color inside a role-styled panel. */
const inPanel = (ctx: VizContext, role: RoleStyle): string => (role.fill ? role.textColor : ctx.ink);

/** List option (e.g. `xLabels: ["Not urgent", "Urgent"]`). */
function optList(opts: Record<string, unknown>, key: string): string[] | undefined {
  const v = opts[key];
  return Array.isArray(v) ? v.map(String) : undefined;
}

interface BulletOpts {
  dotD?: number;
  dotColor: string;
  textColor: string;
  maxW: number;
  size?: number;
  pitch?: number;
}

/** Bullet list (dot + wrapped text); returns the height consumed. */
function bulletList(ctx: VizContext, entries: VizItem[], x: number, y: number, opts: BulletOpts): number {
  const dotD = opts.dotD ?? 12;
  const size = opts.size ?? 15;
  const pitch = opts.pitch ?? 42;
  entries.forEach((entry, i) => {
    const cy = y + i * pitch + pitch / 2;
    ctx.shape("circle", x, cy - dotD / 2, dotD, dotD, {
      stroke: opts.dotColor,
      fill: opts.dotColor,
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: ctx.preset.roughness,
    });
    ctx.label(ctx.wrap(entry.label, opts.maxW, size, undefined, 2), x + dotD + 12, cy, { size, color: opts.textColor, align: "left" });
  });
  return entries.length * pitch;
}

const lineCount = (wrapped: string): number => wrapped.split("\n").length;

// ---- swot -------------------------------------------------------------------

registerViz({
  name: "swot",
  category: "Business Frameworks",
  summary: "Stacked S/W/O/T panels with a big display letter, title and bullets.",
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "section");
    const n = Math.max(items.length, 1);
    const W = 560;
    const pad = 22;
    const contentX = 190;
    const contentW = W - contentX - pad;
    const pitch = 46;

    // Uniform panel height fitting the busiest panel.
    let panelH = 160;
    for (const item of items) {
      let need = 76; // padding + title row
      if (item.detail) need += lineCount(ctx.wrap(item.detail, contentW, 15)) * 19 + 10;
      need += item.children.length * pitch + 18;
      panelH = Math.max(panelH, need);
    }

    items.forEach((item, i) => {
      const role = ctx.role(i, { n, color: item.color });
      const y = i * (panelH + 18);
      ctx.shape("rectangle", 0, y, W, panelH, role, { id: ctx.uid(item.id), style: { roundness: role.roundness ?? 8 } });
      const accent = onPanel(role);
      const body = inPanel(ctx, role);
      // big display letter in the left third
      const letter = (item.label.trim()[0] ?? "?").toUpperCase();
      ctx.label(letter, 95, y + panelH / 2, { size: 110, color: accent, weight: 700, font: "heading" });
      if (item.icon) ctx.icon(item.icon, 95, y + panelH - 34, 30, accent);
      let cy = y + pad + 12;
      ctx.label(ctx.wrap(item.label, contentW, 20, "heading", 2), contentX, cy, {
        size: 20,
        color: accent,
        align: "left",
        vAnchor: "top",
        font: "heading",
        weight: ctx.preset.fonts.headingWeight,
      });
      cy += 36;
      if (item.detail) {
        const text = ctx.wrap(item.detail, contentW, 15);
        ctx.label(text, contentX, cy, { size: 15, color: body, align: "left", vAnchor: "top" });
        cy += lineCount(text) * 19 + 10;
      }
      bulletList(ctx, item.children, contentX, cy, { dotColor: accent, textColor: body, maxW: contentW - 24, pitch });
    });
  },
});

// ---- pestel -----------------------------------------------------------------

registerViz({
  name: "pestel",
  category: "Business Frameworks",
  summary: "Vertical category cards — big letter, title, summary, bullets.",
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "card", "category", "factor");
    const n = Math.max(items.length, 1);
    const W = 182;
    const gap = 14;
    const pad = 15;
    const contentW = W - pad * 2;

    // Uniform card height fitting the busiest card.
    let cardH = 340;
    for (const item of items) {
      let need = 96 + lineCount(ctx.wrap(item.label, contentW, 20, "heading", 3)) * 25 + 14;
      if (item.detail) need += lineCount(ctx.wrap(item.detail, contentW, 15)) * 19 + 14;
      need += item.children.length * 54 + pad;
      cardH = Math.max(cardH, need);
    }

    items.forEach((item, i) => {
      const role = ctx.role(i, { n, color: item.color });
      const x = i * (W + gap);
      ctx.shape("rectangle", x, 0, W, cardH, role, { id: ctx.uid(item.id), style: { roundness: role.roundness ?? 8 } });
      const accent = onPanel(role);
      const body = inPanel(ctx, role);
      const cx = x + W / 2;
      const letter = (item.label.trim()[0] ?? "?").toUpperCase();
      ctx.label(letter, cx, 52, { size: 64, color: accent, weight: 700, font: "heading" });
      if (item.icon) ctx.icon(item.icon, cx, 52, 30, accent);
      let cy = 96;
      const title = ctx.wrap(item.label, contentW, 20, "heading", 3);
      ctx.label(title, cx, cy, { size: 20, color: accent, vAnchor: "top", font: "heading", weight: ctx.preset.fonts.headingWeight });
      cy += lineCount(title) * 25 + 14;
      if (item.detail) {
        const text = ctx.wrap(item.detail, contentW, 15);
        ctx.label(text, x + pad, cy, { size: 15, color: body, align: "left", vAnchor: "top" });
        cy += lineCount(text) * 19 + 14;
      }
      bulletList(ctx, item.children, x + pad, cy, { dotD: 7, dotColor: accent, textColor: body, maxW: contentW - 22, pitch: 54 });
    });
  },
});

// ---- quadrant ---------------------------------------------------------------

registerViz({
  name: "quadrant",
  aliases: ["2x2", "matrix"],
  category: "Comparison",
  summary: "2×2 matrix on double-headed axes; items in TL/TR/BL/BR order.",
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "quadrant").slice(0, 4);
    const W = 720;
    const H = 600;
    const cx = W / 2;
    const cy = H / 2;
    const edge = ctx.preset.edge;

    // double-headed arrow axes crossing at the center
    ctx.line(
      [
        [0, cy],
        [W, cy],
      ],
      { color: edge, width: 1.8 },
    );
    ctx.arrowhead(cx, cy, W, cy, edge, 1.8);
    ctx.arrowhead(cx, cy, 0, cy, edge, 1.8);
    ctx.line(
      [
        [cx, 0],
        [cx, H],
      ],
      { color: edge, width: 1.8 },
    );
    ctx.arrowhead(cx, cy, cx, 0, edge, 1.8);
    ctx.arrowhead(cx, cy, cx, H, edge, 1.8);

    // axis end captions: lists are [negative, positive]
    const xl = optList(spec.options, "xLabels");
    if (xl) {
      ctx.label(xl[0] ?? "", 8, cy + 16, { size: 12, color: ctx.mutedInk, align: "left" });
      ctx.label(xl[1] ?? "", W - 8, cy + 16, { size: 12, color: ctx.mutedInk, align: "right" });
    }
    const yl = optList(spec.options, "yLabels");
    if (yl) {
      ctx.label(yl[1] ?? "", cx + 12, 10, { size: 12, color: ctx.mutedInk, align: "left" });
      ctx.label(yl[0] ?? "", cx + 12, H - 10, { size: 12, color: ctx.mutedInk, align: "left" });
    }

    // quadrant centers in TL, TR, BL, BR order
    const centers: Array<[number, number]> = [
      [W * 0.25, H * 0.25],
      [W * 0.75, H * 0.25],
      [W * 0.25, H * 0.75],
      [W * 0.75, H * 0.75],
    ];
    items.forEach((item, i) => {
      const role = ctx.role(i, { n: 4, color: item.color });
      const [qx, qy] = centers[i];
      const maxW = W / 2 - 80;
      const bullets = item.children.slice(0, 3);
      const detailText = !bullets.length && item.detail ? ctx.wrap(item.detail, maxW, 15) : undefined;
      const blockH = (item.icon ? 58 : 0) + 30 + (bullets.length ? bullets.length * 38 : detailText ? lineCount(detailText) * 19 + 8 : 0);
      let y = qy - blockH / 2;
      if (item.icon) {
        ctx.icon(item.icon, qx, y + 23, 44, role.color);
        y += 58;
      }
      ctx.label(ctx.wrap(item.label, maxW, 20, "heading", 2), qx, y + 12, {
        size: 20,
        color: role.color,
        font: "heading",
        weight: ctx.preset.fonts.headingWeight,
        id: ctx.uid(item.id),
      });
      y += 34;
      if (bullets.length) {
        bulletList(ctx, bullets, qx - maxW / 2, y, { dotD: 8, dotColor: role.color, textColor: ctx.ink, maxW: maxW - 24, pitch: 38 });
      } else if (detailText) {
        ctx.label(detailText, qx, y, { size: 15, color: ctx.mutedInk, vAnchor: "top" });
      }
    });
  },
});

// ---- table ------------------------------------------------------------------

registerViz({
  name: "table",
  category: "Comparison",
  summary: "Grid of individually drawn cells; each column stroked its own color.",
  generate(spec: VizSpec, ctx: VizContext) {
    const rows = spec.items.filter((i) => i.kind === "row" || i.kind === "item" || i.kind === "header");
    let header: VizItem | undefined;
    const body: VizItem[] = [];
    for (const r of rows) {
      if (!header && (r.kind === "header" || r.opts.header === true)) header = r;
      else body.push(r);
    }
    const cellsOf = (r: VizItem): string[] => [r.label, ...r.strings];
    const all = header ? [header, ...body] : body;
    const cols = Math.max(...all.map((r) => cellsOf(r).length), 1);

    // fit column widths to content
    const colW: number[] = [];
    for (let j = 0; j < cols; j++) {
      let w = 90;
      for (const r of all) {
        const text = cellsOf(r)[j] ?? "";
        w = Math.max(w, ctx.measure(text, r === header ? 20 : 15) + 32);
      }
      colW.push(Math.min(w, 230));
    }
    const colX: number[] = [0];
    for (let j = 0; j < cols; j++) colX.push(colX[j] + colW[j] + 5);

    const headerH = 64;
    const bodyH = 52;
    // Column 0 is ink; every other column's cells are stroked in its own palette color.
    const colColor = (j: number): string => (j === 0 ? ctx.ink : ctx.role(j - 1, { n: Math.max(cols - 1, 1) }).color);
    const cellStyle = (j: number) => ({
      stroke: colColor(j),
      fill: null,
      fillStyle: "none" as const,
      strokeWidth: Math.min(2, ctx.preset.strokeWidth),
      roughness: ctx.preset.roughness,
    });

    let y = 0;
    if (header) {
      cellsOf(header).forEach((text, j) => {
        ctx.shape("rectangle", colX[j], y, colW[j], headerH, cellStyle(j), { id: j === 0 ? ctx.uid(header!.id) : undefined, style: { roundness: 6 } });
        ctx.label(ctx.wrap(text, colW[j] - 14, 20, "heading", 2), colX[j] + colW[j] / 2, y + headerH / 2, {
          size: 20,
          color: colColor(j),
          font: "heading",
          weight: ctx.preset.fonts.headingWeight,
        });
      });
      y += headerH + 5;
    }
    body.forEach((row) => {
      for (let j = 0; j < cols; j++) {
        const text = cellsOf(row)[j] ?? "";
        ctx.shape("rectangle", colX[j], y, colW[j], bodyH, cellStyle(j), { id: j === 0 ? ctx.uid(row.id) : undefined, style: { roundness: 6 } });
        if (text) ctx.label(ctx.wrap(text, colW[j] - 14, 15, undefined, 2), colX[j] + colW[j] / 2, y + bodyH / 2, { size: 15, color: ctx.ink });
      }
      y += bodyH + 5;
    });
  },
});

// ---- pros-and-cons ------------------------------------------------------------

registerViz({
  name: "pros-and-cons",
  aliases: ["pros-cons"],
  category: "Comparison",
  summary: "Two panels — pros with a check, cons with a cross — as bullet lists.",
  generate(spec: VizSpec, ctx: VizContext) {
    let pros = spec.items.filter((i) => i.kind === "pro");
    let cons = spec.items.filter((i) => i.kind === "con");
    let proTitle = "Pros";
    let conTitle = "Cons";
    // also accept two group items ("pros" / "cons") whose children are the entries
    for (const g of spec.items) {
      if (!g.children.length) continue;
      const key = `${g.kind} ${g.id} ${g.label}`.toLowerCase();
      if (!pros.length && /\bpros?\b/.test(key)) {
        pros = g.children;
        proTitle = g.label || proTitle;
      } else if (!cons.length && /\bcons?\b/.test(key)) {
        cons = g.children;
        conTitle = g.label || conTitle;
      }
    }
    // Role picks: role(2) tends to read green-ish and role(1) contrasting in the
    // wheel palettes (never hardcoded, so every preset keeps a coherent pair);
    // `proColor:` / `conColor:` options override explicitly.
    const proRole = ctx.role(2, { color: optStr(spec.options, "proColor") });
    const conRole = ctx.role(1, { color: optStr(spec.options, "conColor") });

    const panelW = 300;
    const gap = 26;
    const pad = 20;
    const rows = Math.max(pros.length, cons.length, 1);
    const panelH = 96 + rows * 42 + 10;

    const panel = (x: number, name: string, role: RoleStyle, entries: VizItem[], iconName: string, idHint: string): void => {
      ctx.shape("rectangle", x, 0, panelW, panelH, role, { id: ctx.uid(idHint), style: { roundness: role.roundness ?? 8 } });
      const accent = onPanel(role);
      const body = inPanel(ctx, role);
      ctx.label(name, x + pad, 34, { size: 20, color: accent, align: "left", font: "heading", weight: ctx.preset.fonts.headingWeight });
      ctx.icon(iconName, x + panelW - pad - 20, 32, 38, accent);
      ctx.line(
        [
          [x + pad, 58],
          [x + panelW - pad, 58],
        ],
        { color: accent, width: 1.6 },
      );
      bulletList(ctx, entries, x + pad, 82, { dotColor: accent, textColor: body, maxW: panelW - pad * 2 - 24 });
    };
    panel(0, proTitle, proRole, pros, "check", "pros");
    panel(panelW + gap, conTitle, conRole, cons, "x", "cons");
  },
});

// ---- versus -------------------------------------------------------------------

registerViz({
  name: "versus",
  aliases: ["vs"],
  category: "Comparison",
  summary: "Two contenders compared criterion by criterion around a center gutter.",
  generate(spec: VizSpec, ctx: VizContext) {
    let left = spec.items.find((i) => i.kind === "left");
    let right = spec.items.find((i) => i.kind === "right");
    for (const g of itemsOf(spec, "item", "contender")) {
      if (!left && g !== right) left = g;
      else if (!right && g !== left) right = g;
    }
    const criteria = spec.items.filter((i) => i.kind === "criterion" || i.kind === "row");

    const lRole = ctx.role(0, { color: left?.color });
    const rRole = ctx.role(1, { color: right?.color });
    const W = 920;
    const headerH = 72;
    const sideW = 380;
    const gutterCx = W / 2;
    const pitch = 150;
    const startY = 104;
    const rowsH = Math.max(criteria.length, 1) * pitch;

    // contender header bars
    ctx.shape("rectangle", 0, 0, sideW, headerH, lRole, { id: ctx.uid(left?.id ?? "left"), style: { roundness: lRole.roundness ?? 8 } });
    ctx.label(left?.label ?? "A", sideW / 2, headerH / 2, { size: 26, color: onPanel(lRole), font: "heading", weight: 700, maxW: sideW - 30 });
    ctx.shape("rectangle", W - sideW, 0, sideW, headerH, rRole, { id: ctx.uid(right?.id ?? "right"), style: { roundness: rRole.roundness ?? 8 } });
    ctx.label(right?.label ?? "B", W - sideW / 2, headerH / 2, { size: 26, color: onPanel(rRole), font: "heading", weight: 700, maxW: sideW - 30 });

    // tall inner spine bars framing the criteria gutter
    ctx.shape("rectangle", gutterCx - 130, startY, 54, rowsH, lRole, { style: { roundness: lRole.roundness ?? 8 } });
    ctx.shape("rectangle", gutterCx + 76, startY, 54, rowsH, rRole, { style: { roundness: rRole.roundness ?? 8 } });

    criteria.forEach((c, k) => {
      const cy = startY + k * pitch + pitch / 2;
      // center gutter: icon + criterion name
      let nameY = cy;
      if (c.icon && ctx.icon(c.icon, gutterCx, cy - 26, 42, ctx.ink)) nameY = cy + 12;
      ctx.label(ctx.wrap(c.label, 130, 18, "heading", 2), gutterCx, nameY, { size: 18, color: ctx.ink, font: "heading", weight: ctx.preset.fonts.headingWeight });
      // per-side claims: `left:`/`right:` opts, or the first/second child
      const lChild = c.children[0];
      const rChild = c.children[1];
      const lClaim = optStr(c.opts, "left") ?? lChild?.label;
      const rClaim = optStr(c.opts, "right") ?? rChild?.label;
      if (lClaim) ctx.labelBlock(lClaim, lChild?.detail, gutterCx - 160, cy, { color: lRole.color, align: "right", maxW: 290, size: 18 });
      if (rClaim) ctx.labelBlock(rClaim, rChild?.detail, gutterCx + 160, cy, { color: rRole.color, align: "left", maxW: 290, size: 18 });
    });
  },
});

// ---- problem-solution -----------------------------------------------------------

registerViz({
  name: "problem-solution",
  category: "Problems and Solutions",
  summary: "Problem → central solution circle → outcome, with support captions.",
  generate(spec: VizSpec, ctx: VizContext) {
    const generic = itemsOf(spec, "item");
    const problem = spec.items.find((i) => i.kind === "problem") ?? generic[0];
    const solution = spec.items.find((i) => i.kind === "solution") ?? generic[1];
    const outcome = spec.items.find((i) => i.kind === "outcome") ?? generic[2];
    const supports = spec.items.filter((i) => i.kind === "support");

    const pRole = ctx.role(1, { color: problem?.color });
    const oRole = ctx.role(2, { color: outcome?.color });
    const cx = 400;
    const ccy = 140;
    const D = 180;

    // central solution circle (ink outline)
    ctx.shape(
      "circle",
      cx - D / 2,
      ccy - D / 2,
      D,
      D,
      { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: ctx.preset.strokeWidth, roughness: ctx.preset.roughness },
      { id: ctx.uid(solution?.id ?? "solution") },
    );
    if (solution) {
      const text = ctx.wrap(solution.label, D - 44, 18, "heading", 3);
      const detail = solution.detail ? ctx.wrap(solution.detail, D - 44, 13, undefined, 3) : undefined;
      const th = lineCount(text) * 23;
      const dh = detail ? lineCount(detail) * 16 + 8 : 0;
      ctx.label(text, cx, ccy - dh / 2, { size: 18, color: ctx.ink, font: "heading", weight: ctx.preset.fonts.headingWeight });
      if (detail) ctx.label(detail, cx, ccy + th / 2 + 8, { size: 13, color: ctx.mutedInk });
    }

    // side tile + label block (problem left, outcome right)
    const tile = (item: VizItem | undefined, role: RoleStyle, tx: number, fallbackIcon: string, hint: string): void => {
      if (!item) return;
      ctx.shape("rectangle", tx, ccy - 98, 84, 84, role, { id: ctx.uid(item.id ?? hint), style: { roundness: role.roundness ?? 10 } });
      ctx.icon(item.icon ?? fallbackIcon, tx + 42, ccy - 56, 44, onPanel(role));
      ctx.labelBlock(item.label, item.detail, tx + 42, ccy + 2, { color: role.color, align: "center", maxW: 220, vAnchor: "top" });
    };
    tile(problem, pRole, 60, "trend-down", "problem");
    tile(outcome, oRole, 656, "trend-up", "outcome");

    // flow arrows into and out of the solution
    ctx.arrow(170, ccy - 56, cx - D / 2 - 12, ccy - 30, { color: ctx.preset.edge, width: 1.6 });
    ctx.arrow(cx + D / 2 + 12, ccy - 30, 630, ccy - 56, { color: ctx.preset.edge, width: 1.6 });

    // T-connector down to support captions
    if (supports.length) {
      const topY = ccy + D / 2 + 6;
      const busY = topY + 44;
      const spread = Math.min(220, 560 / supports.length);
      const first = cx - ((supports.length - 1) * spread) / 2;
      ctx.line(
        [
          [cx, topY],
          [cx, busY],
        ],
        { color: ctx.preset.edge, width: 1.4 },
      );
      if (supports.length > 1) {
        ctx.line(
          [
            [first, busY],
            [first + (supports.length - 1) * spread, busY],
          ],
          { color: ctx.preset.edge, width: 1.4 },
        );
      }
      supports.forEach((s, i) => {
        const sx = first + i * spread;
        ctx.line(
          [
            [sx, busY],
            [sx, busY + 16],
          ],
          { color: ctx.preset.edge, width: 1.4 },
        );
        ctx.label(ctx.wrap(s.label, spread - 24, 15), sx, busY + 30, { size: 15, color: ctx.mutedInk, vAnchor: "top" });
      });
    }
  },
});

// ---- transformation ---------------------------------------------------------------

registerViz({
  name: "transformation",
  aliases: ["before-after"],
  category: "Problems and Solutions",
  summary: "A suspension bridge carrying you from before to after (reference design).",
  generate(spec: VizSpec, ctx: VizContext) {
    const generic = itemsOf(spec, "item");
    const before = spec.items.find((i) => i.kind === "before") ?? generic[0];
    const after = spec.items.find((i) => i.kind === "after") ?? generic[1];
    const bRole = ctx.role(1, { color: before?.color });
    const aRole = ctx.role(2, { color: after?.color });

    const x0 = 150;
    const bandW = 640;
    const edge = ctx.preset.edge;
    const cx = x0 + bandW / 2;

    // suspension bridge: deck, two towers, cables with vertical hangers
    const deckY = 190;
    const topY = 30;
    const t1 = x0 + bandW * 0.28;
    const t2 = x0 + bandW * 0.72;
    // cable height above the deck at position x (piecewise curves; the sag
    // between towers dips to ~55px, the side spans sweep down to the ends)
    const cableY = (x: number): number => {
      if (x <= t1) {
        const u = (x - x0) / (t1 - x0);
        return deckY - (deckY - topY) * u * u;
      }
      if (x >= t2) {
        const u = (x0 + bandW - x) / (x0 + bandW - t2);
        return deckY - (deckY - topY) * u * u;
      }
      const u = (x - t1) / (t2 - t1);
      const sag = deckY - 55;
      return topY + (sag - topY) * (1 - (2 * u - 1) * (2 * u - 1));
    };
    // deck
    ctx.line(
      [
        [x0, deckY],
        [x0 + bandW, deckY],
      ],
      { color: edge, width: 2.4 },
    );
    // towers (above deck + a short leg below with a footing)
    for (const tx of [t1, t2]) {
      ctx.line(
        [
          [tx, topY - 6],
          [tx, deckY + 62],
        ],
        { color: edge, width: 3 },
      );
      ctx.line(
        [
          [tx - 12, deckY + 62],
          [tx + 12, deckY + 62],
        ],
        { color: edge, width: 2 },
      );
    }
    // cables: sampled piecewise curve across the full span
    const cablePts: Array<[number, number]> = [];
    const SEG = 64;
    for (let s = 0; s <= SEG; s++) {
      const x = x0 + (bandW * s) / SEG;
      cablePts.push([x, cableY(x)]);
    }
    ctx.line(cablePts, { color: edge, width: 2 });
    // hangers: verticals from cable to deck
    const N = 30;
    for (let i = 1; i < N; i++) {
      const hx = x0 + (bandW * i) / N;
      const hy = cableY(hx);
      if (deckY - hy < 8) continue;
      ctx.line(
        [
          [hx, hy],
          [hx, deckY],
        ],
        { color: edge, width: 1.3 },
      );
    }

    // flanking state labels at deck level
    if (before) ctx.labelBlock(before.label, undefined, x0 - 26, deckY - 10, { color: bRole.color, align: "right", maxW: 150 });
    if (after) ctx.labelBlock(after.label, undefined, x0 + bandW + 26, deckY - 10, { color: aRole.color, align: "left", maxW: 150 });
    const top = 30; // kept for the box block below

    // two description boxes below, arrow between
    const boxW = 240;
    const boxH = 86;
    const boxY = top + 226;
    const box = (item: VizItem | undefined, role: RoleStyle, bx: number, hint: string): void => {
      if (!item) return;
      ctx.shape("rectangle", bx, boxY, boxW, boxH, role, { id: ctx.uid(item.id ?? hint), style: { roundness: role.roundness ?? 8 } });
      const accent = onPanel(role);
      if (item.detail) {
        ctx.label(item.label, bx + boxW / 2, boxY + 24, { size: 17, color: accent, weight: 700, font: "heading", maxW: boxW - 28, maxLines: 1 });
        ctx.label(ctx.wrap(item.detail, boxW - 28, 13, undefined, 2), bx + boxW / 2, boxY + 54, { size: 13, color: inPanel(ctx, role) });
      } else {
        ctx.label(item.label, bx + boxW / 2, boxY + boxH / 2, { size: 17, color: accent, weight: 700, font: "heading", maxW: boxW - 28, maxLines: 2 });
      }
    };
    box(before, bRole, t1 - boxW / 2, "before");
    box(after, aRole, t2 - boxW / 2, "after");
    ctx.arrow(cx - 22, boxY + boxH / 2, cx + 22, boxY + boxH / 2, { color: edge, width: 2 });
  },
});
