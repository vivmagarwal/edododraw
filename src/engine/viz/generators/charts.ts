/**
 * Data charts: bar, bar-horizontal, stacked-bar(±horizontal), line, area,
 * waterfall, dumbbell-vertical/horizontal, gantt, sankey, drop-off.
 * Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 *
 * Every chart here is laid out WIDE AND SHORT (about 900 x 350 world units
 * with its title): a video band is ~2.4:1, and a portrait-ish chart is fitted
 * on its height, which shrinks every label on it. Text follows one scale
 * (TYPE) so a tick, a value and a category read the same from card to card.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { ShapeOptions, VizContext } from "../context.js";
import type { NodeStyle } from "../../scene/types.js";
import type { RoleStyle } from "../../style/presets.js";
import { parseHex, withAlpha } from "../../style/color.js";
import { fmtNum, lerp } from "./util.js";

/** The one type scale for the charts in this file (world units). Values are
 *  bold in their series colour; ticks are muted; axis titles are muted too, so
 *  emphasis follows the data rather than the words describing it. */
const TYPE = { heading: 19, label: 18, value: 18, tick: 16 } as const;

/** Round a max value up to a "nice" scale ceiling (1/2/2.5/5 × 10^k). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

/** A readable axis: a 1/2/2.5/5 × 10^k step giving 3–6 intervals, and the
 *  first multiple of it at or above `max` as the top. */
function niceScale(max: number, target = 4): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.25 };
  const mag = Math.pow(10, Math.floor(Math.log10(max / target)));
  let best: { top: number; step: number; score: number } | null = null;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * mag;
    const k = Math.ceil(max / step - 1e-9);
    if (k < 3 || k > 6) continue;
    const score = (k * step) / max + Math.abs(k - target) * 0.05;
    if (!best || score < best.score) best = { top: k * step, step, score };
  }
  if (best) return { top: best.top, step: best.step };
  const top = niceMax(max);
  return { top, step: top / 4 };
}

/** Compact number for crowded scales: 8k, 120k, 1.5M. */
function fmtCompact(v: number): string {
  const a = Math.abs(v);
  const t = (x: number) => String(Math.round(x * 10) / 10);
  if (a >= 1e9) return `${t(v / 1e9)}B`;
  if (a >= 1e6) return `${t(v / 1e6)}M`;
  if (a >= 1e3) return `${t(v / 1e3)}k`;
  return fmtNum(v);
}

/** The formatter a scale topping out at `max` should use. */
const fmtFor = (max: number) => (max >= 10000 ? fmtCompact : fmtNum);

type Corners = [number, number, number, number];

/**
 * A rectangle outline with its own radius per corner (tl, tr, br, bl), in a
 * 0..w × 0..h box. `open` drops one side from the STROKE (the fill still
 * closes) — used where a bar stands on an axis, so the axis is the only line
 * there and the bar's own edge never doubles it in another colour.
 */
function cornerRectPath(w: number, h: number, corners: Corners, open?: "bottom" | "left"): string {
  const k = (r: number) => Math.max(0, Math.min(r, w / 2, h / 2));
  const [a, b, c, d] = corners.map(k);
  const f = (v: number) => Math.round(v * 100) / 100;
  const segs: Array<{ side?: string; cmd: string; end: [number, number] }> = [
    { side: "top", cmd: `L${f(w - b)},0`, end: [w - b, 0] },
    { cmd: b ? `Q${f(w)},0 ${f(w)},${f(b)}` : "", end: [w, b] },
    { side: "right", cmd: `L${f(w)},${f(h - c)}`, end: [w, h - c] },
    { cmd: c ? `Q${f(w)},${f(h)} ${f(w - c)},${f(h)}` : "", end: [w - c, h] },
    { side: "bottom", cmd: `L${f(d)},${f(h)}`, end: [d, h] },
    { cmd: d ? `Q0,${f(h)} 0,${f(h - d)}` : "", end: [0, h - d] },
    { side: "left", cmd: `L0,${f(a)}`, end: [0, a] },
    { cmd: a ? `Q0,0 ${f(a)},0` : "", end: [a, 0] },
  ];
  if (!open) return `M${f(a)},0 ${segs.map((s) => s.cmd).filter(Boolean).join(" ")} Z`;
  const at = segs.findIndex((s) => s.side === open);
  const [sx, sy] = segs[at].end;
  const order = [...segs.slice(at + 1), ...segs.slice(0, at)];
  return `M${f(sx)},${f(sy)} ${order.map((s) => s.cmd).filter(Boolean).join(" ")}`;
}

/** Emit a per-corner rectangle (see cornerRectPath) at x/y/w/h. */
function cornerRect(ctx: VizContext, x: number, y: number, w: number, h: number, style: RoleStyle | Partial<NodeStyle>, corners: Corners, opts: ShapeOptions = {}, open?: "bottom" | "left"): void {
  const ww = Math.max(w, 0.5);
  const hh = Math.max(h, 0.5);
  ctx.path(cornerRectPath(ww, hh, corners, open), ww, hh, x, y, ww, hh, style, opts);
}

/** A data mark that hides the gridlines behind it: outline presets have no
 *  fill, so their marks take the paper colour instead of showing the grid through. */
const occluding = (ctx: VizContext, role: RoleStyle): RoleStyle => (role.fill ? role : { ...role, fill: ctx.preset.background, fillStyle: "solid" });

/** The corner radius a data mark takes from its role, capped for its size. */
const markRadius = (role: RoleStyle, cap: number) => Math.max(0, Math.min(role.roundness ?? 0, cap));

interface AxesOpts {
  xTitle?: string;
  yTitle?: string;
  /** Arrowheads on the axis ends (classic sketch look). */
  arrows?: boolean;
}

/**
 * L-shaped axes with optional arrowheads + titles. Origin = bottom-left.
 * Painted ABOVE the marks (z 1) so the baseline is one unbroken grey line —
 * the bars stand on it instead of overdrawing it in their own colours.
 */
function drawAxes(ctx: VizContext, x0: number, y0: number, w: number, h: number, opts: AxesOpts = {}): void {
  const c = ctx.preset.edge;
  if (opts.arrows) {
    ctx.arrow(x0, y0, x0, y0 - h - 24, { color: c, width: 1.8, z: 1 });
    ctx.arrow(x0, y0, x0 + w + 24, y0, { color: c, width: 1.8, z: 1 });
  } else {
    ctx.line(
      [
        [x0, y0 - h],
        [x0, y0],
        [x0 + w, y0],
      ],
      { color: c, width: 1.8, z: 1 },
    );
  }
  if (opts.yTitle) ctx.label(opts.yTitle, x0 - 6, y0 - h - 46, { size: TYPE.heading, color: ctx.mutedInk, align: "left", font: "heading" });
  if (opts.xTitle) ctx.label(opts.xTitle, x0 + w + 36, y0, { size: TYPE.heading, color: ctx.mutedInk, align: "left", font: "heading" });
}

/** Legend row of coloured dots + series names, centred on `cx`; returns its height. */
function drawLegend(ctx: VizContext, names: string[], cx: number, y: number): number {
  const widths = names.map((name) => ctx.measure(name, TYPE.label));
  const total = widths.reduce((s, w) => s + 26 + w, 0) + 30 * Math.max(names.length - 1, 0);
  let x = cx - total / 2;
  names.forEach((name, i) => {
    const role = ctx.role(i, { n: names.length });
    ctx.shape("circle", x, y - 9, 18, 18, { fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: 1.4, roughness: ctx.preset.roughness, stroke: role.color });
    x += 26;
    ctx.label(name, x, y, { size: TYPE.label, color: ctx.ink, align: "left" });
    x += widths[i] + 30;
  });
  return 34;
}

/** Series names: `series "A"` entries, or the `legend:`/`series:` list option. */
function seriesNames(spec: VizSpec): string[] {
  const entries = spec.items.filter((i) => i.kind === "series" && !i.values.length).map((i) => i.label);
  if (entries.length) return entries;
  const opt = spec.options.legend ?? spec.options.series;
  if (Array.isArray(opt)) return opt.map(String);
  return [];
}

/** Hue (0–360) and saturation (0–1) of a hex colour. */
function hueSat(c: string): { h: number; s: number } | null {
  const rgb = parseHex(c);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d < 1e-6) return { h: 0, s: 0 };
  const l = (mx + mn) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s };
}

/**
 * Semantic colours for gains and losses, taken from the active palette by hue
 * (the greenest for up, the reddest for down) so every theme keeps the
 * meaning; falls back to two distinct palette slots when a theme has no such
 * hues (monochrome and ramp presets).
 */
function signRoles(ctx: VizContext): { up: RoleStyle; down: RoleStyle } {
  const pick = (target: number, not?: string): string | undefined => {
    let best: string | undefined;
    let bestD = 50;
    for (const c of ctx.preset.palette) {
      const hs = hueSat(c);
      if (!hs || hs.s < 0.2 || c === not) continue;
      const d = Math.min(Math.abs(hs.h - target), 360 - Math.abs(hs.h - target));
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };
  const up = pick(145);
  const down = pick(355, up);
  return {
    up: up ? ctx.role(0, { color: up }) : ctx.role(2, { n: 4 }),
    down: down ? ctx.role(0, { color: down }) : ctx.role(1, { n: 4 }),
  };
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
    // wide and short: ~880 across the plot, 230 tall
    const pitch = Math.min(206, 880 / n);
    const barW = pitch * 0.73;
    const gap = pitch - barW;
    const chartH = 230;
    const x0 = 50;
    const y0 = chartH + 40;
    const max = niceMax(Math.max(...items.map((i) => i.value ?? 0), 1));
    drawAxes(ctx, x0, y0, n * pitch + gap, chartH, {
      arrows: true,
      yTitle: optStr(spec.options, "yTitle"),
      xTitle: optStr(spec.options, "xTitle"),
    });
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const h = ((item.value ?? 0) / max) * chartH;
        const x = x0 + gap + i * pitch;
        // rounded on top, square where it stands on the baseline
        const r = markRadius(role, barW / 4);
        cornerRect(ctx, x, y0 - h, barW, h, role, [r, r, 0, 0], { id: ctx.uid(item.id) }, "bottom");
        if (ctx.showValue(item)) ctx.label(fmtNum(item.value ?? 0), x + barW / 2, y0 - h - 18, { size: TYPE.value, color: role.color, weight: 700, role: "value" });
        ctx.label(ctx.wrap(item.label, pitch - 8, TYPE.label), x + barW / 2, y0 + 24, { size: TYPE.label, color: ctx.ink });
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
    const rowH = 74;
    const barH = 40;
    const badgeR = 22;
    const trackW = 640;
    // one row reads left to right: badge · name · bar · value, the bars all
    // starting one gutter after the widest name
    const nameW = Math.max(...items.map((it) => ctx.measure(it.label, TYPE.label)), 30);
    const nameX = badgeR * 2 + 14 + nameW;
    const x0 = nameX + 18;
    const max = niceMax(Math.max(...items.map((i) => i.value ?? 0), 1));
    ctx.line(
      [
        [x0, -8],
        [x0, (n - 1) * rowH + barH + 8],
      ],
      { color: ctx.preset.edge, width: 1.8, z: 1 },
    );
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const cy = i * rowH + barH / 2;
        ctx.shape("circle", 0, cy - badgeR, badgeR * 2, badgeR * 2, role, { id: ctx.uid(`${item.id}_badge`) });
        if (item.icon) ctx.icon(item.icon, badgeR, cy, 26, role.textColor);
        else ctx.label(String(i + 1), badgeR, cy, { size: TYPE.label, color: role.textColor, weight: 700 });
        ctx.label(item.label, nameX, cy, { size: TYPE.label, color: ctx.ink, align: "right" });
        const w = Math.max(((item.value ?? 0) / max) * trackW, 3);
        const r = markRadius(role, 10);
        cornerRect(ctx, x0, cy - barH / 2, w, barH, role, [0, r, r, 0], { id: ctx.uid(item.id) }, "left");
        if (ctx.showValue(item)) ctx.label(fmtNum(item.value ?? 0), x0 + w + 12, cy, { size: TYPE.value, color: role.color, weight: 700, align: "left", role: "value" });
      }),
    );
  },
});

// ---- stacked bars -------------------------------------------------------------------

/** Paper gap between stacked segments: every segment keeps its own clean
 *  outline, with no doubled seams and no corner notches between them. */
const SEAM = 3;

function stackedBars(spec: VizSpec, ctx: VizContext, horizontal: boolean): void {
  const rows = itemsOf(spec, "item", "row").filter((r) => r.values.length);
  const names = seriesNames(spec);
  const k = Math.max(names.length, ...rows.map((r) => r.values.length), 1);
  const totals = rows.map((r) => r.values.reduce((s, v) => s + v, 0));
  const { top: max, step } = niceScale(Math.max(...totals, 1));
  const fmt = fmtFor(max);
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 1e-6; t += step) ticks.push(t);

  if (horizontal) {
    const rowH = 52;
    const pitch = 76;
    const trackW = 720;
    const labelW = Math.max(...rows.map((r) => ctx.measure(r.label, TYPE.label)), 30);
    const x0 = labelW + 22;
    let y = 0;
    if (names.length) y = drawLegend(ctx, names, x0 + trackW / 2, 0) + 6;
    const axisY = y + rows.length * pitch;
    // scale: faint gridlines behind the rows, tick marks + compact labels under the axis
    for (const t of ticks) {
      const tx = x0 + (t / max) * trackW;
      if (t > 0) {
        ctx.line(
          [
            [tx, y],
            [tx, axisY],
          ],
          { color: ctx.mutedInk, width: 0.8, dash: true, z: -2 },
        );
      }
      ctx.line(
        [
          [tx, axisY],
          [tx, axisY + 6],
        ],
        { color: ctx.preset.edge, width: 1.4, z: 1 },
      );
      ctx.label(fmt(t), tx, axisY + 22, { size: TYPE.tick, color: ctx.mutedInk });
    }
    ctx.line(
      [
        [x0, y],
        [x0, axisY],
        [x0 + trackW + 16, axisY],
      ],
      { color: ctx.preset.edge, width: 1.8, z: 1 },
    );
    rows.forEach((row, r) =>
      ctx.item(row.id, () => {
        const cy = y + r * pitch + pitch / 2;
        ctx.label(row.label, x0 - 14, cy, { size: TYPE.label, color: ctx.ink, align: "right" });
        const last = row.values.reduce((li, v, i) => (v > 0 ? i : li), 0);
        let x = x0;
        row.values.forEach((v, s) => {
          const role = ctx.role(s, { n: k });
          const w = (v / max) * trackW;
          const li = s === 0 || w < SEAM * 2 ? 0 : SEAM / 2;
          const ri = s === last || w < SEAM * 2 ? 0 : SEAM / 2;
          const rr = s === last ? markRadius(role, 10) : 0;
          cornerRect(ctx, x + li, cy - rowH / 2, w - li - ri, rowH, occluding(ctx, role), [0, rr, rr, 0], { id: ctx.uid(`${row.id}_${s}`) }, s === 0 ? "left" : undefined);
          if (ctx.showValue(row) && v > 0) {
            const text = fmt(v);
            const tw = ctx.measure(text, TYPE.value);
            if (w - li - ri > tw + 14) ctx.label(text, x + w / 2, cy, { size: TYPE.value, color: role.textColor, weight: 700, role: "value" });
            // too narrow to hold its number: say it beside the row end, or just above the segment
            else if (s === last) ctx.label(text, x + w + 10, cy, { size: TYPE.value, color: role.color, weight: 700, align: "left", role: "value" });
            else ctx.label(text, x + w / 2, cy - rowH / 2 - 11, { size: TYPE.tick, color: role.color, weight: 700, role: "value" });
          }
          x += w;
        });
      }),
    );
  } else {
    const n = Math.max(rows.length, 1);
    const pitch = Math.min(220, 760 / n);
    const barW = pitch * 0.68;
    const gap = pitch - barW;
    const chartH = 220;
    const plotW = n * pitch + gap;
    const x0 = Math.max(...ticks.map((t) => ctx.measure(fmt(t), TYPE.tick))) + 16;
    let y = 0;
    if (names.length) y = drawLegend(ctx, names, x0 + plotW / 2, 0) + 22;
    const y0 = y + chartH + 16;
    drawAxes(ctx, x0, y0, plotW, chartH, { yTitle: optStr(spec.options, "yTitle"), xTitle: optStr(spec.options, "xTitle") });
    // tick marks + numbers only: the stack totals carry the reading, and a
    // gridline would run through a thin segment's side label
    for (const t of ticks) {
      const ty = y0 - (t / max) * chartH;
      ctx.line(
        [
          [x0 - 6, ty],
          [x0, ty],
        ],
        { color: ctx.preset.edge, width: 1.4, z: 1 },
      );
      ctx.label(fmt(t), x0 - 12, ty, { size: TYPE.tick, color: ctx.mutedInk, align: "right" });
    }
    rows.forEach((row, r) =>
      ctx.item(row.id, () => {
        const x = x0 + gap + r * pitch;
        const last = row.values.reduce((li, v, i) => (v > 0 ? i : li), 0);
        let top = y0;
        row.values.forEach((v, s) => {
          const role = ctx.role(s, { n: k });
          const h = (v / max) * chartH;
          const bi = s === 0 || h < SEAM * 2 ? 0 : SEAM / 2;
          const ti = s === last || h < SEAM * 2 ? 0 : SEAM / 2;
          const rr = s === last ? markRadius(role, barW / 4) : 0;
          top -= h;
          cornerRect(ctx, x, top + ti, barW, h - ti - bi, role, [rr, rr, 0, 0], { id: ctx.uid(`${row.id}_${s}`) }, s === 0 ? "bottom" : undefined);
          if (ctx.showValue(row) && v > 0) {
            const text = fmt(v);
            const mid = top + h / 2;
            if (h - ti - bi >= TYPE.value * 1.5) ctx.label(text, x + barW / 2, mid, { size: TYPE.value, color: role.textColor, weight: 700, role: "value" });
            else {
              // too thin to hold its number: set it beside the column on a short leader
              ctx.line(
                [
                  [x + barW + 3, mid],
                  [x + barW + 10, mid],
                ],
                { color: role.color, width: 1.4 },
              );
              ctx.label(text, x + barW + 14, mid, { size: TYPE.tick, color: role.color, weight: 700, align: "left", role: "value" });
            }
          }
        });
        // the stack total — the number a stacked column is read for
        if (ctx.showValue(row)) ctx.label(fmt(totals[r]), x + barW / 2, top - 18, { size: TYPE.value, color: ctx.ink, weight: 700, role: "value" });
        ctx.label(ctx.wrap(row.label, pitch - 8, TYPE.label), x + barW / 2, y0 + 24, { size: TYPE.label, color: ctx.ink });
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
    { name: "showValues", type: "boolean", description: "print segment values and stack totals (default true)" },
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
  const pitch = Math.max(64, Math.min(170, 800 / (n - 1)));
  const chartW = (n - 1) * pitch;
  const chartH = 230;
  const x0 = 50;
  const y0 = chartH + 44;
  const max = niceMax(Math.max(...points.map((p) => p.value ?? 0), 1));
  drawAxes(ctx, x0, y0, chartW + 60, chartH, { arrows: true, yTitle: optStr(spec.options, "yTitle"), xTitle: optStr(spec.options, "xTitle") });
  const role = ctx.role(0, { n: 1, color: optStr(spec.options, "color") });
  const pts: Array<[number, number]> = points.map((p, i) => [x0 + 34 + i * pitch, y0 - ((p.value ?? 0) / max) * chartH]);
  if (area && pts.length >= 2) {
    const poly: Array<[number, number]> = [...pts, [pts[pts.length - 1][0], y0], [pts[0][0], y0]];
    ctx.poly(poly, { ...ctx.role(0, { n: 1, color: role.color }), stroke: "transparent", fill: withSoft(ctx, role.color), fillStyle: "solid" }, { z: -1 });
  }
  ctx.line(pts, { color: ctx.preset.fillMode === "outline" ? ctx.preset.edge : role.color, width: 2.2 });
  points.forEach((p, i) =>
    ctx.item(p.id, () => {
      const [px, py] = pts[i];
      ctx.shape("circle", px - 6, py - 6, 12, 12, { stroke: role.color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2, roughness: Math.min(0.6, ctx.preset.roughness) });
      if (ctx.showValue(p)) ctx.label(fmtNum(p.value ?? 0), px, py - 24, { size: TYPE.value, color: role.color, weight: 700, role: "value" });
      ctx.label(p.label, px, y0 + 24, { size: TYPE.label, color: ctx.ink });
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
  summary: "Start bar, floating signed deltas (green up, red down), computed net bar, level connectors.",
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

    const nb = Math.max(bars.length, 1);
    const pitch = Math.min(190, 860 / nb);
    const barW = pitch * 0.64;
    const gap = pitch - barW;
    const chartH = 250;
    const { top: max, step } = niceScale(Math.max(...bars.map((b) => Math.max(b.from, b.to)), 1));
    const x0 = ctx.measure(fmtNum(max), TYPE.tick) + 18;
    const y0 = chartH + 40;
    const plotW = nb * pitch + gap;
    const yOf = (v: number) => y0 - (v / max) * chartH;
    drawAxes(ctx, x0, y0, plotW, chartH, { yTitle: optStr(spec.options, "yTitle"), xTitle: optStr(spec.options, "xTitle") });
    // scale: a nice step from 0, a tick mark at each level, gridlines behind
    for (let t = 0; t <= max + step * 1e-6; t += step) {
      const gy = yOf(t);
      if (t > 0) {
        ctx.line(
          [
            [x0, gy],
            [x0 + plotW, gy],
          ],
          { color: ctx.mutedInk, width: 0.8, dash: true, z: -2 },
        );
      }
      ctx.line(
        [
          [x0 - 6, gy],
          [x0, gy],
        ],
        { color: ctx.preset.edge, width: 1.4, z: 1 },
      );
      ctx.label(fmtNum(t), x0 - 12, gy, { size: TYPE.tick, color: ctx.mutedInk, align: "right" });
    }
    const sign = signRoles(ctx);
    // the levels (start, totals) take the theme's lead colour — or its neutral
    // when the lead colour is itself the gain or loss hue
    const lead = ctx.role(0, { n: 1 });
    const levelRole = lead.color === sign.up.color || lead.color === sign.down.color ? ctx.role(0, { neutral: true }) : lead;
    bars.forEach((b, i) =>
      ctx.item(b.item.id, () => {
        const delta = b.to - b.from;
        // colour carries meaning: gains green, losses red, whatever the theme
        const role = b.item.color ? ctx.role(i, { color: b.item.color }) : b.kind === "delta" ? (delta >= 0 ? sign.up : sign.down) : levelRole;
        const x = x0 + gap + i * pitch;
        const top = Math.min(yOf(b.from), yOf(b.to));
        const h = Math.max(Math.abs(yOf(b.from) - yOf(b.to)), 3);
        if (b.kind === "delta") {
          const r = markRadius(role, 4);
          cornerRect(ctx, x, top, barW, h, occluding(ctx, role), [r, r, r, r], { id: ctx.uid(b.item.id) });
        } else {
          const r = markRadius(role, barW / 5);
          cornerRect(ctx, x, top, barW, h, occluding(ctx, role), [r, r, 0, 0], { id: ctx.uid(b.item.id) }, "bottom");
        }
        const signText = b.kind === "delta" ? (delta >= 0 ? "+" : "−") : "";
        const shown = Math.abs(b.kind === "delta" ? delta : b.to);
        const valueInk = role === levelRole && levelRole !== lead ? ctx.ink : role.color;
        if (ctx.showValue(b.item)) ctx.label(`${signText}${fmtNum(shown)}`, x + barW / 2, top - 18, { size: TYPE.value, color: valueInk, weight: 700, role: "value" });
        ctx.label(ctx.wrap(b.item.label, pitch - 6, TYPE.label), x + barW / 2, y0 + 24, { size: TYPE.label, color: ctx.ink });
        // the level carries forward: a short solid step across the gutter to the
        // next bar (solid, so it never reads as a stray piece of gridline)
        if (i < bars.length - 1) {
          const ly = yOf(b.to);
          ctx.line(
            [
              [x + barW + 4, ly],
              [x + pitch - 4, ly],
            ],
            { color: ctx.preset.edge, width: 1.4, z: -1 },
          );
        }
      }),
    );
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
    // inline rows (name left of its track) keep the card wide and short
    const labelW = 24 + Math.max(...items.map((i) => ctx.measure(i.label, TYPE.heading, "heading")), 40);
    const trackW = 820;
    const barH = 34;
    const pitch = 92;
    const tx = labelW;
    const max = niceMax(Math.max(...items.map((i) => i.value ?? 0), 1));
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const barY = i * pitch;
        ctx.label(item.label, labelW - 16, barY + barH / 2, { size: TYPE.heading, color: ctx.ink, align: "right", font: "heading", weight: ctx.preset.fonts.headingWeight });
        ctx.shape("rectangle", tx, barY, trackW, barH, ctx.role(i, { neutral: true }), { style: { roundness: barH / 2, opacity: 35 } });
        const w = Math.max(((item.value ?? 0) / max) * trackW, barH);
        ctx.shape("rectangle", tx, barY, w, barH, role, { id: ctx.uid(item.id), style: { roundness: barH / 2 } });
        // the bubble's fallback text is a pure value readout — skip it when values are hidden
        const tag = item.strings[0] ?? item.opts.tag ?? (ctx.showValue(item) ? fmtNum(item.value ?? 0) : undefined);
        if (tag !== undefined) {
          // ONE outline — a rounded tag whose top edge rises into a pointer —
          // centred under the bar's end and clamped into the track
          const text = String(tag);
          const tw = ctx.measure(text, TYPE.value) + 26;
          const bh = 32;
          const ph = 9;
          const r = 8;
          const endX = tx + Math.max(w - barH * 0.3, barH / 2);
          const bx = Math.min(Math.max(endX, tx + tw / 2), tx + trackW - tw / 2);
          const left = bx - tw / 2;
          const px = Math.min(Math.max(endX - left, r + 10), tw - r - 10);
          const f = (v: number) => Math.round(v * 100) / 100;
          const d = [
            `M${r},${ph}`,
            `L${f(px - 9)},${ph}`,
            `L${f(px)},0`,
            `L${f(px + 9)},${ph}`,
            `L${f(tw - r)},${ph}`,
            `Q${f(tw)},${ph} ${f(tw)},${ph + r}`,
            `L${f(tw)},${ph + bh - r}`,
            `Q${f(tw)},${ph + bh} ${f(tw - r)},${ph + bh}`,
            `L${r},${ph + bh}`,
            `Q0,${ph + bh} 0,${ph + bh - r}`,
            `L0,${ph + r}`,
            `Q0,${ph} ${r},${ph}`,
            "Z",
          ].join(" ");
          const tagY = barY + barH + 3;
          ctx.path(d, tw, ph + bh, left, tagY, tw, ph + bh, { stroke: role.color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 1.6, roughness: Math.min(0.6, ctx.preset.roughness) }, { z: 1 });
          ctx.label(text, bx, tagY + ph + bh / 2, { size: TYPE.value, color: role.color, weight: 700, role: "value" });
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
    const pitch = 116;
    const capW = 330;
    const capH = 96;
    // every note sits the same leader + gutter from its capsule, mirrored on
    // alternate rows: measure the notes first, then place the columns
    const LEAD = 56;
    const GUT = 14;
    const noteMax = 340;
    const noteW = Math.max(...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: noteMax }).w), 120);
    const totalW = capW + 8 + LEAD + GUT + noteW;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const right = i % 2 === 0;
      const y = i * pitch;
      const capX = right ? totalW - capW : 0;
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
      // the waist is one filled band (under the bells), not a hollow bracket
      if (role.fill) ctx.poly([...waist(-1), ...waist(1).reverse()], { stroke: "none", fill: role.fill, fillStyle: "solid", strokeWidth: 0, roughness: 0 }, { z: -1 });
      ctx.line(waist(-1), { color: waistColor, width: role.strokeWidth || 2 });
      ctx.line(waist(1), { color: waistColor, width: role.strokeWidth || 2 });
      const delta = (item.opts.delta as string) ?? item.strings[0] ?? (item.value !== undefined && ctx.showValue(item) ? `+${fmtNum(item.value)}` : "");
      const inBell = role.fill ? role.textColor : role.color;
      ctx.label(String(delta), right ? cB : cA, gy, { size: 22, color: inBell, weight: 700, font: "heading", z: 2, role: "value" });
      const iconC = right ? cA : cB;
      if (item.icon) {
        ctx.shape("circle", iconC - r * 0.62, gy - r * 0.62, r * 1.24, r * 1.24, { stroke: inBell, fill: null, fillStyle: "none", strokeWidth: 1.6, roughness: Math.min(1, ctx.preset.roughness) }, { z: 2 });
        ctx.icon(item.icon, iconC, gy, r * 0.7, inBell, 3);
      }
      // a dotted leader (an annotation, not a flow) to the note on the open side
      const conStart = right ? capX - 8 : capX + capW + 8;
      const conEnd = right ? conStart - LEAD : conStart + LEAD;
      const textX = right ? conEnd - GUT : conEnd + GUT;
      ctx.line(
        [
          [conStart, gy],
          [conEnd, gy],
        ],
        { color: ctx.mutedInk, width: 1.6, dotted: true },
      );
      ctx.labelBlock(item.label, item.detail, textX, gy, { color: role.color, align: right ? "right" : "left", maxW: noteMax });
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
    // wide and short: a long ribbon run between two short columns
    const H = 340;
    const gapY = 24;
    const colX = { src: 120, dst: 820 };
    const barW = 22;
    const scaleH = (v: number) => (v / totalAll) * (H - gapY * Math.max(srcNames.length, dstNames.length));
    const nodeH = (v: number) => Math.max(scaleH(v), 12);
    // centre the shorter column against the taller one, so ribbons run level
    const colH = (names: string[], totals: Map<string, number>) => names.reduce((s, nm) => s + nodeH(totals.get(nm) ?? 0), 0) + gapY * Math.max(names.length - 1, 0);
    const srcH = colH(srcNames, srcTotals);
    const dstH = colH(dstNames, dstTotals);
    const srcOff = Math.max(0, (dstH - srcH) / 2);
    const dstOff = Math.max(0, (srcH - dstH) / 2);

    // node bars (solid anchors) + labels
    const srcPos = new Map<string, { y: number; i: number }>();
    const dstPos = new Map<string, { y: number; i: number }>();
    const nodeStyle = (color: string): Partial<NodeStyle> => ({ fill: color, fillStyle: "solid", stroke: color, strokeWidth: ctx.preset.strokeWidth, roughness: Math.min(0.6, ctx.preset.roughness) });
    let y = srcOff;
    srcNames.forEach((s, i) => {
      const h = nodeH(srcTotals.get(s) ?? 0);
      srcPos.set(s, { y, i });
      const role = ctx.role(i, { n: srcNames.length });
      ctx.shape("rectangle", colX.src - barW, y, barW, h, nodeStyle(role.color), { style: { roundness: 3 } });
      ctx.labelBlock(s, ctx.showValues ? fmtNum(srcTotals.get(s) ?? 0) : undefined, colX.src - barW - 14, y + h / 2, { color: role.color, align: "right", maxW: 130, size: TYPE.label });
      y += h + gapY;
    });
    y = dstOff;
    dstNames.forEach((s, i) => {
      const h = nodeH(dstTotals.get(s) ?? 0);
      dstPos.set(s, { y, i });
      const role = ctx.role(srcNames.length + i, { n: srcNames.length + dstNames.length });
      ctx.shape("rectangle", colX.dst, y, barW, h, nodeStyle(role.color), { style: { roundness: 3 } });
      ctx.labelBlock(s, ctx.showValues ? fmtNum(dstTotals.get(s) ?? 0) : undefined, colX.dst + barW + 14, y + h / 2, { color: role.color, align: "left", maxW: 150, size: TYPE.label });
      y += h + gapY;
    });

    // stack ribbons the way d3-sankey does: out of each source in TARGET
    // order and into each target in SOURCE order, so no two ribbons twist
    // through each other where they leave a bar
    const srcIdx = (f: VizItem) => srcPos.get(f.label || f.id)?.i ?? 0;
    const dstIdx = (f: VizItem) => dstPos.get(f.to ?? "")?.i ?? 0;
    const placed = new Map<VizItem, { y1: number; y2: number; h: number }>();
    const live = flows.filter((f) => srcPos.has(f.label || f.id) && dstPos.has(f.to ?? ""));
    const used = new Map<string, number>();
    for (const f of [...live].sort((a, b) => srcIdx(a) - srcIdx(b) || dstIdx(a) - dstIdx(b))) {
      const from = f.label || f.id;
      const h = Math.max(scaleH(f.value ?? 1), 6);
      const u = used.get(`s:${from}`) ?? 0;
      placed.set(f, { y1: srcPos.get(from)!.y + u, y2: 0, h });
      used.set(`s:${from}`, u + h);
    }
    for (const f of [...live].sort((a, b) => dstIdx(a) - dstIdx(b) || srcIdx(a) - srcIdx(b))) {
      const to = f.to ?? "";
      const p = placed.get(f)!;
      const u = used.get(`d:${to}`) ?? 0;
      p.y2 = dstPos.get(to)!.y + u;
      used.set(`d:${to}`, u + p.h);
    }

    // ribbons — translucent, so a crossing reads as a crossing; painted
    // largest-first so the thin flows stay on top
    const alpha = ctx.preset.mode === "dark" ? 0.42 : 0.3;
    const paintOrder = live.map((f, i) => ({ f, i })).sort((a, b) => (b.f.value ?? 1) - (a.f.value ?? 1) || a.i - b.i);
    for (const { f } of paintOrder) {
      const { y1, y2, h } = placed.get(f)!;
      const to = f.to ?? "";
      ctx.item(f.id, () => {
        const role = ctx.role(srcIdx(f), { n: srcNames.length });
        const top: Array<[number, number]> = [];
        const bot: Array<[number, number]> = [];
        const segs = 24;
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const ease = t * t * (3 - 2 * t);
          const px = lerp(colX.src, colX.dst, t);
          top.push([px, lerp(y1, y2, ease)]);
          bot.unshift([px, lerp(y1 + h, y2 + h, ease)]);
        }
        ctx.poly([...top, ...bot], { stroke: withAlpha(role.color, 0.55), fill: withAlpha(role.color, alpha), fillStyle: "solid", strokeWidth: 1, roughness: 0.3 }, { z: -1, id: ctx.uid(`${f.id}_${to}`) });
        if (ctx.showValue(f)) ctx.label(fmtNum(f.value ?? 1), colX.dst - 34, y2 + h / 2, { size: 17, color: ctx.ink, weight: 700, align: "right", role: "value" });
      });
    }
  },
});

// ---- drop-off ------------------------------------------------------------------------------------

registerViz({
  name: "drop-off",
  aliases: ["dropoff"],
  category: "Data",
  summary: "Nested rounded cards stepping down-right, each sized by its value, called out in a column beside them.",
  entryKinds: ["item", "stage"],
  options: [{ name: "showValues", type: "boolean", description: "print item values (default true)" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "stage");
    const n = Math.max(items.length, 1);
    // nested cascade (reference design): each smaller card overlaps the previous
    // toward its bottom-right
    const s0 = 200;
    const shrink = 0.74;
    const cx0 = 190;
    const cy0 = 60;
    let brX = cx0 + s0;
    let brY = cy0 + s0;
    // card AREA tracks the value (side ∝ √value), floored so a tiny stage
    // stays legible; value-less stages fall back to a steady shrink
    const v0 = items[0]?.value;
    const sizes = items.map((it, i) => (v0 && v0 > 0 && it.value !== undefined ? Math.max(s0 * 0.3, s0 * Math.sqrt(Math.max(it.value, 0) / v0)) : s0 * Math.pow(shrink, i)));
    // card boxes first: the callout column sits one gutter right of the cascade
    const cards = sizes.map((s, i) => {
      if (i > 0) {
        brX += s * 0.28;
        brY += s * 0.3;
      }
      return { x: brX - s, y: brY - s, s };
    });
    const colX = Math.max(...cards.map((c) => c.x + c.s)) + 44;
    let prevBottom = -Infinity;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const { x, y, s } = cards[i];
      ctx.shape("rectangle", x, y, s, s, role, { id: ctx.uid(item.id), style: { roundness: s * 0.2 } });
      // the card's emblem, in its own hue, at a constant inset from its top-left
      if (item.icon) ctx.icon(item.icon, x + s * 0.24, y + s * 0.24, Math.max(28, s * 0.26), role.color);
      // callouts: one column right of the cascade, each on a leader from its
      // OWN card's right edge — taken from the part of that edge the next
      // (down-right) card never covers, so no leader crosses a card
      const next = cards[i + 1];
      const exposed = next ? next.y - y : s;
      const ly = y + Math.min(s * 0.28, exposed / 2);
      const value = ctx.showValue(item) && item.value !== undefined ? ` ${fmtNum(item.value)}` : "";
      const m = ctx.measureLabelBlock(item.label + value, item.detail, { maxW: 220 });
      const by = Math.max(ly, prevBottom + 10 + m.h / 2);
      prevBottom = by + m.h / 2;
      ctx.shape("circle", x + s - 4, ly - 4, 8, 8, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0 }, { z: 2 });
      ctx.line(
        [
          [x + s + 4, ly],
          [colX - 12, by],
        ],
        { color: role.color, width: 1.4 },
      );
      ctx.labelBlock(item.label + value, item.detail, colX, by, { color: role.color, align: "left", maxW: 220 });
      }),
    );
  },
});
