/**
 * Radial visualizations: pie, gauge, cycle, bullseye, relationship, porters,
 * impact, performance. Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { polar, radialAlign, radialLabel } from "./util.js";

// ---- pie ---------------------------------------------------------------------

registerViz({
  name: "pie",
  aliases: ["donut"],
  category: "Data",
  summary: "Pie/donut chart with percentage callouts.",
  entryKinds: ["item", "slice"],
  options: [
    { name: "variant", type: "pie|donut", description: "\"donut\" cuts a hole in the middle" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  sweetSpot: { min: 2, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "slice");
    const n = Math.max(items.length, 1);
    const D = 280;
    const cx = D / 2 + 150;
    const cy = D / 2 + 20;
    const inner = spec.type === "donut" || optStr(spec.options, "variant") === "donut" ? 0.55 : 0;
    const total = items.reduce((s, it) => s + (it.value ?? 1), 0) || 1;
    let angle = -90;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const sweep = ((item.value ?? 1) / total) * 360;
        ctx.shape("sector", cx - D / 2, cy - D / 2, D, D, role, {
          id: ctx.uid(item.id),
          data: { start: angle, end: angle + sweep, inner },
        });
        const mid = angle + sweep / 2;
        const pct = Math.round(((item.value ?? 1) / total) * 100);
        const pctText = ctx.showValue(item) ? `${pct}% ` : "";
        radialLabel(ctx, cx, cy, D / 2, mid, `${pctText}${item.label}`, item.detail, role.color, { maxW: 190 });
        if (item.icon) {
          const [ix, iy] = polar(cx, cy, (D / 2) * 0.62, mid);
          ctx.icon(item.icon, ix, iy, 28, role.textColor);
        }
        angle += sweep;
      }),
    );
  },
});

// ---- gauge --------------------------------------------------------------------

registerViz({
  name: "gauge",
  category: "Data",
  summary: "A 270° dial showing one value (0–100).",
  entryKinds: ["item", "value"],
  options: [
    { name: "value", type: "number", description: "dial value 0–100 (else the first item's value)" },
    { name: "label", type: "string", description: "caption below the dial (else the first item's label)" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  sweetSpot: { min: 1, max: 1 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "value");
    const value = Math.max(0, Math.min(100, optNum(spec.options, "value") ?? items[0]?.value ?? 0));
    const caption = optStr(spec.options, "label") ?? items[0]?.label ?? "";
    const D = 240;
    const cx = D / 2 + 40;
    const cy = D / 2 + 40;
    const start = 135;
    const sweep = 270;
    const role = ctx.role(0, { n: 1, color: items[0]?.color });
    // track band (neutral) + value band
    ctx.shape("sector", cx - D / 2, cy - D / 2, D, D, ctx.role(0, { neutral: true }), {
      data: { start, end: start + sweep, inner: 0.72 },
      style: { opacity: 45 },
    });
    ctx.shape("sector", cx - D / 2, cy - D / 2, D, D, role, {
      id: ctx.uid("value"),
      data: { start, end: start + (sweep * value) / 100, inner: 0.72 },
    });
    // needle
    const needleAngle = start + (sweep * value) / 100;
    const [nx, ny] = polar(cx, cy, D / 2 - 34, needleAngle);
    ctx.line(
      [
        [cx, cy],
        [nx, ny],
      ],
      { color: ctx.ink, width: 3 },
    );
    ctx.shape("circle", cx - 7, cy - 7, 14, 14, { stroke: ctx.ink, fill: ctx.ink, fillStyle: "solid", strokeWidth: 1, roughness: ctx.preset.roughness });
    if (items[0] ? ctx.showValue(items[0]) : ctx.showValues) {
      ctx.label(`${Math.round(value)}%`, cx, cy + 58, { size: 27, color: role.color, weight: 700, font: "heading", role: "value" });
    }
    if (caption) ctx.label(caption, cx, cy + 92, { size: 18, color: ctx.ink, font: "body" });
  },
});

// ---- cycle --------------------------------------------------------------------

registerViz({
  name: "cycle",
  aliases: ["loop"],
  category: "Process",
  summary: "Phases on a ring with sweeping arrows between them.",
  entryKinds: ["item", "phase", "step"],
  sweetSpot: { min: 3, max: 8 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "phase", "step");
    const n = Math.max(items.length, 2);
    const big = n <= 4;
    const R = big ? 150 : 165;
    const nodeR = big ? 56 : 5;
    const cx = R + nodeR + 260;
    const cy = R + nodeR + 40;
    const step = 360 / n;
    items.forEach((item, i) => {
      const role = ctx.role(i, { n, color: item.color });
      const a = -90 + i * step;
      const [nx, ny] = polar(cx, cy, R, a);
      ctx.item(item.id, () => {
        if (big) {
          ctx.shape("circle", nx - nodeR, ny - nodeR, nodeR * 2, nodeR * 2, role, { id: ctx.uid(item.id) });
          if (item.icon) ctx.icon(item.icon, nx, ny, 40, role.textColor);
          else ctx.label(String(i + 1), nx, ny, { size: 28, color: role.textColor, weight: 700, font: "heading" });
        } else {
          ctx.shape("circle", nx - nodeR, ny - nodeR, nodeR * 2, nodeR * 2, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: ctx.preset.roughness }, { id: ctx.uid(item.id) });
        }
      });
      // connector to the NEXT item — shared between the two, so not item-scoped.
      // sweeping arrow to the next node: a chunky "banana" band with a fat
      // head (reference design) for big nodes, a thin curved arrow otherwise
      const gapDeg = big ? (Math.asin((nodeR + 14) / R) * 180) / Math.PI : 14;
      const a1 = a + gapDeg;
      const a2 = a + step - gapDeg;
      if (big) {
        const bw = 17;
        const headDeg = Math.min(14, (a2 - a1) * 0.38);
        const bodyEnd = a2 - headDeg;
        const outer: Array<[number, number]> = [];
        const inner: Array<[number, number]> = [];
        const segs = 12;
        for (let s = 0; s <= segs; s++) {
          const ang = a1 + ((bodyEnd - a1) * s) / segs;
          outer.push(polar(cx, cy, R + bw / 2, ang));
          inner.unshift(polar(cx, cy, R - bw / 2, ang));
        }
        const band: Array<[number, number]> = [
          ...outer,
          polar(cx, cy, R + bw * 1.15, bodyEnd),
          polar(cx, cy, R, a2), // tip
          polar(cx, cy, R - bw * 1.15, bodyEnd),
          ...inner,
        ];
        ctx.poly(band, role, { id: ctx.uid(`${item.id}_arrow`) });
      } else {
        const arcPts: Array<[number, number]> = [];
        const segs = 14;
        for (let s = 0; s <= segs; s++) arcPts.push(polar(cx, cy, R, a1 + ((a2 - a1) * s) / segs));
        ctx.line(arcPts, { color: ctx.preset.edge, width: 2, arrow: true });
      }
      // label outside the ring
      ctx.item(item.id, () => radialLabel(ctx, cx, cy, R + nodeR + 10, a, item.label, item.detail, role.color, { maxW: 210 }));
    });
  },
});

// ---- bullseye ------------------------------------------------------------------

registerViz({
  name: "bullseye",
  aliases: ["target"],
  category: "Hierarchy",
  summary: "Concentric target rings, labels on the left with leader lines.",
  entryKinds: ["item", "ring"],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "ring");
    const n = Math.max(items.length, 1);
    const outerR = 150;
    const cx = 420 + outerR;
    const cy = outerR + 20;
    const textX = 0;
    // label pitch grows to fit the tallest block (long descriptions)
    const labelH = Math.max(0, ...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: 240 }).h));
    const labelPitch = Math.max(72, labelH + 20);
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const r = outerR * (1 - i / n);
        const innerRatio = i === n - 1 ? 0 : (outerR * (1 - (i + 1) / n)) / r;
        ctx.shape("sector", cx - r, cy - r, r * 2, r * 2, role, {
          id: ctx.uid(item.id),
          data: { start: 0, end: 359.999, inner: innerRatio },
        });
        // leader line from the left text column to this ring's left edge
        const bandMidX = cx - (r + innerRatio * r) / 2;
        const ly = cy - outerR + 16 + i * labelPitch; // stagger down from the top
        const block = ctx.labelBlock(item.label, item.detail, textX, ly, { color: role.color, align: "left", maxW: 240 });
        ctx.shape("circle", block.x + block.w + 10, ly - 3, 6, 6, { stroke: ctx.ink, fill: ctx.ink, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 });
        ctx.line(
          [
            [block.x + block.w + 16, ly],
            [bandMidX, ly],
          ],
          { color: ctx.mutedInk, width: 1.4 },
        );
        // icon inside its own band: at 12 o'clock for rings, dead center for the bull
        if (item.icon) {
          const iconY = i === n - 1 ? cy : cy - (r + innerRatio * r) / 2;
          ctx.icon(item.icon, cx, iconY, 28, role.textColor);
        }
      }),
    );
  },
});

// ---- relationship ----------------------------------------------------------------

registerViz({
  name: "relationship",
  aliases: ["hub-spoke", "orbit"],
  category: "Comparison",
  summary: "A hub with satellites on a dashed orbit ring.",
  entryKinds: ["item", "node", "center", "hub"],
  sweetSpot: { min: 3, max: 8 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "node");
    const center = spec.items.find((i) => i.kind === "center" || i.kind === "hub");
    const n = Math.max(items.length, 1);
    const R = 160;
    const cx = R + 240;
    const cy = R + 60;
    // atomic-orbit motif: overlapping dashed ellipses behind the hub
    for (const rot of [18, 78, 138]) {
      const orbit: Array<[number, number]> = [];
      const rx = R * 1.12;
      const ry = R * 0.48;
      for (let s = 0; s <= 56; s++) {
        const t = (2 * Math.PI * s) / 56;
        const ox = Math.cos(t) * rx;
        const oy = Math.sin(t) * ry;
        const rr = (rot * Math.PI) / 180;
        orbit.push([cx + ox * Math.cos(rr) - oy * Math.sin(rr), cy + ox * Math.sin(rr) + oy * Math.cos(rr)]);
      }
      ctx.line(orbit, { color: ctx.mutedInk, width: 1.2, dash: true, z: -1 });
    }
    // hub (item-scoped when the center IS a data entry)
    const hubR = 52;
    const hubRole = center?.color ? ctx.role(0, { color: center.color }) : ctx.role(0, { emphasis: true, n: n + 1 });
    const drawHub = () => {
      ctx.shape("circle", cx - hubR, cy - hubR, hubR * 2, hubR * 2, hubRole, { id: ctx.uid("hub") });
      if (center?.icon) ctx.icon(center.icon, cx, cy, 40, hubRole.textColor);
      else if (center?.label) ctx.label(ctx.wrap(center.label, hubR * 1.7, 16), cx, cy, { size: 16, color: hubRole.textColor, weight: 700, font: "heading" });
    };
    if (center) ctx.item(center.id, drawHub);
    else drawHub();
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const a = -90 + (360 / n) * i;
        const [sx, sy] = polar(cx, cy, R, a);
        const r = 26;
        ctx.shape("circle", sx - r, sy - r, r * 2, r * 2, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, sx, sy, 24, role.textColor);
        radialLabel(ctx, cx, cy, R + r + 8, a, item.label, item.detail, role.color, { maxW: 180 });
      }),
    );
  },
});

// ---- porters ---------------------------------------------------------------------

registerViz({
  name: "porters",
  aliases: ["forces"],
  category: "Business Frameworks",
  summary: "Porter's forces — circles around a center, labels radiating out.",
  entryKinds: ["item", "force"],
  sweetSpot: { min: 4, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "force");
    const n = Math.max(items.length, 2);
    const R = 132;
    const cx = R + 300;
    const cy = R + 90;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const a = -90 + (360 / n) * i;
        const [sx, sy] = polar(cx, cy, R, a);
        const r = 50;
        // spoke pointing inward (owned by this force)
        const [ix, iy] = polar(cx, cy, R - r - 8, a);
        const [ex, ey] = polar(cx, cy, 26, a);
        ctx.arrow(ix, iy, ex, ey, { color: ctx.mutedInk, width: 1.6 });
        ctx.shape("circle", sx - r, sy - r, r * 2, r * 2, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, sx, sy, 36, role.textColor);
        else ctx.label(String(i + 1), sx, sy, { size: 26, color: role.textColor, weight: 700, font: "heading" });
        radialLabel(ctx, cx, cy, R + r + 10, a, item.label, item.detail, role.color, { maxW: 210 });
      }),
    );
  },
});

// ---- impact -----------------------------------------------------------------------

registerViz({
  name: "impact",
  category: "Cause and Effect",
  summary: "One cause radiating to effect bubbles above it.",
  entryKinds: ["item", "effect", "cause", "center"],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "effect");
    const causeItem = spec.items.find((i) => i.kind === "cause" || i.kind === "center");
    const cause = causeItem ?? { label: spec.title ?? "Cause", detail: undefined, icon: undefined, color: undefined, id: "cause" };
    const n = Math.max(items.length, 1);
    const cx = 360;
    const cy = 360;
    const causeR = 86;
    const causeRole = ctx.role(0, { emphasis: true, color: (cause as VizItem).color });
    const drawCause = () => {
      ctx.shape("circle", cx - causeR, cy - causeR, causeR * 2, causeR * 2, causeRole, { id: ctx.uid("cause") });
      ctx.label(ctx.wrap((cause as VizItem).label, causeR * 1.6, 18), cx, cy, { size: 18, color: causeRole.textColor, weight: 700, font: "heading" });
    };
    // item-scope the cause only when it IS a data entry (not the synthetic fallback)
    if (causeItem) ctx.item(causeItem.id, drawCause);
    else drawCause();
    const spreadStart = 180 + (180 - 140) / 2 + 20;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i + 1, { n: n + 1, color: item.color });
        const a = n === 1 ? -90 : spreadStart + (140 / (n - 1)) * i;
        const dist = 210;
        const [ex, ey] = polar(cx, cy, dist, a);
        const r = 44;
        // curved stem (cause -> this effect, owned by the effect)
        const [s1x, s1y] = polar(cx, cy, causeR + 6, a);
        const [s2x, s2y] = polar(cx, cy, dist - r - 8, a);
        ctx.line(
          [
            [s1x, s1y],
            [(s1x + s2x) / 2 + 10, (s1y + s2y) / 2],
            [s2x, s2y],
          ],
          { color: ctx.mutedInk, width: 1.8, arrow: true },
        );
        ctx.shape("circle", ex - r, ey - r, r * 2, r * 2, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, ex, ey, 30, role.textColor);
        else ctx.label(String(i + 1), ex, ey, { size: 24, color: role.textColor, weight: 700, font: "heading" });
        // label immediately beside its own circle (reference keeps them adjacent)
        radialLabel(ctx, ex, ey, r, a, item.label, item.detail, role.color, { maxW: 200, gap: 10 });
      }),
    );
  },
});

// ---- performance --------------------------------------------------------------------

registerViz({
  name: "performance",
  aliases: ["kpis", "metrics"],
  category: "Visual Metaphors",
  summary: "Side-by-side donut gauges, one per metric.",
  entryKinds: ["item", "metric"],
  options: [
    { name: "summary", type: "string", description: "caption under the panels" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  sweetSpot: { min: 2, max: 4 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "metric");
    const n = Math.max(items.length, 1);
    const panelW = 220;
    const summary = optStr(spec.options, "summary");
    const panelH = 322;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const x0 = i * (panelW + 24);
        const cxP = x0 + panelW / 2;
        const value = Math.max(0, Math.min(100, item.value ?? 0));
        // card frame binds the metric into one unit (reference design)
        ctx.shape("rectangle", x0, 0, panelW, panelH, { stroke: role.color, fill: null, fillStyle: "none", strokeWidth: Math.max(1.4, role.strokeWidth * 0.8), roughness: ctx.preset.roughness, roundness: 14 }, { z: -1 });
        ctx.labelBlock(item.label, item.detail, cxP, 30, { color: role.color, align: "center", maxW: panelW - 28, vAnchor: "top" });
        const D = 128;
        const gy = 116;
        ctx.shape("sector", cxP - D / 2, gy, D, D, ctx.role(i, { neutral: true }), { data: { start: 0, end: 359.999, inner: 0.74 }, style: { opacity: 40 } });
        ctx.shape("sector", cxP - D / 2, gy, D, D, role, { id: ctx.uid(item.id), data: { start: -90, end: -90 + (value / 100) * 359.99, inner: 0.74 } });
        if (item.icon) ctx.icon(item.icon, cxP, gy + D / 2, 40, role.color);
        if (ctx.showValue(item)) ctx.label(`${Math.round(value)}%`, cxP, gy + D + 32, { size: 24, color: role.color, weight: 700, font: "heading", role: "value" });
      }),
    );
    if (summary) {
      const b = ctx.bounds();
      ctx.label(summary, b.x + b.w / 2, b.y + b.h + 40, { size: 18, color: ctx.ink, maxW: 560 });
    }
  },
});
