/**
 * Visual-metaphor and comparison visualizations: balance, podium, spectrum,
 * bridge/challenges, vision, hole, trend, race, dialogue, pillar, bottleneck,
 * iceberg. Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { RoleStyle } from "../../style/presets.js";
import { measureBlock } from "../text.js";
import { lerp } from "./util.js";

/** Stroke that stays visible when a preset outlines shapes in the canvas color. */
function roleStroke(ctx: VizContext, role: RoleStyle): string {
  return role.stroke === ctx.preset.background ? role.color : role.stroke;
}

/** Run `fn` under `item`'s tag scope when the entry exists (shared skeletons stay untagged). */
function scoped(ctx: VizContext, item: VizItem | undefined, fn: () => void): void {
  if (item) ctx.item(item.id, fn);
  else fn();
}

/** Deterministic jitter (stable re-renders — no Math.random). */
const jit = (i: number, amp: number): number => Math.sin(i * 7.3) * amp;

/** Small solid dot (leader-line ends, knobs). */
function dot(ctx: VizContext, x: number, y: number, d: number, color: string, z?: number): void {
  ctx.shape("circle", x - d / 2, y - d / 2, d, d, { stroke: color, fill: color, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 }, { z });
}

/** Sampled quadratic bezier as absolute points. */
function quad(p0: [number, number], c: [number, number], p1: [number, number], segs = 12): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}

// ---- balance ----------------------------------------------------------------

registerViz({
  name: "balance",
  aliases: ["scales"],
  category: "Comparison",
  summary: "A two-pan balance weighing two sides of item rows.",
  entryKinds: ["item", "side"],
  options: [{ name: "tilt", type: "left|right|level", description: "which side hangs lower (default level)" }],
  sweetSpot: { min: 2, max: 2 },
  generate(spec: VizSpec, ctx: VizContext) {
    const sides = itemsOf(spec, "item", "side").slice(0, 2);
    while (sides.length < 2) {
      sides.push({ kind: "side", id: `side${sides.length + 1}`, label: "", values: [], strings: [], opts: {}, children: [] });
    }
    const tilt = optStr(spec.options, "tilt") ?? "level";
    const cx = 260;
    const beamY = 190;
    const armSpan = 180;
    const plinthY = beamY + 86;
    // hatched plinth + triangle pedestal + fulcrum knob
    ctx.shape("rectangle", cx - 64, plinthY, 128, 16, { stroke: ctx.ink, fill: ctx.mutedInk, fillStyle: "hachure", strokeWidth: 2, roughness: ctx.preset.roughness });
    ctx.poly(
      [
        [cx - 42, plinthY],
        [cx + 42, plinthY],
        [cx, beamY + 6],
      ],
      ctx.role(0, { neutral: true }),
    );
    dot(ctx, cx, beamY, 24, ctx.ink, 2);
    sides.forEach((side, s) =>
      ctx.item(side.id, () => {
      const dir = s === 0 ? -1 : 1;
      const dy = tilt === "level" ? 0 : (tilt === "left") === (s === 0) ? 16 : -16;
      const role = ctx.role(s, { n: 2, color: side.color });
      const px = cx + dir * armSpan;
      const panY = beamY + 42 + dy;
      // yoke arm curving out + down from the fulcrum to above the pan
      ctx.line(quad([cx, beamY - 8], [cx + dir * armSpan * 0.55, beamY - 46 + dy * 0.5], [px, panY - 14]), { color: ctx.ink, width: 2.4 });
      // shallow dish pan (opens upward)
      const dish: Array<[number, number]> = [];
      for (let t = 0; t <= 12; t++) {
        const u = t / 12;
        dish.push([px - 44 + 88 * u, panY + Math.sin(Math.PI * u) * 16]);
      }
      ctx.line(dish, { color: roleStroke(ctx, role), width: 2.6, id: ctx.uid(side.id) });
      ctx.line(
        [
          [px, panY - 14],
          [px - 44, panY],
        ],
        { color: ctx.mutedInk, width: 1.4 },
      );
      ctx.line(
        [
          [px, panY - 14],
          [px + 44, panY],
        ],
        { color: ctx.mutedInk, width: 1.4 },
      );
      // item rows stacked above the pan
      side.children.forEach((row, j) => {
        const ry = panY - 34 - (side.children.length - 1 - j) * 40;
        const tw = ctx.measure(row.label, 18);
        const hasIcon = !!row.icon;
        const total = (hasIcon ? 36 : 18) + tw;
        const left = px - total / 2;
        if (hasIcon) ctx.icon(row.icon, left + 14, ry, 28, role.color);
        else dot(ctx, left + 5, ry, 10, role.color);
        ctx.label(row.label, left + (hasIcon ? 36 : 18), ry, { size: 18, color: ctx.ink, align: "left" });
      });
      // pan caption (side label) below the pan
      if (side.label) ctx.labelBlock(side.label, side.detail, px, panY + 34, { color: role.color, align: "center", maxW: 190, vAnchor: "top" });
      }),
    );
  },
});

// ---- podium -----------------------------------------------------------------

registerViz({
  name: "podium",
  category: "Comparison",
  summary: "Winners' podium — ranks 1-2-3 in the classic 2-1-3 arrangement.",
  entryKinds: ["item", "rank"],
  sweetSpot: { min: 3, max: 3 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "rank").slice(0, 3);
    const blockW = 150;
    const gap = 14;
    const base = 270;
    const heights = [176, 122, 74]; // by rank
    const cols = [1, 0, 2]; // column order left→right holds rank 2, 1, 3
    cols.forEach((rank, c) => {
      const item = items[rank];
      if (!item) return;
      ctx.item(item.id, () => {
      const role = ctx.role(rank, { n: 3, color: item.color });
      const stroke = roleStroke(ctx, role);
      const w = Math.min(2.6, role.strokeWidth);
      const x = c * (blockW + gap);
      const top = base - heights[rank];
      const bx = x + blockW / 2;
      // open stair-lip outline: curled tread + two risers (no bottom edge)
      ctx.line(
        [
          [x - 12, top + 9],
          [x - 12, top],
          [x + blockW + 12, top],
          [x + blockW + 12, top + 9],
        ],
        { color: stroke, width: w, id: ctx.uid(item.id) },
      );
      ctx.line(
        [
          [x, top],
          [x, base],
        ],
        { color: stroke, width: w },
      );
      ctx.line(
        [
          [x + blockW, top],
          [x + blockW, base],
        ],
        { color: stroke, width: w },
      );
      ctx.icon(item.icon ?? (rank === 0 ? "trophy" : "medal"), bx, top - 38, 46, role.color);
      ctx.label(String(rank + 1), bx, top + 26, { size: 30, color: role.color, weight: 700, font: "heading" });
      ctx.label(ctx.wrap(item.label, blockW - 18, 17, "body", 2), bx, top + 58, { size: 17, color: ctx.ink });
      });
    });
  },
});

// ---- spectrum ---------------------------------------------------------------

registerViz({
  name: "spectrum",
  category: "Comparison",
  summary: "Pole-to-pole horizontal spectrum of zones with arrow ends.",
  entryKinds: ["item", "zone"],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "zone");
    const n = Math.max(items.length, 1);
    const zoneW = 152;
    const zoneH = 94;
    const gap = 10;
    const aw = 40; // arrow-tail depth
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const x = i * (zoneW + gap);
      const first = i === 0;
      const last = i === items.length - 1;
      let iconCx = x + zoneW / 2;
      if (first && last) {
        // single zone: double-ended arrow bar
        ctx.poly(
          [
            [x + aw, 0],
            [x + zoneW - aw, 0],
            [x + zoneW, zoneH / 2],
            [x + zoneW - aw, zoneH],
            [x + aw, zoneH],
            [x, zoneH / 2],
          ],
          role,
          { id: ctx.uid(item.id) },
        );
      } else if (first) {
        ctx.poly(
          [
            [x + aw, 0],
            [x + zoneW, 0],
            [x + zoneW, zoneH],
            [x + aw, zoneH],
            [x, zoneH / 2],
          ],
          role,
          { id: ctx.uid(item.id) },
        );
        iconCx += aw / 2;
      } else if (last) {
        ctx.poly(
          [
            [x, 0],
            [x + zoneW - aw, 0],
            [x + zoneW, zoneH / 2],
            [x + zoneW - aw, zoneH],
            [x, zoneH],
          ],
          role,
          { id: ctx.uid(item.id) },
        );
        iconCx -= aw / 2;
      } else {
        ctx.shape("round-rectangle", x, 0, zoneW, zoneH, role, { id: ctx.uid(item.id) });
      }
      ctx.icon(item.icon, iconCx, zoneH / 2, 40, role.textColor);
      const pole = first || last;
      ctx.labelBlock(item.label, item.detail, x + zoneW / 2, pole ? zoneH + 22 : -22, {
        color: role.color,
        align: "center",
        maxW: zoneW + 24,
        vAnchor: pole ? "top" : "bottom",
      });
      }),
    );
  },
});

// ---- bridge / challenges (one skeleton, two variants) -------------------------

function gapSpanGenerator(variant: "hurdles" | "planks") {
  return (spec: VizSpec, ctx: VizContext): void => {
    const items = itemsOf(spec, "item", "step", "challenge", "plank");
    const n = Math.max(items.length, 1);
    const archW = variant === "planks" ? 190 : 212;
    const gap = 14;
    const W = n * archW + (n - 1) * gap;
    const base = 380;
    const from = spec.items.find((i) => i.kind === "from");
    const to = spec.items.find((i) => i.kind === "to");
    const action = optStr(spec.options, "action");
    // open panels (colored outline, no fill) with gently wavy tops and a
    // concave arch cut into the bottom edge — the negative space under the
    // row reads as bridge arches.
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const stroke = roleStroke(ctx, role);
      const x = i * (archW + gap);
      const mid = (n - 1) / 2;
      const t = n === 1 ? 0 : (i - mid) / Math.max(mid, 0.5); // -1 (left) … 1 (right)
      const h = (variant === "planks" ? 276 : 264) + 78 * Math.sin((Math.PI * (i + 0.5)) / n);
      const top = base - h;
      // outer panels' tops tilt up toward the diagram center; central panels bow up
      const tilt = 32 * Math.abs(t);
      const topL = top + (t < 0 ? tilt : 0);
      const topR = top + (t > 0 ? tilt : 0);
      const bow = 24 * Math.max(0, 1 - Math.abs(t) * 1.2);
      const archDepth = 40 + 24 * Math.max(0, 1 - Math.abs(t)); // deeper arch mid-row
      const pts: Array<[number, number]> = [
        [x, base],
        [x, topL],
      ];
      // wavy top edge, left → right (small sine wobble over the tilt/bow line)
      for (let s = 1; s <= 9; s++) {
        const u = s / 10;
        pts.push([x + archW * u, lerp(topL, topR, u) - Math.sin(Math.PI * u) * bow + Math.sin(u * 5 + i * 2) * 3]);
      }
      pts.push([x + archW, topR], [x + archW, base]);
      // concave arch cut into the bottom edge, right → left
      for (let s = 1; s <= 9; s++) {
        const u = s / 10;
        pts.push([x + archW * (1 - u), base - Math.sin(Math.PI * u) * archDepth]);
      }
      ctx.poly(pts, { stroke, fill: null, fillStyle: "none", strokeWidth: 2.2, roughness: ctx.preset.roughness }, { id: ctx.uid(item.id) });
      const cxA = x + archW / 2;
      ctx.label(String(i + 1), cxA, top + 46, { size: 28, color: role.color, weight: 700, font: "heading" });
      ctx.label(ctx.wrap(item.label, archW - 32, 19, "heading", 3), cxA, top + 96, {
        size: 19,
        color: role.color,
        weight: ctx.preset.fonts.headingWeight,
        font: "heading",
      });
      if (item.detail) {
        ctx.label(ctx.wrap(item.detail, archW - 36, 14, "body", 5), cxA, top + 128, { size: 14, color: ctx.ink, vAnchor: "top" });
      }
      if (item.icon) ctx.icon(item.icon, cxA, base - archDepth - 30, 34, role.color);
      }),
    );
    // gray from/to boxes fully clear below the OUTER panels
    const boxW = archW + 4;
    const boxH = 96;
    const boxY = base + 26;
    const placeBox = (it: VizItem, cx: number): void => {
      ctx.shape("round-rectangle", cx - boxW / 2, boxY, boxW, boxH, { stroke: ctx.mutedInk, fill: null, fillStyle: "none", strokeWidth: 1.6, roughness: ctx.preset.roughness }, { id: ctx.uid(it.id) });
      ctx.labelBlock(it.label, it.detail, cx, boxY + boxH / 2, { color: ctx.ink, align: "center", maxW: boxW - 28, size: 19 });
    };
    if (from) ctx.item(from.id, () => placeBox(from, archW / 2));
    if (to) ctx.item(to.id, () => placeBox(to, W - archW / 2));
    // action caption below the from/to boxes so it's always clear of them
    // (at 2 steps the boxes meet in the middle, so a centered caption collides)
    if (action) ctx.label(ctx.wrap(action, W - 40, 26, "heading", 2), W / 2, boxY + boxH + 30, { size: 26, color: ctx.ink, weight: 700, font: "heading" });
  };
}

registerViz({
  name: "challenges",
  aliases: ["hurdles"],
  category: "Problems and Solutions",
  summary: "Hurdles spanning the gap between two cliffs (from → to).",
  entryKinds: ["item", "step", "challenge", "plank", "from", "to"],
  options: [{ name: "action", type: "string", description: "call-to-action caption below the from/to boxes" }],
  sweetSpot: { min: 2, max: 5 },
  generate: gapSpanGenerator("hurdles"),
});

registerViz({
  name: "bridge",
  category: "Problems and Solutions",
  summary: "Bridge planks spanning the gap between two cliffs (from → to).",
  entryKinds: ["item", "step", "challenge", "plank", "from", "to"],
  options: [{ name: "action", type: "string", description: "call-to-action caption below the from/to boxes" }],
  sweetSpot: { min: 2, max: 5 },
  generate: gapSpanGenerator("planks"),
});

// ---- vision -----------------------------------------------------------------

registerViz({
  name: "vision",
  category: "Visual Metaphors",
  summary: "A staircase rising from today toward an open door (the vision).",
  entryKinds: ["item", "current", "vision"],
  sweetSpot: { min: 2, max: 2 },
  generate(spec: VizSpec, ctx: VizContext) {
    const generic = itemsOf(spec, "item");
    const current = spec.items.find((i) => i.kind === "current") ?? generic[0];
    const vision = spec.items.find((i) => i.kind === "vision") ?? generic.find((i) => i !== current);
    const cRole = ctx.role(0, { n: 2, color: current?.color });
    const vRole = ctx.role(1, { n: 2, color: vision?.color });
    const steps = 5;
    const rise = 46;
    const run = 56;
    const groundY = 340;
    const x0 = 40; // first riser
    const topX = x0 + steps * run;
    const topY = groundY - steps * rise;
    const landingW = 170; // door landing on top
    const xR = topX + landingW;

    // one closed stepped silhouette (risers + treads + landing) — reads as a
    // real staircase, softly tinted in the "today" color
    const silhouette: Array<[number, number]> = [[x0, groundY]];
    for (let k = 0; k < steps; k++) {
      const xL = x0 + k * run;
      const yT = groundY - (k + 1) * rise;
      silhouette.push([xL, yT], [xL + run, yT]);
    }
    silhouette.push([xR, topY], [xR, groundY]);
    ctx.poly(silhouette, { stroke: ctx.ink, fill: cRole.softFill, fillStyle: "solid", strokeWidth: 2.2, roughness: ctx.preset.roughness }, { id: ctx.uid("stairs") });

    // ground line under everything
    ctx.line(
      [
        [x0 - 104, groundY],
        [xR + 44, groundY],
      ],
      { color: ctx.ink, width: 2.4 },
    );

    // dashed ascent arrow riding just above the step noses — today's momentum
    ctx.line(
      [
        [x0 + run * 0.75, groundY - rise * 2.55],
        [topX - 14, topY - 40],
      ],
      { color: vRole.color, width: 2.2, dash: true, arrow: true },
    );

    // a figure standing at the base — "you are here, today"
    const fx = x0 - 52;
    scoped(ctx, current, () => {
      ctx.shape("circle", fx - 9, groundY - 76, 18, 18, { stroke: cRole.color, fill: null, fillStyle: "none", strokeWidth: 2, roughness: ctx.preset.roughness });
      ctx.line([[fx, groundY - 58], [fx, groundY - 27]], { color: cRole.color, width: 2 }); // torso
      ctx.line([[fx - 13, groundY - 47], [fx + 13, groundY - 47]], { color: cRole.color, width: 2 }); // arms
      ctx.line([[fx, groundY - 27], [fx - 11, groundY]], { color: cRole.color, width: 2 }); // legs
      ctx.line([[fx, groundY - 27], [fx + 11, groundY]], { color: cRole.color, width: 2 });
      if (current?.icon) ctx.icon(current.icon, fx, groundY - 106, 30, cRole.color);
      if (current) ctx.labelBlock(current.label, current.detail, fx - 52, groundY + 28, { color: cRole.color, align: "left", maxW: 210, vAnchor: "top" });
    });

    // the door on the landing: frame + doorway + open leaf + knob + light rays
    // — the door IS the vision item's shape, so it's tagged as that item
    const doorW = 92;
    const doorH = 166;
    const doorX = topX + (landingW - doorW) / 2 - 14;
    const doorB = topY;
    scoped(ctx, vision, () => {
      // frame (inverted U standing on the landing)
      ctx.line(
        [
          [doorX - 7, doorB],
          [doorX - 7, doorB - doorH - 7],
          [doorX + doorW + 7, doorB - doorH - 7],
          [doorX + doorW + 7, doorB],
        ],
        { color: ctx.ink, width: 2.2 },
      );
      ctx.shape("rectangle", doorX, doorB - doorH, doorW, doorH, vRole, { id: vision ? ctx.uid(vision.id) : undefined });
      // open leaf (skewed parallelogram) + knob
      ctx.poly(
        [
          [doorX + doorW, doorB - doorH],
          [doorX + doorW + 54, doorB - doorH - 26],
          [doorX + doorW + 54, doorB - 32],
          [doorX + doorW, doorB],
        ],
        vRole,
      );
      dot(ctx, doorX + doorW + 42, doorB - doorH / 2 - 12, 8, vRole.textColor, 3);
      // light rays fanning up from the open doorway
      const rcx = doorX + doorW / 2;
      const rcy = doorB - doorH - 14;
      for (const [dx, dy] of [
        [-40, -26],
        [0, -34],
        [40, -26],
      ] as Array<[number, number]>) {
        ctx.line(
          [
            [rcx + dx * 0.4, rcy + dy * 0.4],
            [rcx + dx, rcy + dy],
          ],
          { color: vRole.color, width: 2 },
        );
      }
      if (vision?.icon) ctx.icon(vision.icon, doorX + doorW / 2, doorB - doorH - 78, 34, vRole.color);
      if (vision) ctx.labelBlock(vision.label, vision.detail, xR + 28, doorB - doorH + 14, { color: vRole.color, align: "left", maxW: 200, vAnchor: "top" });
    });
  },
});

// ---- hole ---------------------------------------------------------------------

registerViz({
  name: "hole",
  aliases: ["pit"],
  category: "Visual Metaphors",
  summary: "A pit in the ground with a ladder out — the title carries the message.",
  entryKinds: [],
  options: [{ name: "caption", type: "string", description: "message line below the pit" }],
  generate(spec: VizSpec, ctx: VizContext) {
    const W = 620;
    const mouthW = 240;
    const pitL = (W - mouthW) / 2;
    const pitR = pitL + mouthW;
    const pitCx = (pitL + pitR) / 2;
    const depth = mouthW * 1.5; // deep pit: depth ≈ 1.5× mouth width
    // ragged U-shaped pit walls (open outline, no earth slab)
    const wallPt = (t: number): [number, number] => {
      const a = Math.PI * t;
      return [pitCx - (mouthW / 2) * Math.cos(a), depth * Math.sin(a) ** 0.8];
    };
    const segs = 34;
    const wall: Array<[number, number]> = [];
    for (let s = 0; s <= segs; s++) {
      const [px, py] = wallPt(s / segs);
      const ragged = s === 0 || s === segs ? 0 : 1;
      wall.push([px + jit(s, 5) * ragged, py + jit(s + 11, 4) * ragged]);
    }
    ctx.line(wall, { color: ctx.ink, width: 2.4, id: ctx.uid("pit") });
    // ground = grass line either side of the mouth + a couple of tufts
    const grass = ctx.role(0, { n: 2 }).color;
    ctx.line(
      [
        [-30, 0],
        [pitL + 2, 0],
      ],
      { color: grass, width: 2 },
    );
    ctx.line(
      [
        [pitR - 2, 0],
        [W + 30, 0],
      ],
      { color: grass, width: 2 },
    );
    for (const gx of [pitL - 16, pitR + 22, W - 70]) {
      ctx.line(
        [
          [gx - 5, 0],
          [gx, -11],
          [gx + 5, 0],
        ],
        { color: grass, width: 1.6 },
      );
    }
    // dotted soil ticks: under the surface + trailing the pit walls
    for (let k = 0; k < 14; k++) {
      const gx = -16 + ((k * 97.3) % (W + 32));
      if (gx > pitL - 16 && gx < pitR + 16) continue;
      dot(ctx, gx, 12 + ((k * 17) % 26), 3, ctx.mutedInk);
    }
    for (let k = 0; k < 20; k++) {
      const t = 0.06 + 0.88 * ((k * 0.383) % 1);
      const [px, py] = wallPt(t);
      const out = px < pitCx ? -1 : 1;
      dot(ctx, px + out * (18 + ((k * 13) % 24)), py - 4 + ((k * 7) % 16), 3, ctx.mutedInk);
    }
    // ladder seated in the pit: feet on the floor, top edge leaning on the right rim
    const lc = ctx.role(1, { n: 2 }).color;
    const foot: [number, number] = [pitCx + 22, depth - 8];
    const head: [number, number] = [pitR + 26, -44];
    const len = Math.hypot(head[0] - foot[0], head[1] - foot[1]);
    const nx = -(head[1] - foot[1]) / len;
    const ny = (head[0] - foot[0]) / len;
    const rail = (side: number): [[number, number], [number, number]] => [
      [foot[0] + nx * side, foot[1] + ny * side],
      [head[0] + nx * side, head[1] + ny * side],
    ];
    const [r1b, r1t] = rail(-13);
    const [r2b, r2t] = rail(13);
    ctx.line([r1b, r1t], { color: lc, width: 2.6, id: ctx.uid("ladder") });
    ctx.line([r2b, r2t], { color: lc, width: 2.6 });
    for (let k = 0; k < 7; k++) {
      const t = 0.08 + k * 0.135;
      ctx.line(
        [
          [lerp(r1b[0], r1t[0], t), lerp(r1b[1], r1t[1], t)],
          [lerp(r2b[0], r2t[0], t), lerp(r2b[1], r2t[1], t)],
        ],
        { color: lc, width: 2.2 },
      );
    }
    const caption = optStr(spec.options, "caption");
    if (caption) ctx.label(caption, W / 2, depth + 44, { size: 18, color: ctx.ink, maxW: W - 80 });
  },
});

// ---- trend --------------------------------------------------------------------

registerViz({
  name: "trend",
  category: "Visual Metaphors",
  summary: "A rising staircase of progress with labeled levels on leader lines.",
  entryKinds: ["item", "step", "level"],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "step", "level");
    const n = Math.max(items.length, 1);
    const teeth = 3;
    const toothRise = 52;
    const toothRun = 56;
    const flightRise = teeth * toothRise;
    const flightRun = teeth * toothRun;
    const H = n * flightRise;
    // one big staircase polyline, bottom-left → top-right (chunky treads)
    const pts: Array<[number, number]> = [[0, H]];
    let px = 0;
    let py = H;
    for (let k = 0; k < n * teeth; k++) {
      py -= toothRise;
      pts.push([px, py]);
      px += toothRun;
      pts.push([px, py]);
    }
    ctx.line(pts, { color: ctx.ink, width: 2.6 });
    // fat block arrow crowning the apex, pointing diagonally up-right
    const ux = Math.SQRT1_2;
    const uy = -Math.SQRT1_2;
    const ax = px - 58;
    const ay = py + 8;
    const shaft = 112;
    const headL = 66;
    const halfShaft = 26;
    const halfHead = 58;
    const P = (along: number, side: number): [number, number] => [ax + ux * along - uy * side, ay + uy * along + ux * side];
    ctx.poly(
      [P(0, -halfShaft), P(shaft, -halfShaft), P(shaft, -halfHead), P(shaft + headL, 0), P(shaft, halfHead), P(shaft, halfShaft), P(0, halfShaft)],
      { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.4, roughness: ctx.preset.roughness },
    );
    // per level: leader line + end dot to an alternating-side text block.
    // The dot sits at the flight's OUTER corner (left corner for left-side
    // labels, right end for right-side ones) and the leader runs 8px below the
    // tread line, so it can never cross the staircase itself.
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const yA = H - (i + 1) * flightRise + 8;
      const rightSide = i % 2 === 0;
      const bx = rightSide ? n * flightRun + 30 : -30;
      const sx = rightSide ? (i + 1) * flightRun - 6 : i * flightRun + 6;
      ctx.line(
        [
          [sx, yA],
          [bx + (rightSide ? -16 : 16), yA],
        ],
        { color: ctx.mutedInk, width: 1.4 },
      );
      dot(ctx, sx, yA, 8, role.color, 3);
      if (item.icon) ctx.icon(item.icon, bx + (rightSide ? 22 : -22), yA - 44, 36, role.color);
      ctx.labelBlock(item.label, item.detail, bx, yA, { color: role.color, align: rightSide ? "left" : "right", maxW: 210 });
      }),
    );
  },
});

// ---- race ---------------------------------------------------------------------

const KART_D =
  "M8 38 L8 27 Q8 20 16 20 L36 20 Q41 8 52 8 Q63 8 68 20 L86 20 Q94 20 94 29 L94 36 Q94 41 87 41 L15 41 Q8 41 8 38 Z " +
  "M28 41 a8.5 8.5 0 1 0 0.01 0 Z M72 41 a8.5 8.5 0 1 0 0.01 0 Z";

registerViz({
  name: "race",
  category: "Visual Metaphors",
  summary: "Karts racing toward the finish line, staggered by rank.",
  entryKinds: ["item", "racer", "kart"],
  options: [{ name: "finish", type: "string", description: "banner text over the finish gate (default FINISH)" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "racer", "kart");
    const n = Math.max(items.length, 1);
    const trackY = 240;
    const kw = 112;
    const kh = 58;
    const fronts = items.map((_, i) => n * 150 - i * 158 - Math.abs(jit(i, 14)));
    const startX = (fronts.length ? Math.min(...fronts) : 150) - kw - 60;
    const gate1 = n * 150 + 60;
    const gate2 = gate1 + 72;
    // track line with arrowhead, then the finish gate
    ctx.arrow(startX, trackY, gate2 + 96, trackY, { color: ctx.ink, width: 2.4 });
    const postTop = trackY - 128;
    ctx.line(
      [
        [gate1, trackY],
        [gate1, postTop],
      ],
      { color: ctx.ink, width: 2.4 },
    );
    ctx.line(
      [
        [gate2, trackY],
        [gate2, postTop],
      ],
      { color: ctx.ink, width: 2.4 },
    );
    const banner = ctx.role(0, { neutral: true });
    ctx.shape("rectangle", gate1 - 14, postTop - 34, gate2 - gate1 + 28, 34, banner);
    ctx.label(optStr(spec.options, "finish") ?? "FINISH", (gate1 + gate2) / 2, postTop - 17, { size: 16, color: banner.textColor, weight: 700, font: "heading" });
    // karts, first at the line
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const front = fronts[i];
      ctx.path(KART_D, 102, 60, front - kw, trackY - kh + 7, kw, kh, role, { id: ctx.uid(item.id) });
      ctx.labelBlock(item.label, item.detail, front - kw / 2, trackY + 28, { color: role.color, align: "center", maxW: 150, vAnchor: "top" });
      }),
    );
  },
});

// ---- dialogue -------------------------------------------------------------------

const BUST_D = "M30 6 a11 11 0 1 0 0.01 0 Z M6 56 C6 40 16 33 30 33 C44 33 54 40 54 56";

registerViz({
  name: "dialogue",
  aliases: ["conversation"],
  category: "Visual Metaphors",
  summary: "A chat transcript between two speakers, bubbles alternating sides.",
  entryKinds: ["item", "msg", "turn", "message", "speaker"],
  options: [
    { name: "a", type: "string", description: "left speaker name (default A)" },
    { name: "b", type: "string", description: "right speaker name (default B)" },
  ],
  sweetSpot: { min: 2, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const msgs = itemsOf(spec, "item", "msg", "turn", "message");
    const speakers = spec.items.filter((i) => i.kind === "speaker");
    const nameA = optStr(spec.options, "a") ?? speakers[0]?.label ?? "A";
    const nameB = optStr(spec.options, "b") ?? speakers[1]?.label ?? "B";
    const roleA = ctx.role(0, { n: 2, color: speakers[0]?.color });
    const roleB = ctx.role(1, { n: 2, color: speakers[1]?.color });
    const bubbleW = 300;
    const indent = 140;
    let y = 0;
    msgs.forEach((m, i) =>
      ctx.item(m.id, () => {
      const sp = (optStr(m.opts, "speaker") ?? (i % 2 === 0 ? "a" : "b")).toLowerCase();
      const isA = sp !== "b";
      const role = isA ? roleA : roleB;
      const text = ctx.wrap(m.label + (m.detail ? ` ${m.detail}` : ""), bubbleW - 32, 15, "body", 6);
      const h = measureBlock(text, 15, ctx.font("body")).h + 26;
      const x = isA ? 0 : indent;
      ctx.shape("round-rectangle", x, y, bubbleW, h, role, { id: ctx.uid(m.id) });
      ctx.label(text, x + 16, y + h / 2, { size: 15, color: role.textColor, align: "left", z: 3 });
      y += h + 16;
      }),
    );
    // bust glyphs (head + shoulders) in the bottom corners — each tagged as its
    // speaker entry when one exists (names may come from options alone)
    const by = y + 20;
    scoped(ctx, speakers[0], () => {
      ctx.path(BUST_D, 60, 58, -12, by, 64, 62, roleA, { id: ctx.uid("speaker_a") });
      ctx.label(nameA, 20, by + 84, { size: 17, color: roleA.color, weight: 700, font: "heading" });
    });
    scoped(ctx, speakers[1], () => {
      ctx.path(BUST_D, 60, 58, indent + bubbleW - 52, by, 64, 62, roleB, { id: ctx.uid("speaker_b") });
      ctx.label(nameB, indent + bubbleW - 20, by + 84, { size: 17, color: roleB.color, weight: 700, font: "heading" });
    });
  },
});

// ---- pillar ---------------------------------------------------------------------

registerViz({
  name: "pillar",
  aliases: ["pillars"],
  category: "Visual Metaphors",
  summary: "Classical columns, one per pillar, icon + label in the shaft.",
  entryKinds: ["item", "pillar"],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "pillar");
    const n = Math.max(items.length, 1);
    const pitch = 190;
    const colW = 150;
    const shaftW = 106;
    const shaftH = 250;
    const shaftY = 38;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const x = i * pitch;
      const cxC = x + colW / 2;
      // capital (two tiers), shaft, base (two tiers)
      ctx.shape("rectangle", x, 0, colW, 20, role);
      ctx.shape("rectangle", x + 12, 22, colW - 24, 12, role);
      const shaftX = x + (colW - shaftW) / 2;
      ctx.shape("rectangle", shaftX, shaftY, shaftW, shaftH, role, { id: ctx.uid(item.id) });
      ctx.shape("rectangle", x + 12, shaftY + shaftH + 4, colW - 24, 12, role);
      ctx.shape("rectangle", x, shaftY + shaftH + 18, colW, 20, role);
      // fluting lines in the lower shaft (content sits above them)
      for (const fx of [0.3, 0.5, 0.7]) {
        ctx.line(
          [
            [shaftX + shaftW * fx, shaftY + 150],
            [shaftX + shaftW * fx, shaftY + shaftH - 14],
          ],
          { color: role.textColor, width: 1.1 },
        );
      }
      ctx.icon(item.icon, cxC, shaftY + 42, 40, role.textColor);
      ctx.label(ctx.wrap(item.label, shaftW - 16, 18, "heading", 3), cxC, shaftY + 104, {
        size: 18,
        color: role.textColor,
        weight: ctx.preset.fonts.headingWeight,
        font: "heading",
      });
      if (item.detail) {
        ctx.label(ctx.wrap(item.detail, colW + 24, 14, "body", 4), cxC, shaftY + shaftH + 52, { size: 14, color: ctx.mutedInk, vAnchor: "top" });
      }
      }),
    );
  },
});

// ---- bottleneck ------------------------------------------------------------------

registerViz({
  name: "bottleneck",
  category: "Visual Metaphors",
  summary: "Flow crowding through a bottle's neck — many in, few out.",
  entryKinds: ["item"],
  options: [
    { name: "count", type: "number", description: "upstream circle count, 6-28 (default 16)" },
    { name: "in", type: "string", description: "caption over the wide inlet" },
    { name: "out", type: "string", description: "caption over the outlet" },
  ],
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item");
    const role = ctx.role(0, { n: 1, color: items[0]?.color });
    // hourglass pipe: wide chamber → neck at the CENTER → downstream chamber
    const W = 720;
    const halfIn = 66;
    const halfNeck = 16;
    const halfOut = 54;
    const aEnd = 218;
    const neckL = 296;
    const neckR = 424;
    const bStart = 502;
    const ease = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;
    const half = (x: number): number => {
      if (x <= aEnd) return halfIn;
      if (x < neckL) return lerp(halfIn, halfNeck, ease((x - aEnd) / (neckL - aEnd)));
      if (x <= neckR) return halfNeck;
      if (x < bStart) return lerp(halfNeck, halfOut, ease((x - neckR) / (bStart - neckR)));
      return halfOut;
    };
    // open-ended pipe: top and bottom contours only
    const topC: Array<[number, number]> = [];
    const botC: Array<[number, number]> = [];
    for (let x = 0; x <= W; x += 8) {
      topC.push([x, -half(x)]);
      botC.push([x, half(x)]);
    }
    ctx.line(topC, { color: ctx.ink, width: 2.4, id: ctx.uid("pipe") });
    ctx.line(botC, { color: ctx.ink, width: 2.4 });
    // circles crowd before the neck (deterministic scatter)…
    const count = Math.max(6, Math.min(28, optNum(spec.options, "count") ?? 16));
    for (let k = 0; k < count; k++) {
      const bx = 20 + ((k * 53.7) % (aEnd + 20 - 34));
      const clear = half(bx + 6) - 13;
      const by = -clear + ((k * 37.3) % (clear * 2));
      ctx.shape("circle", bx - 6, by - 6, 12, 12, role);
    }
    // …go single-file through the neck…
    for (const [ex, ey] of [
      [258, -4],
      [314, 2],
      [360, -2],
      [406, 1],
    ]) {
      ctx.shape("circle", ex - 6, ey - 6, 12, 12, role);
    }
    // …and come out sparse downstream
    for (const [ex, ey] of [
      [548, -16],
      [612, 12],
      [676, -6],
    ]) {
      ctx.shape("circle", ex - 6, ey - 6, 12, 12, role);
    }
    // 3 in-arrows, 1 out-arrow
    for (const ay of [-40, 0, 40]) ctx.arrow(-78, ay, -16, ay, { color: ctx.preset.edge, width: 2 });
    ctx.arrow(W + 16, 0, W + 78, 0, { color: ctx.preset.edge, width: 2 });
    const inLabel = optStr(spec.options, "in");
    const outLabel = optStr(spec.options, "out");
    if (inLabel) ctx.label(inLabel, -47, -halfIn - 24, { size: 16, color: ctx.ink, maxW: 150 });
    if (outLabel) ctx.label(outLabel, W + 47, -halfOut - 24, { size: 16, color: ctx.ink, maxW: 150 });
  },
});

// ---- iceberg ---------------------------------------------------------------------

registerViz({
  name: "iceberg",
  category: "Parts of Whole",
  summary: "The visible tip vs the hidden mass below the waterline.",
  entryKinds: ["above", "below", "item"],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    let aboveItems = spec.items.filter((i) => i.kind === "above");
    let belowItems = spec.items.filter((i) => i.kind === "below");
    if (!aboveItems.length && !belowItems.length) {
      const items = itemsOf(spec, "item");
      aboveItems = items.slice(0, 1);
      belowItems = items.slice(1);
    }
    const total = Math.max(aboveItems.length + belowItems.length, 2);
    const roleOf = (it: VizItem | undefined, idx: number): RoleStyle => ctx.role(idx, { n: total, color: it?.color });
    const W = 660;
    // wavy waterline across the full width
    const wl: Array<[number, number]> = [];
    for (let x = -20; x <= W; x += 16) wl.push([x, Math.sin(x / 30) * 5]);
    ctx.line(wl, { color: ctx.mutedInk, width: 1.8 });
    // peak above water + bigger jagged mass below — each polygon already takes
    // its id/color from the first above/below entry, so it's tagged as that item
    const aboveRole = roleOf(aboveItems[0], 0);
    scoped(ctx, aboveItems[0], () =>
      ctx.poly(
        [
          [330, -2],
          [372, -58],
          [404, -34],
          [446, -120],
          [482, -52],
          [516, -80],
          [552, -2],
        ],
        aboveRole,
        { id: aboveItems[0] ? ctx.uid(aboveItems[0].id) : ctx.uid("peak") },
      ),
    );
    const belowRole = roleOf(belowItems[0], aboveItems.length || 1);
    scoped(ctx, belowItems[0], () =>
      ctx.poly(
        [
          [318, 8],
          [566, 8],
          [602, 96],
          [548, 162],
          [578, 232],
          [500, 296],
          [448, 350],
          [396, 292],
          [330, 220],
          [352, 140],
          [300, 78],
        ],
        belowRole,
        { id: belowItems[0] ? ctx.uid(belowItems[0].id) : ctx.uid("mass") },
      ),
    );
    // label+detail blocks on the left with leader lines to their depth
    const entry = (item: VizItem, role: RoleStyle, y: number, endX: number): void => {
      const b = ctx.labelBlock(item.label, item.detail, 0, y, { color: role.color, align: "left", maxW: 210 });
      let lx = b.x + b.w + 12;
      if (item.icon) {
        ctx.icon(item.icon, lx + 16, y, 30, role.color);
        lx += 38;
      }
      ctx.line(
        [
          [lx, y],
          [endX - 8, y],
        ],
        { color: ctx.mutedInk, width: 1.4 },
      );
      dot(ctx, endX, y, 7, role.color, 3);
    };
    aboveItems.forEach((item, j) => ctx.item(item.id, () => entry(item, roleOf(item, j), -46 - j * 52, 355 + j * 18)));
    belowItems.forEach((item, j) =>
      ctx.item(item.id, () => {
        const y = belowItems.length === 1 ? 160 : 60 + (260 * j) / (belowItems.length - 1);
        entry(item, roleOf(item, aboveItems.length + j), y, lerp(322, 428, y / 350));
      }),
    );
  },
});
