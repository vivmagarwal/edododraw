/**
 * Frameworks & metaphors, round 3 (viz roadmap tier 3, 2026-07):
 * business-model-canvas, ecosystem, swimlane-flow, bullet-chart,
 * domino, lighthouse, magnet.
 * See design-notes/viz-roadmap-2026-07.md for the selection rationale.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { fmtNum, polar, rad, radialLabel } from "./util.js";

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
        const R = 128 + ri * 92;
        // dashed orbit + ring name sitting on it (upper left, cleared)
        const orbit: Array<[number, number]> = [];
        for (let a = 0; a <= 72; a++) orbit.push(polar(0, 0, R, (a * 360) / 72));
        ctx.poly(orbit, { stroke: ctx.mutedInk, fill: null, fillStyle: "none", strokeWidth: 1.2, strokeStyle: "dashed", roughness: ctx.preset.roughness });

        // members spaced around the orbit, staggered per ring; the ring name
        // takes the mid-gap slot before the first member so it never hits a chip
        const k = ring.children.length;
        radialLabel(ctx, 0, 0, R + 2, -90 + ri * 45 - 180 / k, ring.label, undefined, role.color, { gap: 4, size: 14 });
        ring.children.forEach((m, mi) => {
          const deg = -90 + ri * 45 + (mi * 360) / k;
          const [px, py] = polar(0, 0, R, deg);
          ctx.shape("circle", px - 27, py - 27, 54, 54, { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 1.8, roughness: ctx.preset.roughness }, { id: ctx.uid(m.id) });
          if (m.icon) ctx.icon(m.icon, px, py, 24, role.color);
          else ctx.label(m.label.slice(0, 2), px, py, { size: 16, color: role.color, weight: 700, font: "heading" });
          // outermost ring: name pushed radially outward (free space there);
          // inner rings: name beneath the chip so it can't hit outer chips
          if (ri === nR - 1) radialLabel(ctx, px, py, 29, deg, m.label, undefined, ctx.ink, { maxW: 110, gap: 6, size: 13 });
          else ctx.label(ctx.wrap(m.label, 100, 13, "body", 2), px, py + 40, { size: 13, color: ctx.ink, vAnchor: "top" });
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
        ctx.label(ctx.wrap(s.label, boxW - 24 - (s.icon ? 20 : 0), 14, "heading", 2), x + boxW / 2 + (s.icon ? 11 : 0), cy, { size: 14, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        if (s.icon) ctx.icon(s.icon, x + 18, cy, 18, role.textColor);
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
    { name: "max", type: "number", description: "scale ceiling (default: largest value/target)" },
    { name: "showValues", type: "boolean", description: "print actual values (default true)" },
  ],
  sweetSpot: { min: 2, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const rows = itemsOf(spec, "item", "kpi");
    const n = Math.max(rows.length, 1);
    const trackW = 330;
    const rowH = 62;
    const labelW = 22 + Math.max(80, ...rows.map((r) => ctx.measure(r.label, 16)));
    const max = optNum(spec.options, "max") ?? Math.max(1, ...rows.flatMap((r) => [r.values[0] ?? 0, r.values[1] ?? (typeof r.opts.target === "number" ? r.opts.target : 0)])) * 1.08;

    rows.forEach((row, i) =>
      ctx.item(row.id, () => {
        const role = ctx.role(i, { n, color: row.color });
        const cy = i * rowH + rowH / 2;
        const actual = row.values[0] ?? 0;
        const target = row.values[1] ?? (typeof row.opts.target === "number" ? row.opts.target : undefined);
        ctx.label(row.label, labelW - 14, cy, { size: 16, color: ctx.ink, align: "right" });
        // qualitative band + actual bar + target tick
        ctx.shape("rectangle", labelW, cy - 13, trackW, 26, { stroke: ctx.mutedInk, fill: role.softFill, fillStyle: "solid", strokeWidth: 1.2, roughness: ctx.preset.roughness, opacity: 60 });
        ctx.shape("rectangle", labelW, cy - 6, Math.max(6, (trackW * Math.min(actual, max)) / max), 12, { stroke: role.color, fill: role.fill ?? role.color, fillStyle: "solid", strokeWidth: 1, roughness: ctx.preset.roughness }, { id: ctx.uid(row.id) });
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
    const tileW = 30;
    const tileH = 118;
    const pitch = 96;
    const groundY = 0;

    // ground
    ctx.line([[-58, groundY], [(n - 1) * pitch + tileW + 58, groundY]], { color: ctx.ink, width: 2.4 });
    // the push that started it
    ctx.arrow(-52, -tileH - 26, -6, -tileH + 4, { color: ctx.ink, width: 2.2 });

    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const x = i * pitch;
        // fallen hardest at the trigger, upright by the end of the chain
        const tip = Math.max(0, 62 - i * (62 / Math.max(n - 1.4, 1)));
        const corners: Array<[number, number]> = [
          [x, groundY - tileH],
          [x + tileW, groundY - tileH],
          [x + tileW, groundY],
          [x, groundY],
        ];
        const pts = tip > 0 ? rot(corners, x + tileW, groundY, tip) : corners;
        ctx.poly(pts, role, { id: ctx.uid(item.id) });
        // a pip near the tile top so it reads as a domino
        const [px, py] = tip > 0 ? rot([[x + tileW / 2, groundY - tileH + 22]], x + tileW, groundY, tip)[0] : [x + tileW / 2, groundY - tileH + 22];
        ctx.shape("circle", px - 4, py - 4, 8, 8, { stroke: role.textColor, fill: role.textColor, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 });
        // label below the slot, two-row stagger
        const row = i % 2;
        ctx.labelBlock(item.label, item.detail, x + tileW / 2 + 8, groundY + 26 + row * 62, { color: role.color, align: "center", maxW: 150, vAnchor: "top" });
        if (row) ctx.line([[x + tileW / 2 + 8, groundY + 6], [x + tileW / 2 + 8, groundY + 22 + 62]], { color: ctx.preset.edge, width: 1.2, dotted: true });
        if (item.icon) {
          const [ix, iy] = tip > 0 ? rot([[x + tileW / 2, groundY - tileH - 24]], x + tileW, groundY, tip)[0] : [x + tileW / 2, groundY - tileH - 24];
          ctx.icon(item.icon, ix, iy, 24, role.color);
        }
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

    // tower on its rock base
    ctx.poly(
      [
        [10, waterY],
        [36, waterY - 34],
        [86, waterY - 44],
        [142, waterY - 30],
        [168, waterY],
      ],
      { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.2, roughness: ctx.preset.roughness },
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
    for (const ty of [waterY - 78, waterY - 116] as number[]) ctx.line([[70 + (waterY - 40 - ty) * -0.085, ty], [112 + (waterY - 40 - ty) * 0.085, ty]], { color: ctx.mutedInk, width: 1.6 });
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
    // the beam: a soft wedge sweeping right over the water
    ctx.poly(
      [
        [110, 62],
        [W - 40, 128],
        [W - 40, waterY - 14],
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
    for (let x = 150; x <= W; x += 14) wl.push([x, waterY + Math.sin(x / 26) * 4]);
    ctx.line(wl, { color: ctx.mutedInk, width: 1.8 });

    // rocks (the risks) poking above the water, labels below on leaders
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i + 1, { n: n + 1, color: item.color });
        const rx = 232 + (i * (W - 320)) / Math.max(n - 0.4, 1);
        const rw = 46 + (i % 2) * 12;
        ctx.poly(
          [
            [rx, waterY + 4],
            [rx + rw * 0.22, waterY - 20 - (i % 2) * 8],
            [rx + rw * 0.55, waterY - 9],
            [rx + rw * 0.8, waterY - 24],
            [rx + rw, waterY + 4],
          ],
          { stroke: role.color, fill: null, fillStyle: "none", strokeWidth: 2.2, roughness: ctx.preset.roughness },
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
    const sx = W - 66;
    ctx.poly(
      [
        [sx - 40, waterY - 6],
        [sx + 40, waterY - 6],
        [sx + 26, waterY + 16],
        [sx - 26, waterY + 16],
      ],
      { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.2, roughness: ctx.preset.roughness },
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
        const px = legX + 176 + Math.abs(spread) * 66 + (i % 2) * 30;
        const py = cy + spread * 96;
        const text = ctx.wrap(item.label, 150, 15, "heading", 2);
        const tw = Math.max(...text.split("\n").map((l) => ctx.measure(l, 15, "heading")));
        const w = tw + 34 + (item.icon ? 22 : 0);
        const h = text.includes("\n") ? 54 : 38;
        ctx.shape("pill", px, py - h / 2, w, h, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, px + 20, py, 18, role.textColor);
        ctx.label(text, px + w / 2 + (item.icon ? 9 : 0), py, { size: 15, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        // motion streaks: being pulled toward the poles
        ctx.line([[px - 30, py - 6], [px - 8, py - 6]], { color: ctx.mutedInk, width: 1.6 });
        ctx.line([[px - 24, py + 7], [px - 5, py + 7]], { color: ctx.mutedInk, width: 1.6 });
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
