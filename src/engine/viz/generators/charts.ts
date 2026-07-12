/**
 * Data charts: bar, bar-horizontal, stacked-bar(±horizontal), line, area,
 * waterfall, dumbbell-vertical/horizontal, gantt, sankey, drop-off.
 * Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { fmtNum, lerp } from "./util.js";

/** Round a max value up to a "nice" scale ceiling (1/2/2.5/5 × 10^k). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

interface AxesOpts {
  xTitle?: string;
  yTitle?: string;
  /** Arrowheads on the axis ends (classic sketch look). */
  arrows?: boolean;
}

/** L-shaped axes with optional arrowheads + titles. Origin = bottom-left. */
function drawAxes(ctx: VizContext, x0: number, y0: number, w: number, h: number, opts: AxesOpts = {}): void {
  const c = ctx.preset.edge;
  if (opts.arrows) {
    ctx.arrow(x0, y0, x0, y0 - h - 24, { color: c, width: 1.8 });
    ctx.arrow(x0, y0, x0 + w + 24, y0, { color: c, width: 1.8 });
  } else {
    ctx.line(
      [
        [x0, y0 - h],
        [x0, y0],
        [x0 + w, y0],
      ],
      { color: c, width: 1.8 },
    );
  }
  if (opts.yTitle) ctx.label(opts.yTitle, x0 - 6, y0 - h - 44, { size: 18, color: ctx.ink, align: "left", font: "heading", weight: ctx.preset.fonts.headingWeight });
  if (opts.xTitle) ctx.label(opts.xTitle, x0 + w + 34, y0, { size: 18, color: ctx.ink, align: "left", font: "heading", weight: ctx.preset.fonts.headingWeight });
}

/** Legend row of colored dots + series names, returns its height. */
function drawLegend(ctx: VizContext, names: string[], x: number, y: number): number {
  let cx = x;
  names.forEach((name, i) => {
    const role = ctx.role(i, { n: names.length });
    ctx.shape("circle", cx, y - 8, 16, 16, { ...roleFillOnly(ctx, i, names.length), stroke: role.stroke === ctx.preset.background ? role.color : role.stroke });
    cx += 24;
    const w = ctx.measure(name, 15);
    ctx.label(name, cx, y, { size: 15, color: ctx.ink, align: "left" });
    cx += w + 28;
  });
  return 30;
}

function roleFillOnly(ctx: VizContext, i: number, n: number) {
  const role = ctx.role(i, { n });
  return { fill: role.fill ?? role.color, fillStyle: "solid" as const, strokeWidth: 1, roughness: ctx.preset.roughness };
}

/** Series names: `series "A"` entries, or the `legend:`/`series:` list option. */
function seriesNames(spec: VizSpec): string[] {
  const entries = spec.items.filter((i) => i.kind === "series" && !i.values.length).map((i) => i.label);
  if (entries.length) return entries;
  const opt = spec.options.legend ?? spec.options.series;
  if (Array.isArray(opt)) return opt.map(String);
  return [];
}

// ---- bar ---------------------------------------------------------------------

registerViz({
  name: "bar",
  aliases: ["column"],
  category: "Data",
  summary: "Column chart with per-category colors and value labels.",
  sweetSpot: { min: 1, max: 12 },
  entryKinds: ["item", "bar"],
  options: [
    { name: "yTitle", type: "string", description: "y-axis title" },
    { name: "xTitle", type: "string", description: "x-axis title" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "bar");
    const n = Math.max(items.length, 1);
    const barW = 96;
    const gap = 20;
    const chartH = 280;
    const x0 = 50;
    const y0 = chartH + 40;
    const max = niceMax(Math.max(...items.map((i) => i.value ?? 0), 1));
    drawAxes(ctx, x0, y0, n * (barW + gap) + gap, chartH, {
      arrows: true,
      yTitle: optStr(spec.options, "yTitle"),
      xTitle: optStr(spec.options, "xTitle"),
    });
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const h = ((item.value ?? 0) / max) * chartH;
        const x = x0 + gap + i * (barW + gap);
        ctx.shape("rectangle", x, y0 - h, barW, h, role, { id: ctx.uid(item.id) });
        if (ctx.showValue(item)) ctx.label(fmtNum(item.value ?? 0), x + barW / 2, y0 - h - 16, { size: 15, color: role.color, weight: 700, role: "value" });
        ctx.label(ctx.wrap(item.label, barW + gap - 6, 15), x + barW / 2, y0 + 22, { size: 15, color: ctx.ink });
      }),
    );
  },
});

// ---- bar-horizontal --------------------------------------------------------------

registerViz({
  name: "bar-horizontal",
  aliases: ["hbar"],
  category: "Data",
  summary: "Horizontal bars with circular category badges.",
  sweetSpot: { min: 1, max: 8 },
  entryKinds: ["item", "bar"],
  options: [{ name: "showValues", type: "boolean", description: "print item values (default true)" }],
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "bar");
    const n = Math.max(items.length, 1);
    const rowH = 76;
    const badgeR = 27;
    const trackW = 420;
    const x0 = 110;
    const max = niceMax(Math.max(...items.map((i) => i.value ?? 0), 1));
    const valueText = (it: VizItem) => (ctx.showValue(it) ? `  ${fmtNum(it.value ?? 0)}` : "");
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const cy = i * rowH + badgeR + 6;
        ctx.shape("circle", 30 - badgeR, cy - badgeR, badgeR * 2, badgeR * 2, role, { id: ctx.uid(`${item.id}_badge`) });
        if (item.icon) ctx.icon(item.icon, 30, cy, 28, role.textColor);
        else ctx.label(String(i + 1), 30, cy, { size: 20, color: role.textColor, weight: 700 });
        const w = ((item.value ?? 0) / max) * trackW;
        ctx.shape("rectangle", x0, cy - 17, Math.max(w, 3), 34, role, { id: ctx.uid(item.id), style: { roundness: 8 } });
        ctx.label(`${item.label}${valueText(item)}`, x0 + w + 14, cy, { size: 16, color: ctx.ink, align: "left" });
      }),
    );
  },
});

// ---- stacked bars -------------------------------------------------------------------

function stackedBars(spec: VizSpec, ctx: VizContext, horizontal: boolean): void {
  const rows = itemsOf(spec, "item", "row").filter((r) => r.values.length);
  const names = seriesNames(spec);
  const k = Math.max(names.length, ...rows.map((r) => r.values.length), 1);
  const max = niceMax(Math.max(...rows.map((r) => r.values.reduce((s, v) => s + v, 0)), 1));
  let y = 0;
  if (names.length) y += drawLegend(ctx, names, horizontal ? 90 : 60, 8) + 8;

  if (horizontal) {
    const rowH = 60;
    const pitch = 88;
    const trackW = 520;
    const x0 = 90;
    rows.forEach((row, r) =>
      ctx.item(row.id, () => {
        const cy = y + r * pitch + rowH / 2 + 26;
        ctx.label(row.label, x0 - 12, cy, { size: 15, color: ctx.ink, align: "right", maxW: 84 });
        let x = x0;
        row.values.forEach((v, s) => {
          const role = ctx.role(s, { n: k });
          const w = (v / max) * trackW;
          ctx.shape("rectangle", x, cy - rowH / 2, Math.max(w, 2), rowH, role, { id: ctx.uid(`${row.id}_${s}`) });
          if (w > 44 && ctx.showValue(row)) ctx.label(fmtNum(v), x + w / 2, cy, { size: 14, color: role.textColor, role: "value" });
          x += w;
        });
      }),
    );
    const axisY = y + rows.length * pitch + 20;
    ctx.line(
      [
        [x0, y + 16],
        [x0, axisY],
        [x0 + trackW + 20, axisY],
      ],
      { color: ctx.preset.edge, width: 1.6 },
    );
    for (let t = 0; t <= 4; t++) {
      const tx = x0 + (trackW * t) / 4;
      ctx.label(fmtNum((max * t) / 4), tx, axisY + 18, { size: 13, color: ctx.mutedInk });
    }
  } else {
    const barW = 84;
    const gap = 26;
    const chartH = 300;
    const x0 = 60;
    const y0 = y + chartH + 30;
    drawAxes(ctx, x0, y0, rows.length * (barW + gap) + gap, chartH, { yTitle: optStr(spec.options, "yTitle"), xTitle: optStr(spec.options, "xTitle") });
    rows.forEach((row, r) =>
      ctx.item(row.id, () => {
        const x = x0 + gap + r * (barW + gap);
        let top = y0;
        row.values.forEach((v, s) => {
          const role = ctx.role(s, { n: k });
          const h = (v / max) * chartH;
          top -= h;
          ctx.shape("rectangle", x, top, barW, h, role, { id: ctx.uid(`${row.id}_${s}`) });
          if (h > 26 && ctx.showValue(row)) ctx.label(fmtNum(v), x + barW / 2, top + h / 2, { size: 14, color: role.textColor, role: "value" });
        });
        ctx.label(ctx.wrap(row.label, barW + gap - 6, 15), x + barW / 2, y0 + 22, { size: 15, color: ctx.ink });
      }),
    );
  }
}

registerViz({
  name: "stacked-bar",
  category: "Data",
  summary: "Stacked columns; rows are `item \"Q1\" [a, b, c]`, legend via `series`.",
  sweetSpot: { min: 2, max: 6 },
  entryKinds: ["item", "row", "series"],
  options: [
    { name: "yTitle", type: "string", description: "y-axis title" },
    { name: "xTitle", type: "string", description: "x-axis title" },
    { name: "legend", type: "string", description: "list of series names for the legend" },
    { name: "series", type: "string", description: "alias for legend" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  generate: (spec, ctx) => stackedBars(spec, ctx, false),
});

registerViz({
  name: "stacked-bar-horizontal",
  aliases: ["stacked-hbar"],
  category: "Data",
  summary: "Horizontal stacked bars with a value axis and legend.",
  sweetSpot: { min: 2, max: 6 },
  entryKinds: ["item", "row", "series"],
  options: [
    { name: "legend", type: "string", description: "list of series names for the legend" },
    { name: "series", type: "string", description: "alias for legend" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  generate: (spec, ctx) => stackedBars(spec, ctx, true),
});

// ---- line / area ------------------------------------------------------------------------

function lineChart(spec: VizSpec, ctx: VizContext, area: boolean): void {
  const points = itemsOf(spec, "item", "point");
  const n = Math.max(points.length, 2);
  const pitch = Math.max(64, Math.min(110, 720 / n));
  const chartW = (n - 1) * pitch;
  const chartH = 260;
  const x0 = 50;
  const y0 = chartH + 44;
  const max = niceMax(Math.max(...points.map((p) => p.value ?? 0), 1));
  drawAxes(ctx, x0, y0, chartW + 40, chartH, { arrows: true, yTitle: optStr(spec.options, "yTitle"), xTitle: optStr(spec.options, "xTitle") });
  const role = ctx.role(0, { n: 1, color: optStr(spec.options, "color") });
  const pts: Array<[number, number]> = points.map((p, i) => [x0 + 30 + i * pitch, y0 - ((p.value ?? 0) / max) * chartH]);
  if (area && pts.length >= 2) {
    const poly: Array<[number, number]> = [...pts, [pts[pts.length - 1][0], y0], [pts[0][0], y0]];
    ctx.poly(poly, { ...ctx.role(0, { n: 1, color: role.color }), stroke: "transparent", fill: withSoft(ctx, role.color), fillStyle: "solid" }, { z: -1 });
  }
  ctx.line(pts, { color: ctx.preset.fillMode === "outline" ? ctx.preset.edge : role.color, width: 2.2 });
  points.forEach((p, i) =>
    ctx.item(p.id, () => {
      const [px, py] = pts[i];
      ctx.shape("circle", px - 5, py - 5, 10, 10, { stroke: role.color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2, roughness: Math.min(0.6, ctx.preset.roughness) });
      if (ctx.showValue(p)) ctx.label(fmtNum(p.value ?? 0), px, py - 20, { size: 14, color: role.color, weight: 700, role: "value" });
      ctx.label(p.label, px, y0 + 20, { size: 14, color: ctx.ink });
    }),
  );
}

function withSoft(ctx: VizContext, color: string): string {
  return ctx.role(0, { color }).softFill;
}

registerViz({
  name: "line",
  category: "Data",
  summary: "Line chart with point markers and value labels.",
  sweetSpot: { min: 2, max: 14 },
  entryKinds: ["item", "point"],
  options: [
    { name: "yTitle", type: "string", description: "y-axis title" },
    { name: "xTitle", type: "string", description: "x-axis title" },
    { name: "color", type: "string", description: "line color override" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  generate: (spec, ctx) => lineChart(spec, ctx, false),
});

registerViz({
  name: "area",
  category: "Data",
  summary: "Line chart with a soft filled area underneath.",
  sweetSpot: { min: 2, max: 14 },
  entryKinds: ["item", "point"],
  options: [
    { name: "yTitle", type: "string", description: "y-axis title" },
    { name: "xTitle", type: "string", description: "x-axis title" },
    { name: "color", type: "string", description: "line color override" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  generate: (spec, ctx) => lineChart(spec, ctx, true),
});

// ---- waterfall ------------------------------------------------------------------------------

registerViz({
  name: "waterfall",
  category: "Data",
  summary: "Start bar, floating signed deltas, computed net bar, connector line.",
  sweetSpot: { min: 2, max: 8 },
  entryKinds: ["item", "delta", "total", "net", "end"],
  options: [
    { name: "yTitle", type: "string", description: "y-axis title" },
    { name: "xTitle", type: "string", description: "x-axis title" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "delta");
    const totals = spec.items.filter((i) => i.kind === "total" || i.kind === "net" || i.kind === "end");
    const barW = 84;
    const gap = 30;
    const chartH = 320;
    const x0 = 60;
    const y0 = chartH + 40;

    // running levels
    const bars: Array<{ item: VizItem; from: number; to: number; kind: "start" | "delta" | "total" }> = [];
    let level = 0;
    items.forEach((item, i) => {
      const v = item.value ?? 0;
      if (i === 0) {
        bars.push({ item, from: 0, to: v, kind: "start" });
        level = v;
      } else {
        bars.push({ item, from: level, to: level + v, kind: "delta" });
        level += v;
      }
    });
    for (const t of totals) bars.push({ item: t, from: 0, to: level, kind: "total" });

    const max = niceMax(Math.max(...bars.map((b) => Math.max(b.from, b.to)), 1));
    const yOf = (v: number) => y0 - (v / max) * chartH;
    drawAxes(ctx, x0, y0, bars.length * (barW + gap) + gap, chartH, { yTitle: optStr(spec.options, "yTitle"), xTitle: optStr(spec.options, "xTitle") });
    // gridlines
    for (let t = 1; t <= 4; t++) {
      const gy = y0 - (chartH * t) / 4;
      ctx.line(
        [
          [x0, gy],
          [x0 + bars.length * (barW + gap) + gap, gy],
        ],
        { color: ctx.mutedInk, width: 0.8, dash: true, z: -2 },
      );
      ctx.label(fmtNum((max * t) / 4), x0 - 10, gy, { size: 13, color: ctx.mutedInk, align: "right" });
    }
    const joints: Array<[number, number]> = [];
    bars.forEach((b, i) =>
      ctx.item(b.item.id, () => {
        const roleIdx = b.kind === "start" ? 0 : b.kind === "total" ? 2 : 1;
        const role = ctx.role(roleIdx, { n: 3, color: b.item.color });
        const x = x0 + gap + i * (barW + gap);
        const top = Math.min(yOf(b.from), yOf(b.to));
        const h = Math.max(Math.abs(yOf(b.from) - yOf(b.to)), 3);
        ctx.shape("rectangle", x, top, barW, h, role, { id: ctx.uid(b.item.id), style: { roundness: 6 } });
        const delta = b.to - b.from;
        const sign = b.kind === "delta" ? (delta >= 0 ? "+" : "−") : "";
        if (ctx.showValue(b.item)) ctx.label(`${sign}${fmtNum(Math.abs(b.kind === "total" ? b.to : b.kind === "start" ? b.to : delta))}`, x + barW / 2, top - 16, { size: 15, color: role.color, weight: 700, role: "value" });
        ctx.label(ctx.wrap(b.item.label, barW + gap - 4, 14), x + barW / 2, y0 + 22, { size: 14, color: ctx.ink });
        joints.push([x + barW / 2, yOf(b.to)]);
      }),
    );
    ctx.line(joints, { color: ctx.preset.edge, width: 1.4, z: 1 });
    for (const [jx, jy] of joints) {
      ctx.shape("circle", jx - 4, jy - 4, 8, 8, { stroke: ctx.preset.edge, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 1.6, roughness: 0.4 }, { z: 2 });
    }
  },
});

// ---- dumbbell-horizontal (progress tracks) -------------------------------------------------------

registerViz({
  name: "dumbbell-horizontal",
  aliases: ["progress-bars", "tracks"],
  category: "Data",
  summary: "Rows of tracks with value bars and a hanging tag bubble.",
  sweetSpot: { min: 2, max: 8 },
  entryKinds: ["item", "row"],
  options: [{ name: "showValues", type: "boolean", description: "print item values (default true)" }],
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "row");
    const n = Math.max(items.length, 1);
    const trackW = 520;
    const pitch = 118;
    const max = niceMax(Math.max(...items.map((i) => i.value ?? 0), 1));
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const y = i * pitch;
        ctx.label(item.label, 0, y, { size: 19, color: ctx.ink, align: "left", font: "heading", weight: ctx.preset.fonts.headingWeight });
        const barY = y + 22;
        ctx.shape("rectangle", 0, barY, trackW, 34, ctx.role(i, { neutral: true }), { style: { roundness: 17, opacity: 35 } });
        const w = Math.max(((item.value ?? 0) / max) * trackW, 34);
        ctx.shape("rectangle", 0, barY, w, 34, role, { id: ctx.uid(item.id), style: { roundness: 17 } });
        // the bubble's fallback text is a pure value readout — skip it when values are hidden
        const tag = item.strings[0] ?? item.opts.tag ?? (ctx.showValue(item) ? fmtNum(item.value ?? 0) : undefined);
        if (tag !== undefined) {
          // tag bubble hanging under the bar's right end
          const tw = ctx.measure(String(tag), 13) + 20;
          const bx = Math.max(w - tw / 2 - 10, 20);
          ctx.poly(
            [
              [bx + tw / 2 - 7, barY + 42],
              [bx + tw / 2, barY + 34],
              [bx + tw / 2 + 7, barY + 42],
            ],
            { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: ctx.preset.roughness },
          );
          ctx.shape("rectangle", bx - tw / 2, barY + 42, tw, 26, { stroke: role.color, fill: null, fillStyle: "none", strokeWidth: 1.4, roughness: ctx.preset.roughness }, { style: { roundness: 8 } });
          ctx.label(String(tag), bx, barY + 55, { size: 13, color: role.color, weight: 700, role: "value" });
        }
      }),
    );
  },
});

// ---- dumbbell-vertical (delta capsules) ---------------------------------------------------------------

registerViz({
  name: "dumbbell-vertical",
  aliases: ["deltas"],
  category: "Data",
  summary: "Alternating capsules with a delta badge, connected to text blocks.",
  sweetSpot: { min: 2, max: 6 },
  entryKinds: ["item", "row"],
  options: [{ name: "showValues", type: "boolean", description: "print item values (default true)" }],
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "row");
    const n = Math.max(items.length, 1);
    const pitch = 128;
    const capW = 300;
    const capH = 104;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const right = i % 2 === 0;
      const y = i * pitch;
      const capX = right ? 330 : 0;
      // true dumbbell glyph (reference design): two big circles joined by a
      // concave waist band; delta in one bell, icon ringed in the other
      const r = capH / 2;
      const gy = y + capH / 2;
      const cA = capX + r;
      const cB = capX + capW - r;
      ctx.shape("circle", cA - r, gy - r, r * 2, r * 2, role, { id: ctx.uid(item.id) });
      ctx.shape("circle", cB - r, gy - r, r * 2, r * 2, role, { id: ctx.uid(`${item.id}_b`) });
      const waistColor = role.stroke === ctx.preset.background ? role.color : role.stroke;
      const waist = (sign: 1 | -1): Array<[number, number]> => {
        const pts: Array<[number, number]> = [];
        const xa = cA + r * 0.82;
        const xb = cB - r * 0.82;
        const ya = gy + sign * r * 0.58;
        const mid = gy + sign * r * 0.3;
        for (let s = 0; s <= 10; s++) {
          const t = s / 10;
          const u = 1 - t;
          pts.push([u * u * xa + 2 * u * t * ((xa + xb) / 2) + t * t * xb, u * u * ya + 2 * u * t * mid + t * t * ya]);
        }
        return pts;
      };
      ctx.line(waist(-1), { color: waistColor, width: role.strokeWidth || 2 });
      ctx.line(waist(1), { color: waistColor, width: role.strokeWidth || 2 });
      const delta = (item.opts.delta as string) ?? item.strings[0] ?? (item.value !== undefined && ctx.showValue(item) ? `+${fmtNum(item.value)}` : "");
      const inBell = role.fill ? role.textColor : role.color;
      ctx.label(String(delta), right ? cB : cA, gy, { size: 21, color: inBell, weight: 700, font: "heading", z: 2, role: "value" });
      const iconC = right ? cA : cB;
      if (item.icon) {
        ctx.shape("circle", iconC - r * 0.62, gy - r * 0.62, r * 1.24, r * 1.24, { stroke: inBell, fill: null, fillStyle: "none", strokeWidth: 1.6, roughness: Math.min(1, ctx.preset.roughness) }, { z: 2 });
        ctx.icon(item.icon, iconC, gy, r * 0.7, inBell, 3);
      }
      // connector to the text block on the opposite side
      const textX = right ? 0 : 660;
      const conStart: [number, number] = right ? [capX - 8, gy] : [capX + capW + 8, gy];
      const conEnd: [number, number] = right ? [260, gy] : [640, gy];
      ctx.arrow(conStart[0], conStart[1], conEnd[0], conEnd[1], { color: ctx.preset.edge, width: 1.6 });
      ctx.labelBlock(item.label, item.detail, textX, gy, { color: role.color, align: "left", maxW: 240 });
      }),
    );
  },
});

// ---- gantt ----------------------------------------------------------------------------------

registerViz({
  name: "gantt",
  category: "Process",
  summary: "Cascading task bars over a time grid; `task \"Name\" start end`.",
  sweetSpot: { min: 1, max: 10 },
  entryKinds: ["task", "item"],
  options: [
    { name: "scale", type: "string", description: "list of tick labels for the time axis" },
    { name: "deadline", type: "number", description: "time position of the deadline marker" },
    { name: "deadlineLabel", type: "string", description: "caption for the deadline marker" },
  ],
  generate(spec: VizSpec, ctx: VizContext) {
    const tasks = spec.items.filter((i) => i.kind === "task" || i.kind === "item");
    const scale = Array.isArray(spec.options.scale) ? (spec.options.scale as unknown[]).map(String) : undefined;
    const maxT = niceMax(Math.max(...tasks.map((t) => t.values[1] ?? (t.values[0] ?? 0) + 1), scale ? scale.length - 1 : 1));
    const chartW = 620;
    const x0 = 150;
    const rowPitch = 52;
    const chartH = tasks.length * rowPitch + 20;
    const ticks = scale ? scale.length : 6;
    // grid
    for (let t = 0; t < ticks; t++) {
      const tx = x0 + (chartW * t) / (ticks - 1);
      ctx.line(
        [
          [tx, 34],
          [tx, 34 + chartH],
        ],
        { color: ctx.mutedInk, width: t === 0 || t === ticks - 1 ? 1.4 : 0.8, dash: !(t === 0 || t === ticks - 1), z: -1 },
      );
      const lbl = scale ? scale[t] : fmtNum((maxT * t) / (ticks - 1));
      ctx.label(lbl, tx, 18, { size: 14, color: ctx.mutedInk });
    }
    tasks.forEach((task, i) =>
      ctx.item(task.id, () => {
        const role = ctx.role(i, { n: tasks.length, color: task.color });
        const start = task.values[0] ?? 0;
        const end = task.values[1] ?? start + 1;
        const y = 48 + i * rowPitch;
        ctx.label(task.label, x0 - 16, y + 17, { size: 16, color: role.color, align: "right", maxW: 130, font: "heading", weight: ctx.preset.fonts.headingWeight });
        const bx = x0 + (start / maxT) * chartW;
        const bw = Math.max(((end - start) / maxT) * chartW, 10);
        ctx.shape("rectangle", bx, y, bw, 34, role, { id: ctx.uid(task.id), style: { roundness: 8 } });
      }),
    );
    const deadline = optNum(spec.options, "deadline");
    if (deadline !== undefined) {
      const dx = x0 + (deadline / maxT) * chartW;
      ctx.line(
        [
          [dx, 30],
          [dx, 34 + chartH + 6],
        ],
        { color: ctx.ink, width: 2.2 },
      );
      ctx.label(optStr(spec.options, "deadlineLabel") ?? "Deadline", dx, 34 + chartH + 24, { size: 14, color: ctx.ink, weight: 700 });
    }
  },
});

// ---- sankey ------------------------------------------------------------------------------------

registerViz({
  name: "sankey",
  category: "Data",
  summary: "Sources → targets with value-thick ribbons (`flow a -> b 25`).",
  sweetSpot: { min: 2, max: 5 },
  entryKinds: ["flow", "item", "node", "source", "target"],
  options: [{ name: "showValues", type: "boolean", description: "print item values (default true)" }],
  generate(spec: VizSpec, ctx: VizContext) {
    const flows = spec.items.filter((i) => i.kind === "flow" || (i.kind === "item" && i.to));
    // collect nodes preserving declared order (explicit `node` entries first)
    const declared = spec.items.filter((i) => i.kind === "node" || i.kind === "source" || i.kind === "target");
    const srcNames: string[] = [];
    const dstNames: string[] = [];
    for (const d of declared) (d.kind === "target" ? dstNames : srcNames).push(d.label || d.id);
    for (const f of flows) {
      const from = f.label || f.id;
      if (!srcNames.includes(from)) srcNames.push(from);
      if (f.to && !dstNames.includes(f.to)) dstNames.push(f.to);
    }
    const srcTotals = new Map(srcNames.map((s) => [s, 0]));
    const dstTotals = new Map(dstNames.map((s) => [s, 0]));
    for (const f of flows) {
      const from = f.label || f.id;
      srcTotals.set(from, (srcTotals.get(from) ?? 0) + (f.value ?? 1));
      if (f.to) dstTotals.set(f.to, (dstTotals.get(f.to) ?? 0) + (f.value ?? 1));
    }
    const totalAll = [...srcTotals.values()].reduce((a, b) => a + b, 0) || 1;
    const H = 420;
    const gapY = 26;
    const colX = { src: 120, dst: 560 };
    const barW = 18;
    const scaleH = (v: number) => (v / totalAll) * (H - gapY * Math.max(srcNames.length, dstNames.length));

    // node bars + labels
    const srcPos = new Map<string, { y: number; used: number; i: number }>();
    const dstPos = new Map<string, { y: number; used: number; i: number }>();
    let y = 0;
    srcNames.forEach((s, i) => {
      const h = Math.max(scaleH(srcTotals.get(s) ?? 0), 12);
      srcPos.set(s, { y, used: 0, i });
      const role = ctx.role(i, { n: srcNames.length });
      ctx.shape("rectangle", colX.src - barW, y, barW, h, { ...roleFillOnly(ctx, i, srcNames.length), stroke: role.color });
      ctx.labelBlock(s, ctx.showValues ? fmtNum(srcTotals.get(s) ?? 0) : undefined, colX.src - barW - 12, y + h / 2, { color: role.color, align: "right", maxW: 110, size: 16 });
      y += h + gapY;
    });
    y = 0;
    dstNames.forEach((s, i) => {
      const h = Math.max(scaleH(dstTotals.get(s) ?? 0), 12);
      dstPos.set(s, { y, used: 0, i });
      const role = ctx.role(srcNames.length + i, { n: srcNames.length + dstNames.length });
      ctx.shape("rectangle", colX.dst, y, barW, h, { ...roleFillOnly(ctx, srcNames.length + i, srcNames.length + dstNames.length), stroke: role.color });
      ctx.labelBlock(s, ctx.showValues ? fmtNum(dstTotals.get(s) ?? 0) : undefined, colX.dst + barW + 12, y + h / 2, { color: role.color, align: "left", maxW: 130, size: 16 });
      y += h + gapY;
    });

    // ribbons — sampled mirrored-cubic bands as polygons
    for (const f of flows) {
      const from = f.label || f.id;
      const to = f.to ?? "";
      const sp = srcPos.get(from);
      const dp = dstPos.get(to);
      if (!sp || !dp) continue;
      const h = Math.max(scaleH(f.value ?? 1), 6);
      const y1 = sp.y + sp.used;
      const y2 = dp.y + dp.used;
      sp.used += h;
      dp.used += h;
      ctx.item(f.id, () => {
        const role = ctx.role(sp.i, { n: srcNames.length });
        const top: Array<[number, number]> = [];
        const bot: Array<[number, number]> = [];
        const segs = 18;
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const ease = t * t * (3 - 2 * t);
          const px = lerp(colX.src, colX.dst, t);
          top.push([px, lerp(y1, y2, ease)]);
          bot.unshift([px, lerp(y1 + h, y2 + h, ease)]);
        }
        ctx.poly([...top, ...bot], { stroke: "transparent", fill: role.softFill, fillStyle: "solid", strokeWidth: 0, roughness: 0.3 }, { z: -1, id: ctx.uid(`${f.id}_${to}`) });
        if (ctx.showValue(f)) ctx.label(fmtNum(f.value ?? 1), colX.dst - 44, y2 + h / 2, { size: 13, color: role.color, weight: 700, role: "value" });
      });
    }
  },
});

// ---- drop-off ------------------------------------------------------------------------------------

registerViz({
  name: "drop-off",
  aliases: ["dropoff"],
  category: "Data",
  summary: "Nested rounded cards stepping down-right, labels called out around them.",
  entryKinds: ["item", "stage"],
  options: [{ name: "showValues", type: "boolean", description: "print item values (default true)" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "stage");
    const n = Math.max(items.length, 1);
    // nested cascade (reference design): each smaller card overlaps the previous
    // toward its bottom-right; labels + icons sit around the cluster
    const s0 = 200;
    const shrink = 0.74;
    const cx0 = 190;
    const cy0 = 60;
    let brX = cx0 + s0;
    let brY = cy0 + s0;
    const sizes = items.map((_, i) => s0 * Math.pow(shrink, i));
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const s = sizes[i];
      if (i > 0) {
        brX += s * 0.28;
        brY += s * 0.3;
      }
      const x = brX - s;
      const y = brY - s;
      ctx.shape("rectangle", x, y, s, s, role, { id: ctx.uid(item.id), style: { roundness: s * 0.2 } });
      const value = ctx.showValue(item) && item.value !== undefined ? ` ${fmtNum(item.value)}` : "";
      // callout positions cycle around the cluster: top-left, top-right, left, right, below
      const pos = i % 5;
      let lx: number;
      let ly: number;
      let align: "left" | "right" | "center" = "center";
      if (pos === 0) {
        lx = x - 16;
        ly = y - 14;
        align = "right";
      } else if (pos === 1) {
        lx = x + s + 16;
        ly = y - 14;
        align = "left";
      } else if (pos === 2) {
        lx = cx0 - 30;
        ly = y + s / 2;
        align = "right";
      } else if (pos === 3) {
        lx = brX + 26;
        ly = y + s / 2;
        align = "left";
      } else {
        lx = brX - s / 2;
        ly = brY + 26;
      }
      ctx.labelBlock(item.label + value, item.detail, lx, ly, { color: role.color, align, maxW: 180 });
      if (item.icon) ctx.icon(item.icon, x + s * 0.32, y + s * 0.32, Math.max(24, s * 0.2), role.fill ? role.textColor : role.color);
      }),
    );
  },
});
