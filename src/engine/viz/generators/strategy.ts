/**
 * Strategy & planning visualizations (viz roadmap tier 1, 2026-07):
 * flywheel, radar, roadmap-lanes, milestone-path, value-chain, pricing-tiers.
 * See design-notes/viz-roadmap-2026-07.md for the selection rationale.
 */

import type { NodeStyle } from "../../scene/types.js";
import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { fmtNum, polar, radialLabel } from "./util.js";

function outline(ctx: VizContext, color: string, strokeWidth?: number): Partial<NodeStyle> {
  return { stroke: color, fill: null, fillStyle: "none", strokeWidth: strokeWidth ?? ctx.preset.strokeWidth, roughness: ctx.preset.roughness };
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
    const gapDeg = 18;
    const seg = 360 / n;
    const rMid = (R * (1 + inner)) / 2;

    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const start = -90 + i * seg + gapDeg / 2;
        const end = -90 + (i + 1) * seg - gapDeg / 2;
        ctx.shape(
          "sector",
          -R,
          -R,
          R * 2,
          R * 2,
          role,
          { id: ctx.uid(item.id), data: { start, end, inner } },
        );
        // arrowhead reaching into the gap — the wheel visibly spins clockwise
        const tip = polar(0, 0, rMid, end + 11);
        const baseO = polar(0, 0, R * 0.965, end + 0.5);
        const baseI = polar(0, 0, R * (inner + 0.035), end + 0.5);
        ctx.poly([baseO, tip, baseI], { stroke: role.stroke, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: ctx.preset.roughness });
        const mid = (start + end) / 2;
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

    // grid: spokes + two inner rings (dashed) + the outer ring (solid)
    for (let i = 0; i < K; i++) ctx.line([[0, 0], polar(0, 0, R, angle(i))], { color: ctx.mutedInk, width: 1.1 });
    for (const f of [1 / 3, 2 / 3]) ctx.poly(ringPts(f), { ...outline(ctx, ctx.mutedInk, 1.1), strokeStyle: "dashed" });
    ctx.poly(ringPts(1), outline(ctx, ctx.mutedInk, 1.6));

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
        ctx.poly(pts, { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 2.6, roughness: ctx.preset.roughness, opacity: 60 });
        for (const [px, py] of pts) ctx.shape("circle", px - 5, py - 5, 10, 10, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0.6 });
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
    const labelW = 24 + Math.max(90, ...lanes.map((l) => ctx.measure(l.label, 18, "heading")));
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
        ctx.label(ctx.wrap(lane.label, labelW - 44, 18, "heading", 2), lane.icon ? 34 : 4, top + h / 2, { size: 18, color: role.color, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" });
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

    // switchback trail, sampled smooth through fixed waypoints (start bottom-left)
    const way: Array<[number, number]> = [
      [10, 400],
      [210, 372],
      [330, 316],
      [176, 256],
      [66, 206],
      [210, 146],
      [352, 96],
      [452, 38],
    ];
    const pts = catmull(way, 14);
    ctx.line(pts, { color: ctx.ink, width: 2.6, dash: true });
    // ground hatch at the trailhead
    ctx.line([[-16, 406], [58, 406]], { color: ctx.ink, width: 2.2 });

    // summit flag (the goal)
    const [sx, sy] = pts[pts.length - 1];
    const gRole = ctx.role(n, { n: n + 1, color: goalEntry?.color });
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

    // milestones spaced by arc length; labels sit on the bend's outer side
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const total = cum[cum.length - 1];
    const at = (s: number): { p: [number, number]; i: number } => {
      const target = s * total;
      let i = cum.findIndex((c) => c >= target);
      if (i < 0) i = pts.length - 1;
      return { p: pts[i], i };
    };
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n: n + 1, color: item.color });
        const { p } = at((i + 1) / (n + 0.6));
        ctx.shape("circle", p[0] - 8, p[1] - 8, 16, 16, { stroke: role.stroke, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: 0.8 }, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, p[0], p[1] - 30, 26, role.color);
        const side = i % 2 === 0 ? 1 : -1; // alternate right/left of the trail
        const lx = p[0] + side * 26;
        ctx.labelBlock(item.label, item.detail, lx, p[1] + (item.icon ? 8 : 0), { color: role.color, align: side > 0 ? "left" : "right", maxW: 170 });
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
    const overlap = 26;
    const pitch = W - overlap;
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
        ctx.shape("chevron", x, 0, W, H, role, { id: ctx.uid(item.id), data: { dir: "right", notch: 0.16 } });
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
        const y = hot ? -lift : 0;
        const h = H + (hot ? lift * 2 : 0);
        ctx.shape(
          "round-rectangle",
          x,
          y,
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
          ctx.shape("pill", x + W / 2 - bw / 2, y - 15, bw, 30, { stroke: role.color, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: ctx.preset.roughness });
          ctx.label(String(tier.opts.badge ?? "Popular"), x + W / 2, y, { size: 14, color: role.textColor, weight: 700 });
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
