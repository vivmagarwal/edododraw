/**
 * Visual-metaphor and comparison visualizations: balance, podium, spectrum,
 * bridge/challenges, vision, hole, trend, race, dialogue, pillar, bottleneck,
 * iceberg. Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizBounds, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { RoleStyle } from "../../style/presets.js";
import type { TextAlign } from "../../scene/types.js";
import { mix, parseHex } from "../../style/color.js";
import { measureBlock } from "../text.js";
import { lerp, rad } from "./util.js";

/** Stroke that stays visible when a preset outlines shapes in the canvas color. */
function roleStroke(ctx: VizContext, role: RoleStyle): string {
  return role.stroke === ctx.preset.background ? role.color : role.stroke;
}

interface BlockOpts {
  color?: string;
  align?: TextAlign;
  maxW?: number;
  vAnchor?: "middle" | "top" | "bottom";
  size?: number;
  /** Detail line size — the shared labelBlock pins it at 15u, too small once a card is fitted. */
  detailSize?: number;
}

/** Wrapped label + detail text for a block (shared by measure and draw). */
function blockText(ctx: VizContext, label: string, detail: string | undefined, o: BlockOpts) {
  const maxW = o.maxW ?? 220;
  const size = o.size ?? 20;
  const ds = o.detailSize ?? 17;
  const labelText = label ? ctx.wrap(label, maxW, size, "heading", 3) : "";
  const detailText = detail ? ctx.wrap(detail, maxW, ds, "body", 4) : undefined;
  const lm = labelText ? measureBlock(labelText, size, ctx.font("heading")) : { w: 0, h: 0 };
  const dm = detailText ? measureBlock(detailText, ds, ctx.font("body")) : { w: 0, h: 0 };
  const gap = labelText && detailText ? 6 : 0;
  return { labelText, detailText, lm, dm, size, ds, gap, w: Math.max(lm.w, dm.w), h: lm.h + gap + dm.h };
}

/** ctx.labelBlock with a readable detail size (see BlockOpts.detailSize). */
function block(ctx: VizContext, label: string, detail: string | undefined, x: number, y: number, o: BlockOpts = {}): VizBounds {
  const t = blockText(ctx, label, detail, o);
  const align = o.align ?? "left";
  const anchor = o.vAnchor ?? "middle";
  const top = anchor === "top" ? y : anchor === "bottom" ? y - t.h : y - t.h / 2;
  if (t.labelText) ctx.label(t.labelText, x, top + t.lm.h / 2, { color: o.color ?? ctx.ink, align, font: "heading", weight: ctx.preset.fonts.headingWeight, size: t.size });
  if (t.detailText) ctx.label(t.detailText, x, top + t.lm.h + t.gap + t.dm.h / 2, { color: ctx.mutedInk, align, size: t.ds, role: "detail" });
  const bx = align === "left" ? x : align === "right" ? x - t.w : x - t.w / 2;
  return { x: bx, y: top, w: t.w, h: t.h };
}

/** Wrap into the fewest lines that fit maxW, then at the narrowest width that keeps that line count — no orphan last word. */
function balancedWrap(ctx: VizContext, text: string, maxW: number, size: number, maxLines: number): string {
  const lines = (w: number) => ctx.wrap(text, w, size, "body", maxLines).split("\n").length;
  const target = lines(maxW);
  if (target <= 1) return ctx.wrap(text, maxW, size, "body", maxLines);
  let lo = maxW * 0.4;
  let hi = maxW;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (lines(mid) > target) lo = mid;
    else hi = mid;
  }
  return ctx.wrap(text, hi, size, "body", maxLines);
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

/** A hanger/pivot ring: paper-filled so the beam does not show through it. */
function ring(ctx: VizContext, cx: number, cy: number, r: number, z: number): void {
  ctx.shape("circle", cx - r, cy - r, r * 2, r * 2, { stroke: ctx.ink, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2, roughness: ctx.preset.roughness }, { z });
}

/** An opaque tinted panel: paper under the role's (often translucent) fill, so nothing behind shows through. */
function panel(ctx: VizContext, shape: "round-rectangle" | "pill", x: number, y: number, w: number, h: number, role: RoleStyle, z: number, roundness?: number): void {
  ctx.shape(shape, x, y, w, h, { stroke: roleStroke(ctx, role), fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2, roughness: ctx.preset.roughness, roundness }, { z });
  if (role.fill) ctx.shape(shape, x, y, w, h, { stroke: "transparent", fill: role.fill, fillStyle: role.fillStyle, strokeWidth: 0, roughness: 0, roundness }, { z: z + 1 });
}

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
    // a post on a stepped plinth, a beam pivoting on top, and from each beam
    // end a pan hanging plumb on two strings; the items ride in a card
    // sitting in the pan, the side's name on a pill beneath it
    const L = 205;
    const a = rad(tilt === "left" ? 7 : tilt === "right" ? -7 : 0);
    const rowH = 32;
    const rowSize = 17;
    // cards are measured first so the strings are long enough for the taller one
    const cards = sides.map((side) => {
      const rows = side.children.slice(0, 5).map((row) => ({ row, w: (row.icon ? 34 : 18) + ctx.measure(row.label, rowSize) }));
      return { rows, w: Math.max(140, ...rows.map((r) => r.w)) + 40, h: rows.length ? rows.length * rowH + 22 : 0 };
    });
    // one pan size for both sides: a little wider than the wider card
    const rimHalf = Math.max(...cards.map((c) => c.w)) / 2 + 10;
    const panDepth = Math.round(rimHalf * 0.34);
    const hang = Math.max(120, ...cards.map((c) => c.h + 46));
    const endX = (dir: number) => dir * L * Math.cos(a);
    const endY = (dir: number) => -dir * L * Math.sin(a);
    const plinthY = Math.max(endY(-1), endY(1)) + hang + panDepth + 14;

    // post + stepped plinth, the pivot on top — drawn in the same ink
    // language as the beam and pans (edge-coloured outline, neutral only as
    // a pale fill), standing on the ground line
    const neutral = ctx.role(0, { neutral: true });
    const stand = { stroke: ctx.preset.edge, fill: mix(ctx.preset.background, neutral.color, 0.3), fillStyle: "solid" as const, strokeWidth: 2, roughness: ctx.preset.roughness };
    ctx.poly(
      [
        [-7, 4],
        [7, 4],
        [16, plinthY + 2],
        [-16, plinthY + 2],
      ],
      stand,
      { z: 1 },
    );
    ctx.shape("round-rectangle", -34, plinthY, 68, 12, { ...stand, roundness: 5 }, { z: 1 });
    ctx.shape("round-rectangle", -64, plinthY + 12, 128, 14, { ...stand, roundness: 6 }, { z: 1 });
    ctx.line([[-92, plinthY + 26], [92, plinthY + 26]], { color: ctx.preset.edge, width: 2 });
    // the beam: a slim bar through the pivot, turned by the tilt — outlined
    // in ink at the same weight as the rest, with a light ink-tinted fill
    const nx = Math.sin(a);
    const ny = Math.cos(a);
    const half = 3.5;
    ctx.poly(
      [
        [endX(-1) - nx * half, endY(-1) - ny * half],
        [endX(1) - nx * half, endY(1) - ny * half],
        [endX(1) + nx * half, endY(1) + ny * half],
        [endX(-1) + nx * half, endY(-1) + ny * half],
      ],
      { stroke: ctx.ink, fill: mix(ctx.preset.background, ctx.ink, 0.25), fillStyle: "solid", strokeWidth: 2, roughness: ctx.preset.roughness },
      { z: 2 },
    );
    ring(ctx, 0, 0, 12, 3);
    dot(ctx, 0, 0, 9, ctx.ink, 4);

    sides.forEach((side, s) =>
      ctx.item(side.id, () => {
        const dir = s === 0 ? -1 : 1;
        const role = ctx.role(s, { n: 2, color: side.color });
        const ex = endX(dir);
        const ey = endY(dir);
        const rimY = ey + hang;
        // hanger ring + two strings down to the rim ends
        ring(ctx, ex, ey, 7, 3);
        ctx.line([[ex, ey + 7], [ex - rimHalf, rimY]], { color: ctx.ink, width: 1.6 });
        ctx.line([[ex, ey + 7], [ex + rimHalf, rimY]], { color: ctx.ink, width: 1.6 });
        // the pan: a shallow bowl in the side's colour
        ctx.path(`M0,0 L${rimHalf * 2},0 Q${rimHalf},${panDepth * 2} 0,0 Z`, rimHalf * 2, panDepth, ex - rimHalf, rimY, rimHalf * 2, panDepth, { stroke: ctx.ink, fill: role.fill, fillStyle: role.fillStyle, strokeWidth: 2, roughness: ctx.preset.roughness }, { id: ctx.uid(side.id), z: 2 });
        // the item card riding in the pan, opaque in front of the strings
        const card = cards[s];
        if (card.rows.length) {
          const x0 = ex - card.w / 2;
          const y0 = rimY - 6 - card.h;
          panel(ctx, "round-rectangle", x0, y0, card.w, card.h, role, 4, 12);
          card.rows.forEach(({ row }, j) => {
            const ry = y0 + 11 + rowH * j + rowH / 2;
            const left = x0 + 20;
            if (row.icon) ctx.icon(row.icon, left + 12, ry, 24, ctx.ink, 6);
            else dot(ctx, left + 5, ry, 9, ctx.ink, 6);
            ctx.label(row.label, left + (row.icon ? 34 : 18), ry, { size: rowSize, color: ctx.ink, align: "left", z: 6 });
          });
        }
        // the side's name on a pill under the pan, its detail beneath
        if (side.label) {
          const wrapped = ctx.wrap(side.label, 200, 17, "heading", 2);
          const lines = wrapped.split("\n");
          const pw = Math.max(96, ...lines.map((l) => ctx.measure(l, 17, "heading"))) + 34;
          const ph = 12 + lines.length * 21;
          const py = rimY + panDepth + 20 + ph / 2;
          panel(ctx, "pill", ex - pw / 2, py - ph / 2, pw, ph, role, 4);
          ctx.label(wrapped, ex, py, { size: 17, color: ctx.ink, weight: 700, font: "heading", z: 6 });
          if (side.detail) ctx.label(ctx.wrap(side.detail, 220, 14, "body", 3), ex, py + ph / 2 + 8, { size: 14, color: ctx.mutedInk, vAnchor: "top", role: "detail" });
        }
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
    const blockW = 176;
    const gap = 28; // wide enough that neighbouring treads never touch
    const base = 280;
    const heights = [196, 148, 108]; // by rank
    const cols = [1, 0, 2]; // column order left→right holds rank 2, 1, 3
    const span = 3 * blockW + 2 * gap;
    // the floor the three blocks stand on
    ctx.line([[-30, base], [span + 30, base]], { color: ctx.preset.edge, width: 2.2, z: 3 });
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
        // a solid block standing on the floor, square at the foot…
        ctx.shape("rectangle", x, top, blockW, base - top, { stroke, fill: role.softFill, fillStyle: "solid", strokeWidth: w, roughness: ctx.preset.roughness, roundness: 0 }, { id: ctx.uid(item.id), z: 1 });
        // …crowned by an overhanging tread in the rank's colour
        panel(ctx, "round-rectangle", x - 10, top - 12, blockW + 20, 16, role, 2, 6);
        ctx.icon(item.icon ?? (rank === 0 ? "trophy" : "medal"), bx, top - 44, 50, role.color);
        // rank number + name, centred as one group in the block face
        const name = ctx.wrap(item.label, blockW - 24, 19, "body", 2);
        const nameH = measureBlock(name, 19, ctx.font("body")).h;
        const numH = 36;
        const faceTop = top + 4;
        const groupTop = faceTop + Math.max(8, (base - faceTop - (numH + 6 + nameH)) / 2);
        ctx.label(String(rank + 1), bx, groupTop + numH / 2, { size: 34, color: role.color, weight: 700, font: "heading", z: 4 });
        ctx.label(name, bx, groupTop + numH + 6 + nameH / 2, { size: 19, color: ctx.ink, z: 4 });
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
    const zoneW = 184;
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
      // every zone is named on the same side of the bar, directly under its
      // own zone — a label above the middle zone reads as the chart's subtitle
      block(ctx, item.label, item.detail, x + zoneW / 2, zoneH + 20, { color: role.color, align: "center", maxW: zoneW - 8, vAnchor: "top" });
      }),
    );
  },
});

// ---- bridge / challenges (one skeleton, two variants) -------------------------

function gapSpanGenerator(variant: "hurdles" | "planks") {
  return (spec: VizSpec, ctx: VizContext): void => {
    const items = itemsOf(spec, "item", "step", "challenge", "plank");
    const n = Math.max(items.length, 1);
    const from = spec.items.find((i) => i.kind === "from");
    const to = spec.items.find((i) => i.kind === "to");
    const action = optStr(spec.options, "action");
    const hurdles = variant === "hurdles";

    // a literal gap: two cliff platforms with a shallow chasm between. The
    // bridge arches a plank deck across it with the steps as numbered stones;
    // challenges lays a LEVEL track across it with one hurdle per item.
    const cliffW = hurdles ? 180 : 190;
    const pitch = hurdles ? 180 : 132;
    const gapW = hurdles ? Math.max(420, (n + 1) * pitch) : Math.max(370, n * pitch);
    const W = cliffW * 2 + gapW;
    const topY = 240;
    const botY = 330; // a shallow chasm: the drop reads from the floor, not from dead height
    const bow = hurdles ? 0 : 64;

    // cliff faces, each landing on one ragged chasm floor
    const faceBottom = (edgeX: number, dir: 1 | -1): [number, number] => [edgeX - dir * Math.abs(jit(6 * (dir + 3), 10)), botY];
    const cliff = (edgeX: number, dir: 1 | -1): void => {
      // top surface out to the diagram edge
      ctx.line([[dir === 1 ? -36 : edgeX, topY], [dir === 1 ? edgeX : W + 36, topY]], { color: ctx.ink, width: 2.6 });
      // ragged face dropping into the gap
      const pts: Array<[number, number]> = [[edgeX, topY]];
      for (let k = 1; k < 6; k++) pts.push([edgeX - dir * Math.abs(jit(k * (dir + 3), 10)), topY + (botY - topY) * (k / 6)]);
      pts.push(faceBottom(edgeX, dir));
      ctx.line(pts, { color: ctx.ink, width: 2.2 });
      // hatch ticks on the face
      for (let k = 0; k < 4; k++) {
        const hy = topY + 14 + k * 18;
        ctx.line([[edgeX - dir * (10 + (k % 2) * 5), hy], [edgeX - dir * (26 + (k % 3) * 6), hy + 9]], { color: ctx.mutedInk, width: 1.4 });
      }
    };
    cliff(cliffW, 1);
    cliff(W - cliffW, -1);
    // the chasm floor, as ragged as the faces and sagging into a ravine
    const fl = faceBottom(cliffW, 1);
    const fr = faceBottom(W - cliffW, -1);
    const sag = 22;
    const floor: Array<[number, number]> = [];
    for (let s = 0; s <= 16; s++) {
      const t = s / 16;
      const ragged = s === 0 || s === 16 ? 0 : 1;
      floor.push([lerp(fl[0], fr[0], t), botY + Math.sin(Math.PI * t) * sag + jit(s + 3, 5) * ragged]);
    }
    ctx.line(floor, { color: ctx.ink, width: 2.2 });

    // from / to stand ON the cliffs; top-anchored at one shared y so the two
    // headings sit on the same line whatever their details do
    const headY = topY - 96;
    const placeSide = (it: VizItem, cx: number): void => {
      if (it.icon) ctx.icon(it.icon, cx, headY - 24, 34, ctx.ink);
      block(ctx, it.label, it.detail, cx, headY, { color: ctx.ink, align: "center", maxW: cliffW + 10, vAnchor: "top", size: 20, detailSize: 18 });
    };
    if (from) ctx.item(from.id, () => placeSide(from, cliffW / 2));
    if (to) ctx.item(to.id, () => placeSide(to, W - cliffW / 2));

    // the deck spans exactly edge to edge — level for the track, arched for
    // the bridge — and is capped at both abutments
    const x0 = cliffW;
    const x1 = W - cliffW;
    const deck = (t: number): [number, number] => [lerp(x0, x1, t), topY - Math.sin(Math.PI * t) * bow];
    const topLine: Array<[number, number]> = [];
    const botLine: Array<[number, number]> = [];
    for (let s = 0; s <= 30; s++) {
      const [px, py] = deck(s / 30);
      topLine.push([px, py]);
      botLine.push([px, py + 10]);
    }
    ctx.line(topLine, { color: ctx.ink, width: 2.4, id: ctx.uid("deck") });
    ctx.line(botLine, { color: ctx.ink, width: 2 });
    for (const x of [x0, x1]) ctx.line([[x, topY], [x, topY + 10]], { color: ctx.ink, width: 2 });
    for (let s = 1; s < 30; s += 2) {
      const [px, py] = deck(s / 30);
      ctx.line([[px, py], [px, py + 10]], { color: ctx.mutedInk, width: 1.3 });
    }

    const labelOpts = (role: RoleStyle, maxW: number): BlockOpts => ({ color: role.color, align: "center", maxW, vAnchor: "bottom", size: 19, detailSize: 18 });
    if (hurdles) {
      // one hurdle per item on the level track: two posts and a board, the
      // number (or icon) on the board, the label straight above it
      const maxW = pitch - 26; // ≥ 26u of air between neighbouring label blocks
      // top-anchored at one shared y so every heading sits on the same line
      const labelH = Math.max(...items.map((it) => blockText(ctx, it.label, it.detail, labelOpts(ctx.role(0), maxW)).h));
      items.forEach((item, i) =>
        ctx.item(item.id, () => {
          const role = ctx.role(i, { n, color: item.color });
          const stroke = roleStroke(ctx, role);
          const px = lerp(x0, x1, (i + 1) / (n + 1));
          const barTop = topY - 64;
          const barH = 28;
          // uprights with the feet a hurdle stands on (pointing back along the run)
          for (const sx of [px - 28, px + 28]) {
            ctx.line([[sx, topY - 2], [sx, barTop + barH]], { color: stroke, width: 2.8 });
            ctx.line([[sx - 16, topY - 3], [sx + 4, topY - 3]], { color: stroke, width: 3.2 });
          }
          ctx.shape("round-rectangle", px - 40, barTop, 80, barH, role, { id: ctx.uid(item.id), z: 2, style: { roundness: 6 } });
          if (item.icon) ctx.icon(item.icon, px, barTop + barH / 2, 22, role.textColor, 4);
          else ctx.label(String(i + 1), px, barTop + barH / 2, { size: 19, color: role.textColor, weight: 700, font: "heading", z: 4 });
          block(ctx, item.label, item.detail, px, barTop - 14 - labelH, { ...labelOpts(role, maxW), vAnchor: "top" });
        }),
      );
    } else {
      // numbered stones on the arched deck; labels on two ABSOLUTE rows above
      // the arch (alternating), each with a leader down to its stone, so the
      // steps read left to right on two clean bands
      const D = 44;
      const stepPitch = (x1 - x0) / (n + 1);
      const maxW = Math.min(200, 2 * stepPitch - 30);
      const stones = items.map((_, i) => deck((i + 1) / (n + 1)));
      const stoneTop = Math.min(...stones.map(([, py]) => py - 1 - D));
      const rowH = Math.max(34, ...items.map((it) => blockText(ctx, it.label, it.detail, labelOpts(ctx.role(0), maxW)).h)) + 16;
      const row0 = stoneTop - 22;
      items.forEach((item, i) =>
        ctx.item(item.id, () => {
          const role = ctx.role(i, { n, color: item.color });
          const [px, py] = stones[i];
          // the stone sits ON the deck (touching it), not hovering over it
          const cy = py - 1 - D / 2;
          ctx.shape("circle", px - D / 2, cy - D / 2, D, D, role, { id: ctx.uid(item.id) });
          if (item.icon) ctx.icon(item.icon, px, cy, 24, role.textColor);
          else ctx.label(String(i + 1), px, cy, { size: 20, color: role.textColor, weight: 700, font: "heading" });
          const rowY = row0 - (i % 2) * rowH;
          if (cy - D / 2 - 4 - (rowY + 6) > 6) ctx.line([[px, cy - D / 2 - 4], [px, rowY + 6]], { color: ctx.preset.edge, width: 1.4 });
          block(ctx, item.label, item.detail, px, rowY, labelOpts(role, maxW));
        }),
      );
    }

    if (action) ctx.label(ctx.wrap(action, W - 60, 22, "heading", 2), W / 2, botY + sag + 34, { size: 22, color: ctx.ink, weight: 700, font: "heading" });
  };
}

registerViz({
  name: "challenges",
  aliases: ["hurdles"],
  category: "Problems and Solutions",
  summary: "Hurdles on a level track across the gap between two cliffs (from → to).",
  entryKinds: ["item", "step", "challenge", "plank", "from", "to"],
  options: [{ name: "action", type: "string", description: "call-to-action caption below the chasm" }],
  sweetSpot: { min: 2, max: 5 },
  generate: gapSpanGenerator("hurdles"),
});

registerViz({
  name: "bridge",
  category: "Problems and Solutions",
  summary: "An arched plank bridge across the gap between two cliffs, the steps as numbered stones (from → to).",
  entryKinds: ["item", "step", "challenge", "plank", "from", "to"],
  options: [{ name: "action", type: "string", description: "call-to-action caption below the chasm" }],
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
    // the scenery is derived from the figure, so the metaphor keeps human
    // scale: a step is 0.4 of a person, the door 1.35 of one — and the whole
    // scene comes out wide rather than tall
    const figH = 86;
    const steps = 5;
    const rise = Math.round(figH * 0.4);
    const run = Math.round(figH * 0.84);
    const groundY = 300;
    const x0 = 40; // first riser
    const topX = x0 + steps * run;
    const topY = groundY - steps * rise;
    const landingW = Math.round(figH * 1.9); // door landing on top
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

    // a figure standing at the base, pointing up the stairs — "today" — with
    // its label beside it (not under the ground line, where it cost height)
    const fx = x0 - 40;
    ctx.line(
      [
        [fx - 60, groundY],
        [xR + 44, groundY],
      ],
      { color: ctx.ink, width: 2.4 },
    );

    // dashed ascent arrow riding parallel to the step noses — today's momentum
    const nose = (t: number): [number, number] => [x0 + t * run, groundY - (t + 1) * rise - 34];
    ctx.line([nose(0.5), nose(steps - 1.3)], { color: vRole.color, width: 2.2, dash: true, arrow: true });

    scoped(ctx, current, () => {
      ctx.character("pointing", fx, groundY, figH, { color: cRole.color });
      if (current?.icon) ctx.icon(current.icon, fx, groundY - figH - 26, 30, cRole.color);
      if (current) block(ctx, current.label, current.detail, fx - 40, groundY - figH / 2, { color: cRole.color, align: "right", maxW: 220 });
    });

    // the door on the landing: jamb + square doorway + open leaf + knob +
    // light rays — the door IS the vision item's shape, so it's tagged as that item
    const doorH = Math.round(figH * 1.35);
    const doorW = Math.round(doorH * 0.5);
    const doorX = topX + (landingW - doorW) / 2 - 18;
    const doorB = topY;
    const leafW = Math.round(doorW * 0.6);
    scoped(ctx, vision, () => {
      // the opening: rectilinear under every theme, three sides only (the
      // landing is its sill)
      ctx.shape("rectangle", doorX, doorB - doorH, doorW, doorH, { ...vRole, stroke: "transparent", strokeWidth: 0, roundness: 0 }, { id: vision ? ctx.uid(vision.id) : undefined });
      ctx.line(
        [
          [doorX, doorB],
          [doorX, doorB - doorH],
          [doorX + doorW, doorB - doorH],
          [doorX + doorW, doorB],
        ],
        { color: roleStroke(ctx, vRole), width: 2 },
      );
      // jamb: an L round the hinge-free side and the head, ending at the hinge
      ctx.line(
        [
          [doorX - 7, doorB],
          [doorX - 7, doorB - doorH - 7],
          [doorX + doorW, doorB - doorH - 7],
        ],
        { color: ctx.ink, width: 2.2 },
      );
      // open leaf (skewed parallelogram) + knob
      ctx.poly(
        [
          [doorX + doorW, doorB - doorH],
          [doorX + doorW + leafW, doorB - doorH - 18],
          [doorX + doorW + leafW, doorB - 22],
          [doorX + doorW, doorB],
        ],
        { ...vRole, roundness: 0 },
        { z: 1 },
      );
      dot(ctx, doorX + doorW + leafW - 9, doorB - doorH / 2 - 8, 7, vRole.textColor, 3);
      // light rays fanning up from the open doorway
      const rcx = doorX + doorW / 2;
      const rcy = doorB - doorH - 16;
      for (const [dx, dy] of [
        [-34, -22],
        [0, -30],
        [34, -22],
      ] as Array<[number, number]>) {
        ctx.line(
          [
            [rcx + dx * 0.4, rcy + dy * 0.4],
            [rcx + dx, rcy + dy],
          ],
          { color: vRole.color, width: 2 },
        );
      }
      if (vision?.icon) ctx.icon(vision.icon, rcx, doorB - doorH - 66, 32, vRole.color);
      if (vision) block(ctx, vision.label, vision.detail, xR + 28, doorB - doorH / 2, { color: vRole.color, align: "left", maxW: 230 });
    });
  },
});

// ---- hole ---------------------------------------------------------------------

/** Where the line through a→b (extended past b) first meets a polyline, searching from a. */
function railHit(a: [number, number], b: [number, number], poly: Array<[number, number]>): [number, number] | undefined {
  let best: { s: number; p: [number, number] } | undefined;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (let i = 0; i < poly.length - 1; i++) {
    const [px, py] = poly[i];
    const qx = poly[i + 1][0] - px;
    const qy = poly[i + 1][1] - py;
    const den = dx * qy - dy * qx;
    if (Math.abs(den) < 1e-9) continue;
    const s = ((px - a[0]) * qy - (py - a[1]) * qx) / den; // along the rail
    const u = ((px - a[0]) * dy - (py - a[1]) * dx) / den; // along the segment
    if (u < 0 || u > 1 || s < 0.5) continue;
    if (!best || s < best.s) best = { s, p: [a[0] + dx * s, a[1] + dy * s] };
  }
  return best?.p;
}

registerViz({
  name: "hole",
  aliases: ["pit"],
  category: "Visual Metaphors",
  summary: "A pit in the ground with a ladder out — the title carries the message.",
  entryKinds: [],
  options: [
    { name: "caption", type: "string", description: "message line below the pit" },
    { name: "pit", type: "string", description: "what the pit is, lettered inside it" },
    { name: "ladder", type: "string", description: "what the way out is, on a leader from the ladder's head" },
  ],
  generate(spec: VizSpec, ctx: VizContext) {
    const W = 820;
    const mouthW = 250;
    const pitL = (W - mouthW) / 2;
    const pitR = pitL + mouthW;
    const pitCx = (pitL + pitR) / 2;
    const depth = Math.round(mouthW * 1.05);
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
    // ladder geometry first: the hatching keeps clear of it
    const foot: [number, number] = [pitCx + 26, depth - 8];
    const head: [number, number] = [pitR - 24, -44];
    const nearLadder = (x: number, y: number): boolean => {
      const dx = head[0] - foot[0];
      const dy = head[1] - foot[1];
      const t = Math.max(0, Math.min(1, ((x - foot[0]) * dx + (y - foot[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - (foot[0] + dx * t), y - (foot[1] + dy * t)) < 30;
    };
    // depth hatching just inside the walls so the pit reads deep
    for (let k = 0; k < 9; k++) {
      const t = 0.1 + (0.8 * k) / 8;
      const [px, py] = wallPt(t);
      const inw = px < pitCx ? 1 : -1;
      if (nearLadder(px + inw * 14, py - 10)) continue;
      ctx.line(
        [
          [px + inw * 6, py - 4],
          [px + inw * 21, py - 15],
        ],
        { color: ctx.mutedInk, width: 1.4 },
      );
    }
    // a figure at the rim, peering in — someone is about to fall for this
    ctx.character("peering", pitL - 52, 0, 86, { color: ctx.ink });
    // ground = a plain line either side of the mouth + a couple of tufts, in
    // muted ink: colour is kept for the ladder alone ("the way out")
    const grass = ctx.mutedInk;
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
    for (const gx of [pitL - 16, pitR + 64, W - 70]) {
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
    for (let k = 0; k < 18; k++) {
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
    // ladder seated in the pit: both feet on the drawn floor, the head
    // leaning out over the right rim with both rails inside the mouth
    const lc = ctx.role(1, { n: 2 }).color;
    const len = Math.hypot(head[0] - foot[0], head[1] - foot[1]);
    const nx = -(head[1] - foot[1]) / len;
    const ny = (head[0] - foot[0]) / len;
    const rail = (side: number): [[number, number], [number, number]] => {
      const top: [number, number] = [head[0] + nx * side, head[1] + ny * side];
      const guess: [number, number] = [foot[0] + nx * side, foot[1] + ny * side];
      return [railHit(top, guess, wall) ?? guess, top];
    };
    const [r1b, r1t] = rail(-13);
    const [r2b, r2t] = rail(13);
    ctx.line([r1b, r1t], { color: lc, width: 2.6, id: ctx.uid("ladder") });
    ctx.line([r2b, r2t], { color: lc, width: 2.6 });
    // rungs every ~30u from just above the feet up to just below the rim
    const along = (a: [number, number], b: [number, number], y: number): [number, number] => {
      const t = (y - a[1]) / (b[1] - a[1]);
      return [lerp(a[0], b[0], t), y];
    };
    const yLow = Math.min(r1b[1], r2b[1]) - 18;
    const yHigh = 16;
    const rungs = Math.max(2, Math.round((yLow - yHigh) / 30) + 1);
    for (let k = 0; k < rungs; k++) {
      const y = lerp(yLow, yHigh, k / (rungs - 1));
      ctx.line([along(r1b, r1t, y), along(r2b, r2t, y)], { color: lc, width: 2.2 });
    }
    const pitLabel = optStr(spec.options, "pit");
    if (pitLabel) ctx.label(ctx.wrap(pitLabel, mouthW * 0.5, 19, "heading", 3), pitCx - mouthW * 0.18, depth * 0.5, { size: 19, color: ctx.mutedInk, weight: 700, font: "heading" });
    const ladderLabel = optStr(spec.options, "ladder");
    if (ladderLabel) {
      const hx = (r1t[0] + r2t[0]) / 2 + 10;
      const hy = (r1t[1] + r2t[1]) / 2;
      ctx.line([[hx + 8, hy - 4], [hx + 56, hy - 26]], { color: ctx.mutedInk, width: 1.5 });
      ctx.label(ctx.wrap(ladderLabel, 200, 19, "heading", 2), hx + 64, hy - 26, { size: 19, color: lc, weight: 700, font: "heading", align: "left" });
    }
    const caption = optStr(spec.options, "caption");
    if (caption) ctx.label(caption, W / 2, depth + 44, { size: 20, color: ctx.ink, maxW: W - 80 });
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
    // proportioned for the 16:9 band: a flight is two teeth, twice as long as
    // it is tall, so four levels come out ~1.8:1 with their labels and the fit
    // is no longer pinned by the stair's height
    const teeth = 2;
    const toothRise = 40;
    const toothRun = 64;
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
    // the ground the stair climbs from
    ctx.line([[-36, H], [n * flightRun + 36, H]], { color: ctx.preset.edge, width: 2 });
    // fat block arrow crowning the apex, pointing diagonally up-right
    const ux = Math.SQRT1_2;
    const uy = -Math.SQRT1_2;
    // the tail starts just past the top tread's end and above it, so neither
    // the tread nor the riser can run through the shaft; paper-filled so
    // nothing behind it ever shows through
    const ax = px + 6;
    const ay = py - 24;
    const shaft = 84;
    const headL = 54;
    const halfShaft = 20;
    const halfHead = 46;
    const P = (along: number, side: number): [number, number] => [ax + ux * along - uy * side, ay + uy * along + ux * side];
    ctx.poly(
      [P(0, -halfShaft), P(shaft, -halfShaft), P(shaft, -halfHead), P(shaft + headL, 0), P(shaft, halfHead), P(shaft, halfShaft), P(0, halfShaft)],
      { stroke: ctx.ink, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2.4, roughness: ctx.preset.roughness },
    );
    // per level: a short leader from the flight's top tread out to its own
    // label, alternating sides. Right-hand leaders run just UNDER the top
    // tread from its right end, left-hand ones just ABOVE it from its left
    // end — the only directions in which a horizontal line cannot cross the
    // stair. The icon sits inline between leader and text, in the label's band.
    const lead = 44;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const tread = H - i * flightRise - teeth * toothRise;
        const rightSide = i % 2 === 0;
        const dir = rightSide ? 1 : -1;
        const yA = tread + dir * 8;
        const sx = rightSide ? i * flightRun + teeth * toothRun - 4 : i * flightRun + (teeth - 1) * toothRun + 4;
        const ex = sx + dir * lead;
        ctx.line([[sx, yA], [ex, yA]], { color: ctx.mutedInk, width: 1.6 });
        dot(ctx, sx, yA, 9, role.color, 3);
        let tx = ex + dir * 10;
        if (item.icon) {
          ctx.icon(item.icon, tx + dir * 17, yA, 34, role.color);
          tx += dir * 44;
        }
        block(ctx, item.label, item.detail, tx, yA, { color: role.color, align: rightSide ? "left" : "right", maxW: 230 });
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
    const laneH = 96;
    const kw = 112;
    const kh = 58;
    // name column on the left, one lane per racer, checkered strip at the line
    const labelW = 52 + Math.max(120, ...items.map((it) => blockText(ctx, it.label, it.detail, { maxW: 190, size: 20 }).w));
    const finishX = labelW + 470;
    const H = n * laneH;

    // lane separators (solid track edges, dashed inner lines)
    for (let i = 0; i <= n; i++) {
      const y = i * laneH;
      if (i === 0 || i === n) ctx.line([[labelW - 16, y], [finishX + 54, y]], { color: ctx.ink, width: 2.2 });
      else ctx.line([[labelW - 16, y], [finishX + 54, y]], { color: ctx.mutedInk, width: 1.3, dash: true });
    }

    // checkered finish strip across every lane + the banner word
    const sq = 12;
    for (let r = 0; r < Math.ceil(H / sq); r++) {
      for (let c = 0; c < 2; c++) {
        if ((r + c) % 2 === 0) {
          ctx.shape("rectangle", finishX + c * sq, r * sq, sq, Math.min(sq, H - r * sq), { stroke: ctx.ink, fill: ctx.ink, fillStyle: "solid", strokeWidth: 0.8, roughness: 0.5 });
        }
      }
    }
    ctx.shape("rectangle", finishX, 0, sq * 2, H, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 1.6, roughness: ctx.preset.roughness });
    ctx.label(optStr(spec.options, "finish") ?? "FINISH", finishX + sq, -22, { size: 16, color: ctx.ink, weight: 700, font: "heading" });

    // karts, ranked: first place noses the line, each next further back
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const cy = i * laneH + laneH / 2;
        const front = finishX - 22 - i * 82 - Math.abs(jit(i, 12));
        ctx.path(KART_D, 102, 60, front - kw, cy - kh / 2 + 4, kw, kh, role, { id: ctx.uid(item.id) });
        // speed streaks trailing the kart
        ctx.line([[front - kw - 30, cy - 8], [front - kw - 10, cy - 8]], { color: ctx.mutedInk, width: 1.6 });
        ctx.line([[front - kw - 22, cy + 7], [front - kw - 5, cy + 7]], { color: ctx.mutedInk, width: 1.6 });
        // the name column is right-aligned onto its lane, so a short name is
        // never stranded far from the kart it belongs to
        block(ctx, item.label, item.detail, labelW - 30, cy, { color: role.color, align: "right", maxW: labelW - 44, size: 20 });
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
    const bubbleW = 400;
    const indent = 150;
    const size = 18;
    const pad = 20;
    const padY = 14;
    const tail = 14;
    const avatarW = 64;
    const avatarGap = 22;
    const fudge = 1.12; // the width estimate runs a few percent narrow of the hand face
    // a bubble path with a tail on the speaker's side, in a box that
    // includes the tail; returns the path and where the box sits
    const bubblePath = (bw: number, h: number, left: boolean, r: number): string => {
      const ty = Math.max(r + 8, Math.min(h - r - 8, h * 0.62));
      const L = left ? tail : 0;
      const R = L + bw;
      const f = (v: number) => Math.round(v * 10) / 10;
      const seg = [`M${f(L + r)},0`, `L${f(R - r)},0`, `Q${f(R)},0 ${f(R)},${f(r)}`];
      if (!left) seg.push(`L${f(R)},${f(ty - 7)}`, `L${f(R + tail)},${f(ty + 10)}`, `L${f(R)},${f(ty + 7)}`);
      seg.push(`L${f(R)},${f(h - r)}`, `Q${f(R)},${f(h)} ${f(R - r)},${f(h)}`, `L${f(L + r)},${f(h)}`, `Q${f(L)},${f(h)} ${f(L)},${f(h - r)}`);
      if (left) seg.push(`L${f(L)},${f(ty + 7)}`, `L0,${f(ty + 10)}`, `L${f(L)},${f(ty - 7)}`);
      seg.push(`L${f(L)},${f(r)}`, `Q${f(L)},0 ${f(L + r)},0`, "Z");
      return seg.join(" ");
    };
    const firstY: { a?: number; b?: number } = {};
    let y = 0;
    msgs.forEach((m, i) =>
      ctx.item(m.id, () => {
        const sp = (optStr(m.opts, "speaker") ?? (i % 2 === 0 ? "a" : "b")).toLowerCase();
        const isA = sp !== "b";
        const role = isA ? roleA : roleB;
        // symmetric padding with a safety margin on the width estimate, and
        // each bubble sized to its own text (short replies get short bubbles)
        const text = balancedWrap(ctx, m.label + (m.detail ? ` ${m.detail}` : ""), (bubbleW - 2 * pad) / fudge, size, 6);
        const tw = Math.max(...text.split("\n").map((l) => ctx.measure(l, size, "body")));
        const bw = Math.min(bubbleW, Math.ceil(tw * fudge) + 2 * pad);
        const h = measureBlock(text, size, ctx.font("body")).h + 2 * padY;
        const x = isA ? 0 : indent + bubbleW - bw;
        const r = Math.max(0, Math.min(role.roundness ?? 12, h / 2 - 9, 18));
        ctx.path(bubblePath(bw, h, isA, r), bw + tail, h, isA ? x - tail : x, y, bw + tail, h, role, { id: ctx.uid(m.id) });
        ctx.label(text, x + pad, y + h / 2, { size, color: role.textColor, align: "left", z: 3 });
        if (isA && firstY.a === undefined) firstY.a = y + h / 2;
        if (!isA && firstY.b === undefined) firstY.b = y + h / 2;
        y += h + 18;
      }),
    );
    // each speaker's bust sits in its own gutter beside its first bubble
    // (the tails point at it), the name under it
    const bust = (role: RoleStyle, cx: number, cy: number, name: string, hint: string): void => {
      ctx.path(BUST_D, 60, 58, cx - avatarW / 2, cy - 36, avatarW, 62, role, { id: ctx.uid(hint) });
      ctx.label(ctx.wrap(name, 130, 18, "heading", 2), cx, cy + 36, { size: 18, color: role.color, weight: 700, font: "heading", vAnchor: "top" });
    };
    const ax = -tail - avatarGap - avatarW / 2;
    const bx = indent + bubbleW + tail + avatarGap + avatarW / 2;
    scoped(ctx, speakers[0], () => bust(roleA, ax, firstY.a ?? 30, nameA, "speaker_a"));
    scoped(ctx, speakers[1], () => bust(roleB, bx, firstY.b ?? 30, nameB, "speaker_b"));
  },
});

// ---- pillar ---------------------------------------------------------------------

registerViz({
  name: "pillar",
  aliases: ["pillars"],
  category: "Visual Metaphors",
  summary: "Classical columns, one per pillar, icon + label in the shaft, holding up a shared architrave.",
  entryKinds: ["item", "pillar"],
  options: [{ name: "mission", type: "string", description: "what the pillars hold up, lettered on the architrave" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "pillar");
    const n = Math.max(items.length, 1);
    const mission = optStr(spec.options, "mission");
    const pitch = 196;
    const colW = 150;
    const shaftW = 106;
    const shaftH = 224;
    const abacusH = 18;
    const shaftY = abacusH + 12; // under the abacus and the echinus
    const baseY = shaftY + shaftH; // two base tiers, then the shared stylobate
    const stylobateY = baseY + 30;
    const spanW = (n - 1) * pitch + colW;
    // the entablature the columns hold up, and the stylobate they stand on:
    // plain stone (edge outline, neutral wash) so the columns carry the colour
    const stone = { stroke: ctx.preset.edge, fill: mix(ctx.preset.background, ctx.role(0, { neutral: true }).color, 0.22), fillStyle: "solid" as const, strokeWidth: 2, roughness: ctx.preset.roughness, roundness: 2 };
    const archH = mission ? 40 : 24;
    ctx.shape("rectangle", -14, -archH, spanW + 28, archH, stone, { z: 1, id: ctx.uid("architrave") });
    ctx.shape("rectangle", -26, -archH - 14, spanW + 52, 14, stone, { z: 1 });
    if (mission) ctx.label(ctx.wrap(mission, spanW - 20, 19, "heading", 1), spanW / 2, -archH / 2, { size: 19, color: ctx.ink, weight: 700, font: "heading", z: 3 });
    ctx.shape("rectangle", -26, stylobateY, spanW + 52, 16, stone, { z: 1 });
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const x = i * pitch;
        const cxC = x + colW / 2;
        const shaftX = x + (colW - shaftW) / 2;
        const sq = { ...role, roundness: 2 };
        // abacus, echinus, a gently tapered shaft, two base tiers — all
        // touching, square-cornered stone
        ctx.shape("rectangle", x, 0, colW, abacusH, sq, { z: 2 });
        ctx.poly(
          [
            [x + 10, abacusH],
            [x + colW - 10, abacusH],
            [shaftX + shaftW + 2, shaftY],
            [shaftX - 2, shaftY],
          ],
          sq,
          { z: 2 },
        );
        ctx.poly(
          [
            [shaftX, shaftY],
            [shaftX + shaftW, shaftY],
            [shaftX + shaftW + 4, baseY],
            [shaftX - 4, baseY],
          ],
          sq,
          { id: ctx.uid(item.id), z: 1 },
        );
        ctx.shape("rectangle", x + 12, baseY, colW - 24, 12, sq, { z: 2 });
        ctx.shape("rectangle", x, baseY + 12, colW, 18, sq, { z: 2 });
        // fluting lines in the lower shaft (content sits above them)
        for (const fx of [0.3, 0.5, 0.7]) {
          ctx.line(
            [
              [shaftX + shaftW * fx, shaftY + 148],
              [shaftX + shaftW * fx, baseY - 14],
            ],
            { color: role.textColor, width: 1.1, z: 3 },
          );
        }
        ctx.icon(item.icon, cxC, shaftY + 40, 40, role.textColor);
        ctx.label(ctx.wrap(item.label, shaftW - 14, 19, "heading", 3), cxC, shaftY + 102, {
          size: 19,
          color: role.textColor,
          weight: ctx.preset.fonts.headingWeight,
          font: "heading",
          z: 3,
        });
        // the caption: a compact block under this column only, with clear air
        // to its neighbours so the captions never run into one line
        if (item.detail) {
          ctx.label(ctx.wrap(item.detail, colW - 6, 17, "body", 3), cxC, stylobateY + 32, { size: 17, color: ctx.mutedInk, vAnchor: "top", role: "detail" });
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
    { name: "neck", type: "string", description: "caption naming the constraint, arrowed at the neck" },
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
    // circles crowd before the neck and pile up where it narrows: one
    // deterministic scatter, denser toward the neck (x drawn from a t^0.6
    // ramp), each candidate kept only if it clears every dot already placed
    // and the wall at BOTH of its edges (the taper is steepest there)
    const count = Math.max(6, Math.min(28, optNum(spec.options, "count") ?? 16));
    const R = 6;
    // the single-file line through the neck is seeded first so the crowd keeps clear of it
    const singleFile: Array<[number, number]> = [
      [258, -4],
      [314, 2],
      [360, -2],
      [406, 1],
    ];
    const placed: Array<[number, number]> = [...singleFile];
    const target = singleFile.length + count + 8;
    const x0 = 20;
    const x1 = neckL - 12;
    for (let k = 0; k < 400 && placed.length < target; k++) {
      const u = (k * 0.618034) % 1;
      const v = (k * 0.414214 + 0.5 * ((k * 0.7548777) % 1)) % 1;
      const bx = x0 + (x1 - x0) * u ** 0.6;
      const clear = Math.min(half(bx - R), half(bx + R)) - R - 5;
      if (clear < 3) continue;
      const by = -clear + v * clear * 2;
      if (placed.some(([px, py]) => Math.hypot(px - bx, py - by) < 2 * R + 5)) continue;
      placed.push([bx, by]);
    }
    // (…then go single-file through the neck, drawn in the same pass)
    for (const [bx, by] of placed) ctx.shape("circle", bx - R, by - R, 2 * R, 2 * R, role);
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
    // name the constraint: an arrow pointing straight at the neck
    const neckCap = optStr(spec.options, "neck");
    if (neckCap) {
      const ncx = (neckL + neckR) / 2;
      ctx.arrow(ncx, halfNeck + 92, ncx, halfNeck + 18, { color: ctx.ink, width: 2 });
      ctx.label(ctx.wrap(neckCap, 220, 17, "heading", 2), ncx, halfNeck + 112, { size: 17, color: ctx.ink, weight: 700, font: "heading", vAnchor: "top" });
    }
  },
});

// ---- iceberg ---------------------------------------------------------------------

type Pt = [number, number];

/** Clip a closed polygon to the half-plane y >= y0 (Sutherland–Hodgman, one edge). */
function clipBelow(pts: Pt[], y0: number): Pt[] {
  const out: Pt[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const aIn = a[1] >= y0;
    if (aIn) out.push(a);
    if (aIn !== b[1] >= y0) out.push([a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]);
  });
  return out;
}

/** Leftmost (side -1) or rightmost (side 1) x at which the line y crosses a closed polygon. */
function polyEdgeX(pts: Pt[], y: number, side: -1 | 1): number | undefined {
  let best: number | undefined;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) return;
    const x = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    if (best === undefined || (side < 0 ? x < best : x > best)) best = x;
  });
  return best;
}

/** The preset's coolest palette colour (falls back to its neutral) — ice has to read as ice in every look. */
function iceColor(ctx: VizContext): string {
  let best = ctx.preset.neutral;
  let bestD = 70;
  for (const c of ctx.preset.palette) {
    const rgb = parseHex(c);
    if (!rgb) continue;
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === 0 || (max - min) / max < 0.2) continue; // too grey to carry a hue
    const d = max - min;
    const hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    const dist = Math.abs((((hue - 205) % 360) + 540) % 360 - 180);
    if (dist < bestD) {
      best = c;
      bestD = dist;
    }
  }
  return best;
}

/** One berg outline, tip then mass, in local units (waterline at y = 0). */
const BERG: Pt[] = (
  [
    [322, 0],
    [372, -58],
    [404, -34],
    [446, -120],
    [482, -52],
    [516, -80],
    [562, 0],
    [602, 96],
    [548, 162],
    [578, 232],
    [500, 296],
    [448, 350],
    [396, 292],
    [330, 220],
    [352, 140],
    [300, 78],
  ] as Pt[]
).map(([x, y]) => [Math.round((x - 442) * 1.3), Math.round(y < 0 ? y * 1.05 : y * 0.78)]);

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

    // ONE silhouette: the whole berg in the pale above-water tone, the part
    // under the waterline laid over it in the deeper tone, one outline on top.
    // The berg keeps ice tones under every palette; item colour lives on the
    // labels and leader dots only.
    const ice = iceColor(ctx);
    const bg = ctx.preset.background;
    const outline = mix(ice, ctx.ink, 0.35);
    const flat = (fill: string) => ({ stroke: "transparent", fill, fillStyle: "solid" as const, strokeWidth: 0, roughness: 0 });
    scoped(ctx, aboveItems[0], () => ctx.poly(BERG, flat(mix(bg, ice, 0.12)), { id: aboveItems[0] ? ctx.uid(aboveItems[0].id) : ctx.uid("peak"), z: 0 }));
    scoped(ctx, belowItems[0], () => ctx.poly(clipBelow(BERG, 0), flat(mix(bg, ice, 0.3)), { id: belowItems[0] ? ctx.uid(belowItems[0].id) : ctx.uid("mass"), z: 1 }));
    ctx.poly(BERG, { stroke: outline, fill: null, fillStyle: "none", strokeWidth: 2.4, roughness: ctx.preset.roughness }, { id: ctx.uid("berg"), z: 2 });

    const minX = Math.min(...BERG.map((p) => p[0]));
    const maxX = Math.max(...BERG.map((p) => p[0]));
    const maxY = Math.max(...BERG.map((p) => p[1]));
    const minY = Math.min(...BERG.map((p) => p[1]));
    const colGap = 70; // berg edge → label column
    let left = minX - colGap;
    let right = maxX + colGap;

    // label blocks in two columns either side of the berg; each leader runs
    // level from its block to a dot just inside the berg's edge at that depth
    const entry = (item: VizItem, role: RoleStyle, y: number, side: -1 | 1): void => {
      const edge = polyEdgeX(BERG, y, side) ?? (side < 0 ? minX : maxX);
      const endX = edge - side * 16;
      const col = side < 0 ? minX - colGap : maxX + colGap;
      const b = block(ctx, item.label, item.detail, col, y, { color: role.color, align: side < 0 ? "right" : "left", maxW: 280 });
      left = Math.min(left, b.x);
      right = Math.max(right, b.x + b.w);
      let lx = col - side * 12;
      if (item.icon) {
        ctx.icon(item.icon, lx - side * 16, y, 30, role.color);
        lx -= side * 38;
      }
      ctx.line([[lx, y], [endX, y]], { color: ctx.mutedInk, width: 1.5 });
      dot(ctx, endX, y, 8, role.color, 3);
    };
    // above-water items spread over the tip, below-water ones over the mass;
    // sides alternate so each column carries half the entries
    const spread = (j: number, count: number, a: number, b: number): number => (count === 1 ? (a + b) / 2 : lerp(a, b, j / (count - 1)));
    aboveItems.forEach((item, j) =>
      ctx.item(item.id, () => entry(item, roleOf(item, j), spread(j, aboveItems.length, minY * 0.72, minY * 0.3), j % 2 === 0 ? -1 : 1)),
    );
    const firstBelow: -1 | 1 = aboveItems.length ? 1 : -1;
    belowItems.forEach((item, j) =>
      ctx.item(item.id, () => {
        const y = spread(j, belowItems.length, 56, maxY - 64);
        entry(item, roleOf(item, aboveItems.length + j), y, (j % 2 === 0 ? firstBelow : -firstBelow) as -1 | 1);
      }),
    );

    // the waterline: two wave runs that stop at the berg, flattening as they
    // reach it so each lands exactly on the outline
    const xl0 = polyEdgeX(BERG, 0, -1) ?? minX;
    const xr0 = polyEdgeX(BERG, 0, 1) ?? maxX;
    const wave = (a: number, b: number, meet: number): Pt[] => {
      const pts: Pt[] = [];
      const steps = Math.max(2, Math.ceil(Math.abs(b - a) / 14));
      for (let s = 0; s <= steps; s++) {
        const x = lerp(a, b, s / steps);
        pts.push([x, Math.sin(x / 30) * 5 * Math.min(1, Math.abs(x - meet) / 40)]);
      }
      return pts;
    };
    ctx.line(wave(left - 20, xl0, xl0), { color: ctx.mutedInk, width: 1.8 });
    ctx.line(wave(xr0, right + 20, xr0), { color: ctx.mutedInk, width: 1.8 });
  },
});
