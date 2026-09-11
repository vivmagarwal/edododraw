/**
 * Strategy & planning visualizations (viz roadmap tier 1, 2026-07):
 * flywheel, radar, roadmap-lanes, milestone-path, value-chain, pricing-tiers.
 * See design-notes/viz-roadmap-2026-07.md for the selection rationale.
 */

import type { NodeStyle } from "../../scene/types.js";
import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { withAlpha } from "../../style/color.js";
import { fmtNum, polar, radialLabel, smoothPath, smoothShape, type Anchor } from "./util.js";

function outline(ctx: VizContext, color: string, strokeWidth?: number): Partial<NodeStyle> {
  return { stroke: color, fill: null, fillStyle: "none", strokeWidth: strokeWidth ?? ctx.preset.strokeWidth, roughness: ctx.preset.roughness };
}

/**
 * One closed outline for a ring segment that ends in a chevron POINT and
 * starts in a matching notch, so consecutive segments nest like arrowheads
 * instead of carrying a separate triangle stapled past their own end edge.
 * Angles are degrees, clockwise from 12 o'clock like the rest of the file;
 * the path is drawn in the wheel's (2R x 2R) box with true arcs.
 */
function chevronSegment(R: number, inner: number, start: number, end: number, tipDeg: number): string {
  const ri = R * inner;
  const rMid = (R + ri) / 2;
  const f = ([x, y]: [number, number]): string => `${(x + R).toFixed(2)},${(y + R).toFixed(2)}`;
  const large = end - start > 180 ? 1 : 0;
  return [
    `M${f(polar(0, 0, R, start))}`,
    `A${R},${R} 0 ${large} 1 ${f(polar(0, 0, R, end))}`,
    `L${f(polar(0, 0, rMid, end + tipDeg))}`,
    `L${f(polar(0, 0, ri, end))}`,
    `A${ri},${ri} 0 ${large} 0 ${f(polar(0, 0, ri, start))}`,
    `L${f(polar(0, 0, rMid, start + tipDeg))}`,
    "Z",
  ].join(" ");
}

/**
 * Radar ring values: a round step giving 2-5 rings that land exactly on the
 * scale maximum (1..5 for a 5-point scale), else thirds of the maximum.
 */
function radarRings(max: number): number[] {
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const m of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]) {
    const step = m * mag;
    const count = max / step;
    if (count >= 2 && count <= 5 && Math.abs(count - Math.round(count)) < 1e-9) {
      return Array.from({ length: Math.round(count) }, (_, k) => step * (k + 1));
    }
  }
  return [max / 3, (2 * max) / 3, max];
}

// ---- flywheel -----------------------------------------------------------------

registerViz({
  name: "flywheel",
  category: "Business Frameworks",
  summary: "Thick ring segments spinning clockwise — a self-reinforcing momentum loop.",
  entryKinds: ["item", "stage", "center"],
  options: [{ name: "center", type: "string", description: "label inside the wheel (or use a `center` entry)" }],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "stage");
    const n = Math.max(items.length, 1);
    const centerEntry = spec.items.find((i) => i.kind === "center");
    const centerLabel = centerEntry?.label ?? optStr(spec.options, "center");
    const R = 158;
    const inner = 0.6;
    const gapDeg = 10;
    const tipDeg = 9; // chevron depth; tip and the next notch sit gapDeg apart
    const seg = 360 / n;
    const rMid = (R * (1 + inner)) / 2;

    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const start = -90 + i * seg + gapDeg / 2;
        const end = -90 + (i + 1) * seg - gapDeg / 2;
        // one segment = one outline, pointed at its end and notched at its
        // start — the wheel visibly spins clockwise
        ctx.path(chevronSegment(R, inner, start, end, tipDeg), R * 2, R * 2, -R, -R, R * 2, R * 2, role, { id: ctx.uid(item.id) });
        const mid = (start + end + tipDeg) / 2;
        if (item.icon) {
          const [ix, iy] = polar(0, 0, rMid, mid);
          ctx.icon(item.icon, ix, iy, 30, role.textColor);
        }
        radialLabel(ctx, 0, 0, R, mid, item.label, item.detail, role.color, { maxW: 190 });
      }),
    );

    if (centerLabel) {
      const draw = () => {
        ctx.label(ctx.wrap(centerLabel, R * inner * 1.5, 22, "heading", 3), 0, 0, { size: 22, color: ctx.ink, weight: 700, font: "heading", z: 3 });
        if (centerEntry?.detail) ctx.label(ctx.wrap(centerEntry.detail, R * inner * 1.5, 14, "body", 2), 0, 34, { size: 14, color: ctx.mutedInk, z: 3, role: "detail" });
      };
      if (centerEntry) ctx.item(centerEntry.id, draw);
      else draw();
    }
  },
});

// ---- radar --------------------------------------------------------------------

registerViz({
  name: "radar",
  category: "Data",
  summary: "Spider chart — 1-3 series polygons over 4-8 labeled axes.",
  entryKinds: ["axis", "series", "item"],
  options: [{ name: "max", type: "number", description: "scale maximum (default: largest value)" }],
  sweetSpot: { min: 4, max: 8 },
  generate(spec: VizSpec, ctx: VizContext) {
    let axes = itemsOf(spec, "axis");
    let series = itemsOf(spec, "series");
    // single-series sugar: plain items double as axes carrying their own value
    if (!axes.length) {
      const items = itemsOf(spec, "item");
      axes = items;
      if (!series.length && items.some((i) => i.value !== undefined)) {
        series = [{ kind: "series", id: "s1", label: "", detail: undefined, value: undefined, values: items.map((i) => i.value ?? 0), strings: [], opts: {}, children: [] } as VizItem];
      }
    }
    const K = Math.max(axes.length, 3);
    const R = 150;
    const max = optNum(spec.options, "max") ?? Math.max(1, ...series.flatMap((s) => s.values));
    const angle = (i: number) => -90 + (i * 360) / K;
    const ringPts = (f: number) => axes.map((_, i) => polar(0, 0, R * f, angle(i)));

    // grid: spokes + dashed inner rings + the solid outer ring, drawn ABOVE
    // the series fills (z 1) in a light ink so the scale survives an opaque
    // fill; the series outlines and dots sit above the grid again (z 2).
    const gridInk = withAlpha(ctx.mutedInk, 0.45);
    const rings = radarRings(max);
    for (let i = 0; i < K; i++) ctx.line([[0, 0], polar(0, 0, R, angle(i))], { color: gridInk, width: 1.1, z: 1 });
    for (const v of rings.slice(0, -1)) ctx.poly(ringPts(v / max), { ...outline(ctx, gridInk, 1.1), strokeStyle: "dashed" }, { z: 1 });
    ctx.poly(ringPts(1), outline(ctx, withAlpha(ctx.mutedInk, 0.7), 1.6), { z: 1 });
    // the scale, up the left side of the top spoke (clear of the vertex dots)
    for (const v of rings) ctx.label(fmtNum(v), -9, (-R * v) / max, { size: 13, color: ctx.mutedInk, align: "right", z: 3, role: "value" });

    // axis labels (each axis entry is addressable)
    axes.forEach((ax, i) =>
      ctx.item(ax.id, () => {
        radialLabel(ctx, 0, 0, R, angle(i), ax.label, ax.detail, ctx.ink, { maxW: 150, gap: 12 });
      }),
    );

    // series polygons + vertex dots + legend chips
    const legendY = R + 74;
    let legendX = series.length > 1 ? (-(series.length * 130) + 26) / 2 : 0;
    series.forEach((s, si) =>
      ctx.item(s.id, () => {
        const role = ctx.role(si, { n: Math.max(series.length, 2), color: s.color });
        const pts = axes.map((_, i) => polar(0, 0, (R * Math.max(0, Math.min(max, s.values[i] ?? 0))) / max, angle(i)));
        ctx.poly(pts, { stroke: "transparent", fill: role.softFill, fillStyle: "solid", strokeWidth: 0, roughness: ctx.preset.roughness, opacity: 60 });
        ctx.poly(pts, { stroke: role.color, fill: null, fillStyle: "none", strokeWidth: 2.6, roughness: ctx.preset.roughness }, { z: 2 });
        for (const [px, py] of pts) ctx.shape("circle", px - 5, py - 5, 10, 10, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0.6 }, { z: 2 });
        if (s.label && series.length > 1) {
          ctx.shape("rectangle", legendX, legendY - 7, 15, 15, { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 1.6, roughness: ctx.preset.roughness });
          ctx.label(s.label, legendX + 23, legendY + 1, { size: 15, color: ctx.ink, align: "left" });
          legendX += 130;
        }
      }),
    );
  },
});

// ---- roadmap-lanes ---------------------------------------------------------------

registerViz({
  name: "roadmap-lanes",
  category: "Timelines",
  summary: "Workstream swimlanes × time columns — the product-roadmap slide.",
  entryKinds: ["lane", "task", "milestone", "item"],
  options: [{ name: "scale", type: "string[]", description: 'column headers, e.g. ["Q1","Q2","Q3","Q4"]' }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const lanes = itemsOf(spec, "lane", "item").filter((l) => l.children.length);
    const scale = (spec.options.scale as unknown[] | undefined)?.map(String) ?? ["Q1", "Q2", "Q3", "Q4"];
    const cols = scale.length;
    const colW = 158;
    const rowH = 44;
    const lanePad = 14;
    // the lane-name gutter: the icon inset (34) + the longest name + 20 of air
    // before the first gridline (the old 24 of slack was spent by the icon)
    const labelX = lanes.some((l) => l.icon) ? 34 : 4;
    const labelW = labelX + Math.max(90, ...lanes.map((l) => ctx.measure(l.label, 18, "heading"))) + 20;
    const gridW = cols * colW;
    const headerH = 40;

    // column headers + dashed tick lines (shared scaffolding)
    scale.forEach((tick, c) => {
      ctx.label(tick, labelW + c * colW + colW / 2, headerH / 2 - 8, { size: 16, color: ctx.mutedInk, weight: ctx.preset.fonts.headingWeight, font: "heading" });
    });

    let y = headerH;
    const laneTop: number[] = [];
    lanes.forEach((lane, li) => {
      laneTop[li] = y;
      y += lanePad * 2 + lane.children.length * rowH;
    });
    const totalH = y;

    for (let c = 0; c <= cols; c++) {
      ctx.line([[labelW + c * colW, headerH - 6], [labelW + c * colW, totalH]], { color: ctx.mutedInk, width: 1.1, dash: true });
    }

    lanes.forEach((lane, li) => {
      const role = ctx.role(li, { n: Math.max(lanes.length, 2), color: lane.color });
      const top = laneTop[li];
      const h = lanePad * 2 + lane.children.length * rowH;
      ctx.item(lane.id, () => {
        // lane separator + name
        ctx.line([[0, top], [labelW + gridW, top]], { color: ctx.mutedInk, width: 1.4 });
        if (lane.icon) ctx.icon(lane.icon, 15, top + h / 2, 24, role.color);
        ctx.label(ctx.wrap(lane.label, labelW - labelX - 20, 18, "heading", 2), labelX, top + h / 2, { size: 18, color: role.color, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" });
      });
      lane.children.forEach((task, ti) => {
        ctx.item(task.id, () => {
          const cy = top + lanePad + ti * rowH + rowH / 2;
          const start = task.values[0] ?? 0;
          const end = task.values[1] ?? start + 1;
          if (task.kind === "milestone") {
            const mx = labelW + start * colW;
            ctx.shape("diamond", mx - 11, cy - 11, 22, 22, { stroke: role.color, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: ctx.preset.roughness });
            ctx.label(task.label, mx + 18, cy, { size: 15, color: ctx.ink, align: "left" });
            return;
          }
          const bx = labelW + start * colW;
          const bw = Math.max(colW * 0.35, (end - start) * colW);
          ctx.shape("pill", bx, cy - 15, bw, 30, { stroke: role.stroke, fill: role.fill ?? role.softFill, fillStyle: role.fillStyle, strokeWidth: role.strokeWidth, roughness: ctx.preset.roughness }, { id: ctx.uid(task.id) });
          const fits = ctx.measure(task.label, 15) < bw - 20;
          if (fits) ctx.label(task.label, bx + bw / 2, cy, { size: 15, color: role.textColor });
          else ctx.label(task.label, bx + bw + 10, cy, { size: 15, color: ctx.ink, align: "left" });
        });
      });
    });
    ctx.line([[0, totalH], [labelW + gridW, totalH]], { color: ctx.mutedInk, width: 1.4 });
  },
});

// ---- milestone-path -----------------------------------------------------------

registerViz({
  name: "milestone-path",
  category: "Timelines",
  summary: "A winding trail to a summit flag, milestones marked along the way.",
  entryKinds: ["item", "milestone", "goal"],
  options: [{ name: "goal", type: "string", description: "summit flag label (or use a `goal` entry)" }],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "milestone");
    const n = Math.max(items.length, 1);
    const goalEntry = spec.items.find((i) => i.kind === "goal");
    const goalLabel = goalEntry?.label ?? optStr(spec.options, "goal");

    // A landscape trail — gentle switchbacks climbing left to right — so the
    // card fills the ~2.4:1 frame instead of running as a portrait diagonal.
    const way: Array<[number, number]> = [
      [0, 352],
      [150, 332],
      [284, 296],
      [404, 312],
      [482, 246],
      [594, 204],
      [714, 190],
      [774, 120],
    ];
    const pts = catmull(way, 14);
    const [sx, sy] = pts[pts.length - 1];
    const [hx, hy] = pts[0];

    // the hillside the trail climbs: a pale fill-only silhouette whose SKYLINE
    // is the trail itself, dropped a hair so the dashes sit on the ridge. An
    // independently drawn ridge crossed the path — it ran above the climb in
    // the middle and below it at the trailhead, so the trail left the hill and
    // the fill read as a stray wedge.
    const baseY = 384;
    smoothShape(
      ctx,
      [
        [way[0][0] - 72, baseY, "corner"],
        ...way.map(([x, y]): Anchor => [x, y + 12]),
        [sx + 44, sy + 62],
        [sx + 96, baseY, "corner"],
      ],
      { stroke: "transparent", fill: withAlpha(ctx.mutedInk, 0.08), fillStyle: "solid", strokeWidth: 0, roughness: ctx.preset.roughness },
      { z: -2 },
    );

    // the trail: ONE smooth dashed path, so the dash pattern runs continuously
    // (a sampled polyline restarted it on every chord)
    const tx0 = Math.min(...way.map((w) => w[0]));
    const ty0 = Math.min(...way.map((w) => w[1]));
    const tw = Math.max(...way.map((w) => w[0])) - tx0;
    const th = Math.max(...way.map((w) => w[1])) - ty0;
    ctx.path(smoothPath(way.map(([x, y]): Anchor => [x - tx0, y - ty0]), { closed: false }), tw, th, tx0, ty0, tw, th, {
      stroke: ctx.ink,
      fill: null,
      fillStyle: "none",
      strokeWidth: 2.6,
      strokeStyle: "dashed",
      roughness: ctx.preset.roughness,
    });
    // trailhead marker ON the trail's first point
    ctx.shape("circle", hx - 10, hy - 10, 20, 20, { stroke: ctx.ink, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2.2, roughness: Math.min(0.3, ctx.preset.roughness) }, { z: 1 });

    // summit flag (the goal)
    const gRole = ctx.role(n, { n: n + 1, color: goalEntry?.color });
    const goalM = goalLabel ? ctx.measureLabelBlock(goalLabel, goalEntry?.detail, { maxW: 180 }) : { w: 0, h: 0 };
    const drawFlag = () => {
      ctx.line([[sx, sy], [sx, sy - 58]], { color: gRole.color, width: 2.6 });
      ctx.poly(
        [
          [sx, sy - 58],
          [sx + 48, sy - 47],
          [sx, sy - 36],
        ],
        { stroke: gRole.stroke, fill: gRole.fill ?? gRole.color, fillStyle: "solid", strokeWidth: gRole.strokeWidth, roughness: ctx.preset.roughness },
      );
      if (goalLabel) ctx.labelBlock(goalLabel, goalEntry?.detail, sx + 60, sy - 64, { color: gRole.color, align: "left", maxW: 180, vAnchor: "top" });
    };
    if (goalEntry) ctx.item(goalEntry.id, drawFlag);
    else drawFlag();

    // milestones spaced by arc length
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const total = cum[cum.length - 1];
    const at = (s: number): { p: [number, number]; i: number } => {
      const target = s * total;
      let i = cum.findIndex((c) => c >= target);
      if (i < 0) i = pts.length - 1;
      return { p: pts[i], i };
    };
    // Each label hangs above or below its dot on the CONVEX side of the local
    // bend (outside a hump, under a valley), then is pushed further out while
    // it touches the trail, the flag or an earlier label — the old alternating
    // sides let the trail strike through the words.
    type Box = { x0: number; y0: number; x1: number; y1: number };
    const hit = (A: Box, B: Box, m: number): boolean => A.x0 < B.x1 + m && B.x0 < A.x1 + m && A.y0 < B.y1 + m && B.y0 < A.y1 + m;
    const obstacles: Box[] = [{ x0: sx - 6, y0: sy - 62, x1: sx + 52, y1: sy + 4 }];
    if (goalLabel) obstacles.push({ x0: sx + 60, y0: sy - 64, x1: sx + 60 + goalM.w, y1: sy - 64 + goalM.h });
    obstacles.push({ x0: hx - 12, y0: hy - 12, x1: hx + 12, y1: hy + 12 });
    const marks = items.map((item, i) => {
      const { p, i: k } = at((i + 1) / (n + 0.6));
      const a = pts[Math.max(0, k - 5)];
      const b = pts[Math.min(pts.length - 1, k + 5)];
      const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
      const m = ctx.measureLabelBlock(item.label, item.detail, { maxW: 170 });
      const base = 16 + (item.icon ? 34 : 0);
      return { item, i, p, side: cross > 0 ? -1 : 1, base, off: base, w: m.w, h: m.h };
    });
    type Mark = (typeof marks)[number];
    const boxOf = (m: Mark): Box => {
      const y0 = m.side < 0 ? m.p[1] - m.off - m.h : m.p[1] + m.off;
      return { x0: m.p[0] - m.w / 2, x1: m.p[0] + m.w / 2, y0, y1: y0 + m.h };
    };
    const cost = (m: Mark, placed: Mark[]): number => {
      const B = boxOf(m);
      let c = 0;
      for (const [x, y] of pts) if (x > B.x0 - 10 && x < B.x1 + 10 && y > B.y0 - 10 && y < B.y1 + 10) c++;
      for (const o of obstacles) if (hit(B, o, 6)) c += 50;
      for (const q of placed) if (hit(B, boxOf(q), 8)) c += 50;
      return c;
    };
    marks.forEach((m, mi) => {
      const placed = marks.slice(0, mi);
      let best = { side: m.side, off: m.base, c: Infinity };
      for (const side of [m.side, -m.side]) {
        m.side = side;
        for (let step = 0; step < 8 && best.c > 0; step++) {
          m.off = m.base + step * 12;
          const c = cost(m, placed);
          if (c < best.c) best = { side, off: m.off, c };
        }
        if (best.c === 0) break;
      }
      m.side = best.side;
      m.off = best.off;
    });
    marks.forEach((m) =>
      ctx.item(m.item.id, () => {
        const { item, i, p, side } = m;
        const role = ctx.role(i, { n: n + 1, color: item.color });
        const B = boxOf(m);
        const near = side < 0 ? B.y1 : B.y0; // label edge facing the dot
        ctx.shape("circle", p[0] - 8, p[1] - 8, 16, 16, { stroke: role.stroke, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: 0.8 }, { id: ctx.uid(item.id), z: 1 });
        let reach = near - side * 4;
        if (item.icon) {
          ctx.icon(item.icon, p[0], near - side * 17, 26, role.color);
          reach = near - side * 34;
        }
        if (Math.abs(reach - p[1]) > 16) ctx.line([[p[0], p[1] + side * 11], [p[0], reach]], { color: ctx.preset.edge, width: 1.2, dotted: true });
        ctx.labelBlock(item.label, item.detail, p[0], near, { color: role.color, align: "center", maxW: 170, vAnchor: side < 0 ? "bottom" : "top" });
      }),
    );
  },
});

/** Catmull-Rom sample through waypoints (`per` points per segment). */
function catmull(way: Array<[number, number]>, per: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < way.length - 1; i++) {
    const p0 = way[i - 1] ?? way[i];
    const p1 = way[i];
    const p2 = way[i + 1];
    const p3 = way[i + 2] ?? p2;
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(way[way.length - 1]);
  return out;
}

// ---- value-chain ---------------------------------------------------------------

registerViz({
  name: "value-chain",
  category: "Business Frameworks",
  summary: "Porter-style chevron band; optional support-activity bars above.",
  entryKinds: ["item", "stage", "support"],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "stage");
    const supports = spec.items.filter((i) => i.kind === "support");
    const n = Math.max(items.length, 1);
    const W = 168;
    const H = 104;
    // Each chevron's notch nests into the previous point with a real gap: the
    // old 26-unit overlap missed the 26.88-unit notch by a hair, which drew
    // two outlines side by side at every join.
    const notch = 0.16;
    const gap = 10;
    const pitch = W - W * notch + gap;
    const bandW = (n - 1) * pitch + W;

    // support activities: full-width thin bars stacked above the chevron band
    supports.forEach((s, si) =>
      ctx.item(s.id, () => {
        const sy = -34 * (supports.length - si) - 18;
        ctx.shape("rectangle", 0, sy, bandW, 28, { stroke: ctx.mutedInk, fill: null, fillStyle: "none", strokeWidth: 1.6, roughness: ctx.preset.roughness }, { id: ctx.uid(s.id) });
        ctx.label(s.label, 14, sy + 14, { size: 15, color: ctx.mutedInk, align: "left" });
      }),
    );

    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const x = i * pitch;
        ctx.shape("chevron", x, 0, W, H, role, { id: ctx.uid(item.id), data: { dir: "right", notch } });
        const cx = x + W / 2 + (i === 0 ? -4 : 6);
        if (item.icon) {
          ctx.icon(item.icon, cx, H / 2 - 18, 26, role.textColor);
          ctx.label(ctx.wrap(item.label, W - 62, 17, "heading", 2), cx, H / 2 + 16, { size: 17, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        } else {
          ctx.label(ctx.wrap(item.label, W - 62, 17, "heading", 3), cx, H / 2, { size: 17, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        }
        if (item.detail) {
          ctx.label(ctx.wrap(item.detail, W - 28, 14, "body", 3), cx, H + 30, { size: 14, color: ctx.mutedInk, role: "detail", vAnchor: "top" });
        }
      }),
    );
  },
});

// ---- pricing-tiers --------------------------------------------------------------

registerViz({
  name: "pricing-tiers",
  category: "Comparison",
  summary: "Plan cards with price + feature lists; one tier can be highlighted.",
  entryKinds: ["tier", "plan", "item"],
  options: [
    { name: "period", type: "string", description: 'price suffix, e.g. "/mo"' },
    { name: "currency", type: "string", description: 'price prefix (default "$")' },
    { name: "showValues", type: "boolean", description: "print prices (default true)" },
  ],
  sweetSpot: { min: 2, max: 4 },
  generate(spec: VizSpec, ctx: VizContext) {
    const tiers = itemsOf(spec, "tier", "plan", "item");
    const n = Math.max(tiers.length, 1);
    const period = optStr(spec.options, "period") ?? "/mo";
    const currency = optStr(spec.options, "currency") ?? "$";
    const W = 212;
    const gap = 30;
    const maxFeatures = Math.max(0, ...tiers.map((t) => t.children.length));
    const headH = 118;
    const H = headH + maxFeatures * 30 + 26;
    const lift = 20;

    tiers.forEach((tier, i) =>
      ctx.item(tier.id, () => {
        const role = ctx.role(i, { n, color: tier.color });
        const hot = tier.opts.highlight === true || tier.opts.recommended === true;
        const x = i * (W + gap);
        // The lift raises the highlighted CARD only: its content stays on the
        // shared rows (name, price, divider, features line up across tiers)
        // and the extra height goes where the lift came from, not to its foot.
        const cardY = hot ? -lift : 0;
        const y = 0;
        const h = H + (hot ? lift : 0);
        ctx.shape(
          "round-rectangle",
          x,
          cardY,
          W,
          h,
          hot
            ? { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 3, roughness: ctx.preset.roughness, roundness: 14 }
            : { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 1.8, roughness: ctx.preset.roughness, roundness: 14 },
          { id: ctx.uid(tier.id) },
        );
        if (hot) {
          // "most popular" ribbon pill over the top edge
          const bw = 118;
          ctx.shape("pill", x + W / 2 - bw / 2, cardY - 15, bw, 30, { stroke: role.color, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: ctx.preset.roughness });
          ctx.label(String(tier.opts.badge ?? "Popular"), x + W / 2, cardY, { size: 14, color: role.textColor, weight: 700 });
        }
        const cx = x + W / 2;
        ctx.label(tier.label, cx, y + 40, { size: 20, color: hot ? role.color : ctx.ink, weight: 700, font: "heading" });
        if (tier.value !== undefined && ctx.showValue(tier)) {
          ctx.label(`${currency}${fmtNum(tier.value)}`, cx - 4, y + 78, { size: 34, color: ctx.ink, weight: 700, font: "heading", role: "value" });
          const pw = ctx.measure(`${currency}${fmtNum(tier.value)}`, 34, "heading");
          ctx.label(period, cx + pw / 2 + 4, y + 86, { size: 14, color: ctx.mutedInk, align: "left", role: "value" });
        } else if (tier.detail) {
          ctx.label(ctx.wrap(tier.detail, W - 30, 15, "body", 2), cx, y + 78, { size: 15, color: ctx.mutedInk, role: "detail" });
        }
        ctx.line([[x + 18, y + headH - 12], [x + W - 18, y + headH - 12]], { color: ctx.mutedInk, width: 1.2 });
        tier.children.forEach((f, fi) => {
          const fy = y + headH + 8 + fi * 30;
          ctx.icon(f.icon ?? "check", x + 28, fy, 17, role.color);
          ctx.label(ctx.wrap(f.label, W - 66, 15, "body", 1), x + 44, fy, { size: 15, color: ctx.ink, align: "left" });
        });
      }),
    );
  },
});
