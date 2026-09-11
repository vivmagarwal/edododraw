/**
 * Frameworks & metaphors, round 3 (viz roadmap tier 3, 2026-07):
 * business-model-canvas, ecosystem, swimlane-flow, bullet-chart,
 * domino, lighthouse, magnet.
 * See design-notes/viz-roadmap-2026-07.md for the selection rationale.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { mix } from "../../style/color.js";
import { fmtNum, polar, rad, radialLabel, smoothShape } from "./util.js";

/** Rotate points around (cx, cy) by deg (screen coords: positive = clockwise). */
function rot(pts: Array<[number, number]>, cx: number, cy: number, deg: number): Array<[number, number]> {
  const a = rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

// ---- business-model-canvas -------------------------------------------------------

const BMC_CELLS: Array<{ keys: string[]; title: string; icon: string }> = [
  { keys: ["partners", "key-partners"], title: "Key Partners", icon: "handshake" },
  { keys: ["activities", "key-activities"], title: "Key Activities", icon: "gear" },
  { keys: ["resources", "key-resources"], title: "Key Resources", icon: "key" },
  { keys: ["value", "value-proposition", "value-prop"], title: "Value Proposition", icon: "diamond" },
  { keys: ["relationships", "customer-relationships"], title: "Customer Relationships", icon: "heart" },
  { keys: ["channels"], title: "Channels", icon: "megaphone" },
  { keys: ["segments", "customers", "customer-segments"], title: "Customer Segments", icon: "users" },
  { keys: ["costs", "cost", "cost-structure"], title: "Cost Structure", icon: "chart" },
  { keys: ["revenue", "revenue-streams", "income"], title: "Revenue Streams", icon: "dollar" },
];

registerViz({
  name: "business-model-canvas",
  category: "Business Frameworks",
  summary: "The classic 9-box BMC grid, sections filled with bullet lists.",
  entryKinds: ["partners", "activities", "resources", "value", "relationships", "channels", "segments", "costs", "revenue", "item"],
  sweetSpot: { min: 5, max: 9 },
  generate(spec: VizSpec, ctx: VizContext) {
    // sections match by kind name; plain `item`s fill remaining cells in order
    const generics = itemsOf(spec, "item", "section");
    let g = 0;
    const sections: Array<VizItem | undefined> = BMC_CELLS.map((cell) => {
      const byKind = spec.items.find((i) => cell.keys.includes(i.kind));
      return byKind ?? generics[g++];
    });

    const colW = 176;
    const topH = 300;
    const botH = 104;
    const W = colW * 5;
    // cell frames: [x, y, w, h] per canonical cell
    const frames: Array<[number, number, number, number]> = [
      [0, 0, colW, topH],
      [colW, 0, colW, topH / 2],
      [colW, topH / 2, colW, topH / 2],
      [colW * 2, 0, colW, topH],
      [colW * 3, 0, colW, topH / 2],
      [colW * 3, topH / 2, colW, topH / 2],
      [colW * 4, 0, colW, topH],
      [0, topH, W / 2, botH],
      [W / 2, topH, W / 2, botH],
    ];

    frames.forEach(([x, y, w, h], ci) => {
      const cell = BMC_CELLS[ci];
      const section = sections[ci];
      const role = ctx.role(ci, { n: 9, color: section?.color });
      const draw = () => {
        ctx.shape("rectangle", x, y, w, h, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 1.8, roughness: ctx.preset.roughness }, { id: ctx.uid(section?.id ?? cell.keys[0]) });
        const title = section?.label || cell.title;
        ctx.label(ctx.wrap(title, w - 52, 15, "heading", 2), x + 12, y + 20, { size: 15, color: role.color, weight: 700, font: "heading", align: "left", vAnchor: "top" });
        ctx.icon(section?.icon ?? cell.icon, x + w - 20, y + 20, 18, role.color);
        const bullets = section?.children ?? [];
        let by = y + 52 + (ctx.wrap(title, w - 52, 15, "heading", 2).includes("\n") ? 16 : 0);
        for (const b of bullets) {
          if (by > y + h - 16) break; // never overflow the cell
          const text = ctx.wrap(b.label, w - 40, 13, "body", 2);
          const lines = text.split("\n").length;
          ctx.shape("circle", x + 14, by - 3, 6, 6, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 });
          ctx.label(text, x + 27, by + (lines - 1) * 8, { size: 13, color: ctx.ink, align: "left" });
          by += lines * 17 + 8;
        }
      };
      if (section) ctx.item(section.id, draw);
      else draw();
    });
  },
});

// ---- ecosystem ---------------------------------------------------------------------

registerViz({
  name: "ecosystem",
  category: "Business Frameworks",
  summary: "Concentric stakeholder orbits around one center.",
  entryKinds: ["center", "ring", "orbit", "item"],
  sweetSpot: { min: 2, max: 3 },
  generate(spec: VizSpec, ctx: VizContext) {
    const center = spec.items.find((i) => i.kind === "center");
    const rings = itemsOf(spec, "ring", "orbit", "item").filter((r) => r.children.length);
    const nR = Math.max(rings.length, 1);

    // center chip
    const cRole = ctx.role(0, { neutral: true });
    const drawCenter = () => {
      ctx.shape("circle", -46, -46, 92, 92, cRole, { id: ctx.uid(center?.id ?? "center") });
      if (center?.icon) {
        ctx.icon(center.icon, 0, -18, 28, cRole.textColor);
        ctx.label(ctx.wrap(center.label, 80, 15, "heading", 2), 0, 16, { size: 15, color: cRole.textColor, weight: 700, font: "heading" });
      } else {
        ctx.label(ctx.wrap(center?.label ?? spec.title ?? "Core", 80, 16, "heading", 3), 0, 0, { size: 16, color: cRole.textColor, weight: 700, font: "heading" });
      }
    };
    if (center) ctx.item(center.id, drawCenter);
    else drawCenter();
    if (!center && spec.title) ctx.titleHandled = true;

    rings.forEach((ring, ri) =>
      ctx.item(ring.id, () => {
        const role = ctx.role(ri, { n: nR, color: ring.color });
        // elliptical orbits use the wide band (circles left a square card)
        const Rx = 200 + ri * 140;
        const Ry = 124 + ri * 72;
        const at = (deg: number): [number, number] => [Math.cos(rad(deg)) * Rx, Math.sin(rad(deg)) * Ry];
        // the orbit's outward normal at a point: labels go ACROSS the orbit, never along it
        const normal = (deg: number): number => (Math.atan2(Math.sin(rad(deg)) / Ry, Math.cos(rad(deg)) / Rx) * 180) / Math.PI;
        // dashed orbit + ring name sitting on it (upper left, cleared)
        const orbit: Array<[number, number]> = [];
        for (let a = 0; a <= 72; a++) orbit.push(at((a * 360) / 72));
        ctx.poly(orbit, { stroke: ctx.mutedInk, fill: null, fillStyle: "none", strokeWidth: 1.2, strokeStyle: "dashed", roughness: ctx.preset.roughness });

        // members spaced around the orbit, staggered per ring; the ring name
        // takes the mid-gap slot before the first member so it never hits a chip
        const k = ring.children.length;
        const nameDeg = -90 + ri * 45 - 180 / k;
        const [nx, ny] = at(nameDeg);
        radialLabel(ctx, nx, ny, 2, normal(nameDeg), ring.label, undefined, role.color, { gap: 4, size: 15 });
        ring.children.forEach((m, mi) => {
          const deg = -90 + ri * 45 + (mi * 360) / k;
          const [px, py] = at(deg);
          ctx.shape("circle", px - 27, py - 27, 54, 54, { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 1.8, roughness: ctx.preset.roughness }, { id: ctx.uid(m.id) });
          if (m.icon) ctx.icon(m.icon, px, py, 24, role.color);
          else ctx.label(m.label.slice(0, 2), px, py, { size: 16, color: role.color, weight: 700, font: "heading" });
          // a member's name goes across the orbit, never along it (the dashes
          // ran through names placed under the chip): outward on the outermost
          // ring, inward — toward the free space round the core — on inner ones
          const nd = normal(deg);
          radialLabel(ctx, px, py, 29, ri === nR - 1 ? nd : nd + 180, m.label, undefined, ctx.ink, { maxW: ri === nR - 1 ? 130 : 104, gap: 6, size: 15 });
        });
      }),
    );
  },
});

// ---- swimlane-flow --------------------------------------------------------------------

registerViz({
  name: "swimlane-flow",
  category: "Process",
  summary: "A flowchart over responsibility lanes — who does what, in order.",
  entryKinds: ["lane", "step", "item"],
  sweetSpot: { min: 2, max: 4 },
  generate(spec: VizSpec, ctx: VizContext) {
    const lanes = itemsOf(spec, "lane", "item").filter((l) => l.children.length);
    if (!lanes.length) return;
    // steps take a GLOBAL sequence: an explicit number (`step "X" 2`) wins,
    // otherwise source order
    let seq = 0;
    const steps = lanes.flatMap((lane, li) => lane.children.map((s) => ({ s, li, order: s.value ?? seq++ }))).sort((a, b) => a.order - b.order);
    const nSteps = steps.length;

    const laneH = 104;
    const boxW = 148;
    const boxH = 58;
    const pitch = boxW + 46;
    const labelW = 28 + Math.max(84, ...lanes.map((l) => ctx.measure(ctx.wrap(l.label, 110, 16, "heading", 2).split("\n")[0], 16, "heading")));
    const W = labelW + nSteps * pitch + 20;

    // lane bands
    lanes.forEach((lane, li) => {
      const y = li * laneH;
      ctx.item(lane.id, () => {
        ctx.line([[0, y], [W, y]], { color: ctx.mutedInk, width: li === 0 ? 2 : 1.4 });
        const role = ctx.role(li, { n: lanes.length, color: lane.color });
        if (lane.icon) ctx.icon(lane.icon, 16, y + laneH / 2 - 16, 22, role.color);
        ctx.label(ctx.wrap(lane.label, labelW - 34, 16, "heading", 2), 4, y + laneH / 2 + (lane.icon ? 14 : 0), { size: 16, color: role.color, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" });
      });
    });
    ctx.line([[0, lanes.length * laneH], [W, lanes.length * laneH]], { color: ctx.mutedInk, width: 2 });
    ctx.line([[labelW - 10, 0], [labelW - 10, lanes.length * laneH]], { color: ctx.mutedInk, width: 1.2, dash: true });

    // steps in sequence, elbow arrows crossing lanes
    const posOf = (k: number): [number, number] => [labelW + steps[k].order * pitch + 10, steps[k].li * laneH + laneH / 2];
    steps.forEach(({ s, li }, k) => {
      const [x, cy] = posOf(k);
      const role = ctx.role(li, { n: lanes.length, color: s.color ?? lanes[li].color });
      ctx.item(s.id, () => {
        ctx.shape("round-rectangle", x, cy - boxH / 2, boxW, boxH, role, { id: ctx.uid(s.id) });
        // icon + text centred as ONE group (an icon pinned to the box's left
        // edge with the text centred in the rest read as two separate marks)
        const textOpts = { size: 14, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" };
        if (s.icon) {
          const text = ctx.wrap(s.label, boxW - 48, 14, "heading", 2);
          const textW = Math.max(...text.split("\n").map((l) => ctx.measure(l, 14, "heading")));
          const iconS = 18;
          const start = x + boxW / 2 - (iconS + 8 + textW) / 2;
          ctx.icon(s.icon, start + iconS / 2, cy, iconS, role.textColor);
          ctx.label(text, start + iconS + 8, cy, { ...textOpts, align: "left" });
        } else {
          ctx.label(ctx.wrap(s.label, boxW - 24, 14, "heading", 2), x + boxW / 2, cy, textOpts);
        }
        if (k < nSteps - 1) {
          const [nx, ny] = posOf(k + 1);
          if (ny === cy) {
            ctx.arrow(x + boxW, cy, nx - 6, cy, { color: ctx.preset.edge, width: 1.8 });
          } else {
            const mx = (x + boxW + nx) / 2;
            ctx.line(
              [
                [x + boxW, cy],
                [mx, cy],
                [mx, ny],
                [nx - 6, ny],
              ],
              { color: ctx.preset.edge, width: 1.8, arrow: true },
            );
          }
        }
      });
    });
  },
});

// ---- bullet-chart ------------------------------------------------------------------

registerViz({
  name: "bullet-chart",
  category: "Data",
  summary: "KPI rows — actual bar vs a target tick over a qualitative band.",
  entryKinds: ["item", "kpi"],
  options: [
    { name: "max", type: "number", description: "one scale ceiling for every row (default: each row scales to its own max(actual, target) × 1.15; a row's own `max:` wins over both)" },
    { name: "showValues", type: "boolean", description: "print actual values (default true)" },
  ],
  sweetSpot: { min: 2, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const rows = itemsOf(spec, "item", "kpi");
    const n = Math.max(rows.length, 1);
    const trackW = 330;
    const rowH = 62;
    const labelW = 22 + Math.max(80, ...rows.map((r) => ctx.measure(r.label, 16)));
    const sharedMax = optNum(spec.options, "max");

    rows.forEach((row, i) =>
      ctx.item(row.id, () => {
        const role = ctx.role(i, { n, color: row.color });
        const cy = i * rowH + rowH / 2;
        const actual = row.values[0] ?? 0;
        const target = row.values[1] ?? (typeof row.opts.target === "number" ? row.opts.target : undefined);
        // KPIs come in different units, so each row reads against ITS OWN
        // target: one shared axis made 6 hires of 10 a sliver beside 99.9% uptime
        const rowOwn = typeof row.opts.max === "number" && row.opts.max > 0 ? row.opts.max : undefined;
        const max = rowOwn ?? sharedMax ?? Math.max(1e-9, actual, target ?? 0) * 1.15;
        ctx.label(row.label, labelW - 14, cy, { size: 16, color: ctx.ink, align: "right" });
        // qualitative band (a quiet wash, no outline) + the measure as the one
        // solid bar in the hue + the ink target tick as the only dark mark
        const band = mix(ctx.preset.background, role.color, 0.16);
        ctx.shape("rectangle", labelW, cy - 13, trackW, 26, { stroke: "none", fill: band, fillStyle: "solid", strokeWidth: 0, roughness: ctx.preset.roughness }, { style: { roundness: 6 } });
        ctx.shape("rectangle", labelW, cy - 8, Math.max(8, (trackW * Math.min(actual, max)) / max), 16, { stroke: "none", fill: role.color, fillStyle: "solid", strokeWidth: 0, roughness: ctx.preset.roughness }, { id: ctx.uid(row.id), style: { roundness: 6 } });
        if (target !== undefined) {
          const tx = labelW + (trackW * Math.min(target, max)) / max;
          ctx.line([[tx, cy - 19], [tx, cy + 19]], { color: ctx.ink, width: 2.6 });
        }
        if (ctx.showValue(row)) {
          const txt = fmtNum(actual) + (target !== undefined ? ` / ${fmtNum(target)}` : "");
          ctx.label(txt, labelW + trackW + 14, cy, { size: 15, color: role.color, weight: 700, font: "heading", align: "left", role: "value" });
        }
      }),
    );
  },
});

// ---- domino ------------------------------------------------------------------------

registerViz({
  name: "domino",
  category: "Cause and Effect",
  summary: "A chain reaction — tiles toppling left to right into the outcome.",
  entryKinds: ["item", "cause", "step"],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "cause", "step");
    const n = Math.max(items.length, 1);
    const groundY = 0;
    // One row of labels, each under its own tile: the pitch is set by the
    // widest label, and the tile scales WITH the pitch — domino proportions
    // (1:2) and a gap of 0.3 × its height, which is what lets every tile rest
    // on the next at a lean that decays to upright along the chain.
    const pitch = Math.max(176, ...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: 200 }).w + 26));
    const tileH = pitch / 0.8;
    const tileW = tileH / 2;

    // Lean of each tile, solved from the end: the outcome stands upright and
    // each earlier tile leans exactly far enough for its top corner to rest on
    // the next tile's face — touching, never overlapping.
    const tips: number[] = new Array(n).fill(0);
    for (let i = n - 2; i >= 0; i--) {
      const phi = rad(tips[i + 1]);
      const x = i * pitch;
      const px2 = x + pitch + tileW; // next tile's pivot
      const bx = px2 - tileW * Math.cos(phi);
      const by = groundY - tileW * Math.sin(phi);
      const dx = Math.sin(phi);
      const dy = -Math.cos(phi);
      const side = (deg: number): number => {
        const cxr = x + tileW + tileH * Math.sin(rad(deg));
        const cyr = groundY - tileH * Math.cos(rad(deg));
        return (cxr - bx) * dy - (cyr - by) * dx;
      };
      let lo = 0;
      let hi = 80;
      if (Math.sign(side(lo)) === Math.sign(side(hi))) {
        tips[i] = 0;
        continue;
      }
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(side(mid)) === Math.sign(side(lo))) lo = mid;
        else hi = mid;
      }
      tips[i] = lo;
    }
    const place = (i: number, pts: Array<[number, number]>) => (tips[i] > 0 ? rot(pts, i * pitch + tileW, groundY, tips[i]) : pts);

    // ground
    ctx.line([[-58, groundY], [(n - 1) * pitch + tileW + 58, groundY]], { color: ctx.ink, width: 2.4 });
    // the push that started it: square to tile 0's back face, at 72% of its height
    {
      const a = rad(tips[0]);
      const nx = -Math.cos(a);
      const ny = -Math.sin(a);
      const [fx, fy] = place(0, [[0, groundY - tileH * 0.72]])[0];
      ctx.arrow(fx + nx * 64, fy + ny * 64, fx + nx * 10, fy + ny * 10, { color: ctx.ink, width: 2.2 });
    }

    // pip layouts for one half of a face, in units of the pip spacing
    const PIPS: Array<Array<[number, number]>> = [
      [[0, 0]],
      [
        [-1, -1],
        [1, 1],
      ],
      [
        [-1, -1],
        [0, 0],
        [1, 1],
      ],
    ];
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const x = i * pitch;
        const corners: Array<[number, number]> = [
          [x, groundY - tileH],
          [x + tileW, groundY - tileH],
          [x + tileW, groundY],
          [x, groundY],
        ];
        ctx.poly(place(i, corners), role, { id: ctx.uid(item.id) });
        // a domino FACE: a divider across the middle and pips in each half
        const divider = place(i, [
          [x + tileW * 0.14, groundY - tileH / 2],
          [x + tileW * 0.86, groundY - tileH / 2],
        ]);
        ctx.line(divider, { color: role.color, width: 1.6 });
        const d = tileW * 0.24;
        const pr = Math.max(4, tileW * 0.065);
        const half = (cyLocal: number, count: number) => {
          for (const [ox, oy] of PIPS[(count - 1) % 3]) {
            const [px, py] = place(i, [[x + tileW / 2 + ox * d, cyLocal + oy * d]])[0];
            ctx.shape("circle", px - pr, py - pr, pr * 2, pr * 2, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 });
          }
        };
        const [tcx, tcy] = place(i, [[x + tileW / 2, groundY - (tileH * 3) / 4]])[0];
        if (item.icon) ctx.icon(item.icon, tcx, tcy, tileW * 0.5, role.color);
        else half(groundY - (tileH * 3) / 4, (i % 3) + 1);
        half(groundY - tileH / 4, ((i + 1) % 3) + 1);
        // one row of labels, each under its own tile's base (the midpoint of
        // the tipped base, so a leaning tile's label follows it a little)
        const baseMid = x + tileW - (tileW / 2) * Math.cos(rad(tips[i]));
        ctx.labelBlock(item.label, item.detail, baseMid, groundY + 22, { color: role.color, align: "center", maxW: pitch - 26, vAnchor: "top" });
      }),
    );
  },
});

// ---- lighthouse ----------------------------------------------------------------------

registerViz({
  name: "lighthouse",
  category: "Visual Metaphors",
  summary: "A lighthouse beam sweeping over labeled rocks — guidance past the risks.",
  entryKinds: ["item", "rock", "risk"],
  options: [{ name: "ship", type: "string", description: "label under the ship sailing past" }],
  sweetSpot: { min: 2, max: 4 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "rock", "risk");
    const n = Math.max(items.length, 1);
    const waterY = 226;
    const W = 700;

    // tower on its rock base: the base's top runs flat under the tower's foot,
    // so the two share one edge (an apex there crossed the tower's bottom line)
    ctx.poly(
      [
        [10, waterY],
        [36, waterY - 34],
        [62, waterY - 40],
        [120, waterY - 40],
        [142, waterY - 30],
        [168, waterY],
      ],
      { stroke: ctx.ink, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2.2, roughness: ctx.preset.roughness },
    );
    const beamRole = ctx.role(0, { n: 1 });
    ctx.poly(
      [
        [66, waterY - 40],
        [78, 84],
        [104, 84],
        [116, waterY - 40],
      ],
      { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.2, roughness: ctx.preset.roughness },
      { id: ctx.uid("tower") },
    );
    // bands follow the tower's own taper (66→78 on the left, 116→104 on the
    // right over its 102-unit height), inset so they sit inside the silhouette
    for (const ty of [waterY - 78, waterY - 116] as number[]) {
      const k = (waterY - 40 - ty) / 102;
      ctx.line([[66 + k * 12 + 3, ty], [116 - k * 12 - 3, ty]], { color: ctx.mutedInk, width: 1.6 });
    }
    // lamp room + roof
    ctx.shape("rectangle", 74, 56, 34, 28, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2, roughness: ctx.preset.roughness });
    ctx.poly(
      [
        [70, 56],
        [91, 36],
        [112, 56],
      ],
      { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2, roughness: ctx.preset.roughness },
    );
    // the ship sails past beyond the rocks; the beam lights the rocks and stops
    // short of it (its far edge used to run through the ship and its label)
    const sx = W - 66;
    const beamEnd = sx - 58;
    // the beam: a soft wedge sweeping right over the water
    ctx.poly(
      [
        [110, 62],
        [beamEnd, 62 + (beamEnd - 110) * (66 / (W - 150))],
        [beamEnd, 82 + (beamEnd - 112) * ((waterY - 96) / (W - 152))],
        [112, 82],
      ],
      { stroke: ctx.mutedInk, fill: beamRole.softFill, fillStyle: "solid", strokeWidth: 1.1, roughness: ctx.preset.roughness, opacity: 62 },
    );
    for (const [dx, dy] of [
      [-20, -14],
      [0, -22],
      [20, -14],
    ] as Array<[number, number]>) {
      ctx.line([[91 + dx * 0.5, 40 + dy * 0.5], [91 + dx, 40 + dy]], { color: ctx.ink, width: 1.8 });
    }

    // water line
    const wl: Array<[number, number]> = [];
    // (it meets the shore at the base's corner instead of crossing it; the
    // rocks and hull are filled and drawn after it, so it runs BEHIND them)
    for (let x = 168; x <= W; x += 14) wl.push([x, waterY + Math.sin(x / 26) * 4]);
    ctx.line(wl, { color: ctx.mutedInk, width: 1.8 });

    // rocks (the risks) poking above the water, labels below on leaders:
    // filled boulders with a rounded crown (a zig-zag read as a crown or an M)
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i + 1, { n: n + 1, color: item.color });
        const rx = 232 + (i * (W - 320)) / Math.max(n - 0.4, 1);
        const rw = 60 + (i % 2) * 12;
        const lift = (i % 2) * 6;
        // one lopsided boulder, its shoulder off-centre, sitting in the water
        smoothShape(
          ctx,
          [
            [rx, waterY + 6],
            [rx + rw * 0.1, waterY - 12],
            [rx + rw * 0.36, waterY - 30 - lift],
            [rx + rw * 0.66, waterY - 25 - lift],
            [rx + rw * 0.9, waterY - 9],
            [rx + rw, waterY + 6],
            [rx + rw * 0.5, waterY + 10],
          ],
          { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 2.2, roughness: ctx.preset.roughness },
          { id: ctx.uid(item.id) },
        );
        const row = i % 2;
        const ly = waterY + 40 + row * 60;
        ctx.line([[rx + rw / 2, waterY + 8], [rx + rw / 2, ly - 6]], { color: ctx.preset.edge, width: 1.2, dotted: true });
        ctx.labelBlock(item.label, item.detail, rx + rw / 2, ly, { color: role.color, align: "center", maxW: 150, vAnchor: "top" });
      }),
    );

    // ship sailing past, beyond the rocks
    const shipLabel = optStr(spec.options, "ship");
    ctx.poly(
      [
        [sx - 40, waterY - 6],
        [sx + 40, waterY - 6],
        [sx + 26, waterY + 16],
        [sx - 26, waterY + 16],
      ],
      // an opaque hull: the waterline must not show through the boat
      { stroke: ctx.ink, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2.2, roughness: ctx.preset.roughness },
    );
    ctx.line([[sx, waterY - 6], [sx, waterY - 58]], { color: ctx.ink, width: 2 });
    ctx.poly(
      [
        [sx, waterY - 58],
        [sx + 34, waterY - 22],
        [sx, waterY - 22],
      ],
      { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2, roughness: ctx.preset.roughness },
    );
    if (shipLabel) ctx.label(shipLabel, sx, waterY - 76, { size: 15, color: ctx.ink, weight: 700, font: "heading" });
  },
});

// ---- magnet ------------------------------------------------------------------------

registerViz({
  name: "magnet",
  category: "Visual Metaphors",
  summary: "A horseshoe magnet pulling item chips in — attraction and retention.",
  entryKinds: ["item"],
  options: [{ name: "label", type: "string", description: "caption under the magnet" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item");
    const n = Math.max(items.length, 1);
    const cx = 120;
    const cy = 150;
    const RO = 86;
    const RI = 40;
    const legX = cx + 96;

    // horseshoe body: outer boundary around the left, back along the inner
    const body: Array<[number, number]> = [[legX, cy - RO]];
    for (let a = -90; a <= 90; a += 6) body.push(polar(cx, cy, RO, 180 - a));
    body.push([legX, cy + RO], [legX, cy + RI]);
    for (let a = 90; a >= -90; a -= 6) body.push(polar(cx, cy, RI, 180 - a));
    body.push([legX, cy - RI]);
    ctx.poly(body, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.6, roughness: ctx.preset.roughness }, { id: ctx.uid("magnet") });
    // pole tips
    const pole = (py: number, ri: number): void => {
      const role = ctx.role(ri, { n: 2 });
      ctx.shape("rectangle", legX, py, 26, RO - RI, { stroke: role.stroke, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: 1.6, roughness: ctx.preset.roughness });
    };
    pole(cy - RO, 0);
    pole(cy + RI, 1);
    // field lines bowing out from pole to pole
    for (const k of [0, 1, 2]) {
      const bow = 66 + k * 44;
      ctx.line(quadPts([legX + 28, cy - (RO + RI) / 2], [legX + bow + 40, cy], [legX + 28, cy + (RO + RI) / 2]), { color: ctx.mutedInk, width: 1.2, dash: true });
    }
    const caption = optStr(spec.options, "label");
    if (caption) ctx.label(ctx.wrap(caption, 190, 16, "heading", 2), cx + 30, cy + RO + 36, { size: 16, color: ctx.ink, weight: 700, font: "heading" });

    // the attracted chips streaming in from the right
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const spread = (i - (n - 1) / 2) / Math.max((n - 1) / 2, 1); // -1..1
        // the magnet-facing edges sit on one clean arc opening toward the
        // poles (a parity jitter zig-zagged them), close in to the field lines
        const px = legX + 116 + spread * spread * 56;
        const py = cy + spread * 96;
        const text = ctx.wrap(item.label, 150, 15, "heading", 2);
        const tw = Math.max(...text.split("\n").map((l) => ctx.measure(l, 15, "heading")));
        const w = tw + 34 + (item.icon ? 22 : 0);
        const h = text.includes("\n") ? 54 : 38;
        ctx.shape("pill", px, py - h / 2, w, h, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, px + 20, py, 18, role.textColor);
        ctx.label(text, px + w / 2 + (item.icon ? 9 : 0), py, { size: 15, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        // motion streaks TRAIL the chip (on the side away from the magnet),
        // angled back along the pull: they say "moving toward the poles"
        ctx.line([[px + w + 8, py - 6], [px + w + 34, py - 6 + spread * 6]], { color: ctx.mutedInk, width: 1.6 });
        ctx.line([[px + w + 8, py + 7], [px + w + 30, py + 7 + spread * 6]], { color: ctx.mutedInk, width: 1.6 });
        if (item.detail) ctx.label(ctx.wrap(item.detail, 170, 13, "body", 2), px + w / 2, py + h / 2 + 16, { size: 13, color: ctx.mutedInk, role: "detail", vAnchor: "top" });
      }),
    );
  },
});

/** Sampled quadratic bezier as absolute points. */
function quadPts(p0: [number, number], c: [number, number], p1: [number, number], segs = 16): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}
