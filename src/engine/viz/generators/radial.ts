/**
 * Radial visualizations: pie, gauge, cycle, bullseye, relationship, porters,
 * impact, performance. Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { VizBounds } from "../types.js";
import type { RoleOptions, RoleStyle } from "../../style/presets.js";
import { contrastRatio, mix } from "../../style/color.js";
import { polar, rad, radialAlign, radialLabel } from "./util.js";

/**
 * A role for a mark whose FILL is the datum (a pie slice, a dial's value band).
 * A soft preset's near-white tint — right for a container — cannot carry a
 * value: two neighbouring slices, or a value band over its track, become two
 * near-whites told apart only by a hairline. Soft and outline presets are
 * pushed to `strength` of the hue over the paper (the text colour re-picked for
 * it); presets whose fill already reads (solid, translucent, gradient, ramp)
 * are left alone.
 */
function dataRole(ctx: VizContext, i: number, opts: RoleOptions, strength = 0.45): RoleStyle {
  const role = ctx.role(i, opts);
  const mode = ctx.preset.fillMode;
  if (mode !== "soft" && mode !== "outline") return role;
  const fill = mix(ctx.preset.background, role.color, strength);
  const bg = ctx.preset.background;
  const textColor = contrastRatio(ctx.ink, fill) >= contrastRatio(bg, fill) ? ctx.ink : bg;
  return { ...role, fill, fillStyle: ctx.preset.fillStyle === "none" ? "solid" : ctx.preset.fillStyle, textColor };
}

/** The same role with its outline dropped — a fill whose edge another shape draws. */
const fillOnly = (role: RoleStyle): RoleStyle => ({ ...role, stroke: "none", strokeWidth: 0 });

/**
 * A label+detail block outside a circle of radius `r` at `deg`, placed so the
 * block's NEAREST point to the centre sits exactly `gap` off the rim — the
 * same air for every label, whatever its size or angle. (util.radialLabel
 * pushes the block's centre out by its projected half-extent instead, so a
 * wide label near a diagonal drifts twice as far as one on an axis.) A block
 * above or below the circle (|cos| small) centres on the circle's own x
 * rather than drifting sideways along the ray.
 */
function rimLabel(
  ctx: VizContext,
  cx: number,
  cy: number,
  r: number,
  deg: number,
  label: string,
  detail: string | undefined,
  color: string,
  opts: { maxW?: number; gap?: number; size?: number } = {},
): VizBounds {
  const gap = opts.gap ?? 16;
  const maxW = opts.maxW ?? 200;
  const m = ctx.measureLabelBlock(label, detail, { maxW, size: opts.size });
  const s = Math.sin(rad(deg));
  const align = radialAlign(deg);
  const vAnchor: "top" | "bottom" | "middle" = s > 0.35 ? "top" : s < -0.35 ? "bottom" : "middle";
  const place = (d: number) => {
    const [px, py] = polar(cx, cy, d, deg);
    const ax = align === "center" ? cx : px;
    const left = align === "left" ? ax : align === "right" ? ax - m.w : ax - m.w / 2;
    const top = vAnchor === "top" ? py : vAnchor === "bottom" ? py - m.h : py - m.h / 2;
    const nx = Math.max(left, Math.min(cx, left + m.w));
    const ny = Math.max(top, Math.min(cy, top + m.h));
    return { ax, ay: py, near: Math.hypot(nx - cx, ny - cy) };
  };
  let d = r + gap;
  let p = place(d);
  // an axis-anchored block can reach back toward the centre past its anchor
  // (a centred block's corner, a side block's mid-edge): step it out until it clears
  for (let k = 0; k < 6 && p.near < r + gap - 0.5; k++) {
    d += r + gap - p.near;
    p = place(d);
  }
  return ctx.labelBlock(label, detail, p.ax, p.ay, { color, align, maxW, vAnchor, size: opts.size });
}

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
    const R = D / 2;
    // The slices are FILLS only; their edges are drawn once, below, as one rim
    // and n seams. Outlining each slice on its own gave every slice its own
    // jittered arc, and the rim visibly stepped wherever the colour changed.
    const bounds: number[] = [];
    let angle = -90;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = dataRole(ctx, i, { n, color: item.color });
        const frac = (item.value ?? 1) / total;
        const sweep = frac * 360;
        ctx.shape("sector", cx - R, cy - R, D, D, fillOnly(role), {
          id: ctx.uid(item.id),
          data: { start: angle, end: angle + sweep, inner },
        });
        const mid = angle + sweep / 2;
        const pct = Math.round(frac * 100);
        const pctText = ctx.showValue(item) ? `${pct}% ` : "";
        const gap = 18;
        rimLabel(ctx, cx, cy, R, mid, `${pctText}${item.label}`, item.detail, role.color, { maxW: 190, gap });
        // a thin slice's label is easy to hand to its neighbour: tie it to its slice
        if (frac < 0.15 && n > 1) ctx.line([polar(cx, cy, R + 3, mid), polar(cx, cy, R + gap - 3, mid)], { color: ctx.mutedInk, width: 1.2 });
        if (item.icon) {
          const [ix, iy] = polar(cx, cy, R * (inner ? (1 + inner) / 2 : 0.62), mid);
          ctx.icon(item.icon, ix, iy, 28, role.textColor);
        }
        bounds.push(angle);
        angle += sweep;
      }),
    );
    if (ctx.preset.strokeMode !== "none") {
      const seam = ctx.preset.strokeMode === "seam" ? ctx.preset.background : ctx.preset.edge;
      const edge = { stroke: seam, fill: null, fillStyle: "none" as const, strokeWidth: Math.min(2, ctx.preset.strokeWidth), roughness: ctx.preset.roughness };
      ctx.shape("circle", cx - R, cy - R, D, D, edge, { id: ctx.uid("rim") });
      if (inner) ctx.shape("circle", cx - R * inner, cy - R * inner, D * inner, D * inner, edge, { id: ctx.uid("rim_inner") });
      if (items.length > 1) for (const a of bounds) ctx.line([polar(cx, cy, R * inner, a), polar(cx, cy, R, a)], { color: seam, width: edge.strokeWidth });
    }
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
    const role = dataRole(ctx, 0, { n: 1, color: items[0]?.color }, 0.7);
    // A dial's whole job is "how full", so the value band is a real fill of the
    // hue over a pale neutral track — and the band is fill-only, with ONE track
    // outline drawn over both, so no radial cap strokes cross the band.
    const track = ctx.role(0, { neutral: true });
    ctx.shape("sector", cx - D / 2, cy - D / 2, D, D, fillOnly(track), {
      data: { start, end: start + sweep, inner: 0.72 },
      style: { opacity: 55 },
    });
    ctx.shape("sector", cx - D / 2, cy - D / 2, D, D, fillOnly(role), {
      id: ctx.uid("value"),
      // short of full keeps a visible gap rather than a hairline sliver
      data: { start, end: start + (value >= 99.5 ? sweep : Math.min((sweep * value) / 100, sweep - 6)), inner: 0.72 },
    });
    ctx.shape("sector", cx - D / 2, cy - D / 2, D, D, { ...role, fill: null, fillStyle: "none" }, {
      id: ctx.uid("track"),
      data: { start, end: start + sweep, inner: 0.72 },
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
    // a ring that fills the band: the fit is height-bound, so every unit of R
    // is type size on screen
    const R = big ? 190 : 205;
    const nodeR = big ? 70 : 5;
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
          if (item.icon) ctx.icon(item.icon, nx, ny, 48, role.textColor);
          else ctx.label(String(i + 1), nx, ny, { size: 32, color: role.textColor, weight: 700, font: "heading" });
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
      ctx.item(item.id, () => {
        if (!big) {
          radialLabel(ctx, cx, cy, R + nodeR + 10, a, item.label, item.detail, role.color, { maxW: 210 });
          return;
        }
        // Big nodes carry their label BESIDE them, so the labels widen the
        // figure instead of stacking above and below it (the fit is
        // height-bound: height saved is type size gained). A node at 12 or 6
        // o'clock takes its label at a diagonal, above/below the arrow bands —
        // straight above, it read as a second header line under the title.
        const c = Math.cos(rad(a));
        const deg = c > 0.35 ? 0 : c < -0.35 ? 180 : Math.sin(rad(a)) < 0 ? -40 : 40;
        rimLabel(ctx, nx, ny, nodeR, deg, item.label, item.detail, role.color, { maxW: 210, gap: 16 });
      });
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
    // the text column is right-aligned just left of the target, so every leader
    // is short and the two halves read as one figure
    const textRight = cx - outerR - 44;
    // label pitch grows to fit the tallest block (long descriptions)
    const labelH = Math.max(0, ...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: 240 }).h));
    const labelPitch = Math.max(72, labelH + 20);
    // the leaders fan: the top label reaches up-left into its ring, the middle
    // one straight across, the bottom one down-left — so they never cross
    const spanY = ((n - 1) * labelPitch) / 2;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const r = outerR * (1 - i / n);
        const innerRatio = i === n - 1 ? 0 : (outerR * (1 - (i + 1) / n)) / r;
        ctx.shape("sector", cx - r, cy - r, r * 2, r * 2, role, {
          id: ctx.uid(item.id),
          data: { start: 0, end: 359.999, inner: innerRatio },
        });
        // the stack is centred on the target, and each leader ends IN its own
        // band (on the band's mid-radius), marked with a dot
        const ly = cy - spanY + i * labelPitch;
        const rMid = i === n - 1 ? r * 0.5 : (r + innerRatio * r) / 2;
        const fan = spanY > 0 ? ((ly - cy) / spanY) * 48 : 0;
        const [tx, ty] = polar(cx, cy, rMid, 180 - fan);
        ctx.labelBlock(item.label, item.detail, textRight, ly, { color: role.color, align: "right", maxW: 240 });
        ctx.line(
          [
            [textRight + 12, ly],
            [tx, ty],
          ],
          { color: ctx.mutedInk, width: 1.4 },
        );
        ctx.shape("circle", tx - 4, ty - 4, 8, 8, { stroke: ctx.ink, fill: ctx.ink, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 });
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
    // An elliptical orbit uses the wide band (a circle left the card a small
    // square in the middle of the frame).
    const Rx = 250;
    const Ry = 175;
    const r = 36;
    const hubR = 64;
    const cx = Rx + 240;
    const cy = Ry + 70;
    const orbitAt = (deg: number): [number, number] => [cx + Math.cos(rad(deg)) * Rx, cy + Math.sin(rad(deg)) * Ry];
    // one dashed orbit through the satellites
    const orbit: Array<[number, number]> = [];
    for (let s = 0; s <= 72; s++) orbit.push(orbitAt((360 * s) / 72));
    ctx.line(orbit, { color: ctx.mutedInk, width: 1.2, dash: true, z: -1 });
    // hub (item-scoped when the center IS a data entry): its icon AND its name
    const hubRole = center?.color ? ctx.role(0, { color: center.color }) : ctx.role(0, { emphasis: true, n: n + 1 });
    const drawHub = () => {
      ctx.shape("circle", cx - hubR, cy - hubR, hubR * 2, hubR * 2, hubRole, { id: ctx.uid("hub") });
      const name = center?.label ? ctx.wrap(center.label, hubR * 1.6, 16, "heading", 3) : "";
      // a name that needs two lines takes the whole disc; the icon gives way
      const showIcon = !!center?.icon && !name.includes("\n");
      if (showIcon) ctx.icon(center?.icon, cx, name ? cy - 16 : cy, name ? 34 : 44, hubRole.textColor);
      if (name) ctx.label(name, cx, showIcon ? cy + 22 : cy, { size: 16, color: hubRole.textColor, weight: 700, font: "heading" });
    };
    if (center) ctx.item(center.id, drawHub);
    else drawHub();
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const a = -90 + (360 / n) * i;
        const [sx, sy] = orbitAt(a);
        // the spoke: the one relationship the diagram asserts, hub to satellite
        const len = Math.hypot(sx - cx, sy - cy) || 1;
        const ux = (sx - cx) / len;
        const uy = (sy - cy) / len;
        ctx.line(
          [
            [cx + ux * (hubR + 2), cy + uy * (hubR + 2)],
            [sx - ux * (r + 2), sy - uy * (r + 2)],
          ],
          { color: ctx.preset.edge, width: 1.6, z: -1 },
        );
        ctx.shape("circle", sx - r, sy - r, r * 2, r * 2, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, sx, sy, 32, role.textColor);
        // the label beside its own satellite, pushed out along the spoke (across
        // the orbit, which runs through the satellite, never along it)
        const out = (Math.atan2(uy, ux) * 180) / Math.PI;
        rimLabel(ctx, sx, sy, r, out, item.label, item.detail, role.color, { maxW: 220, gap: 12 });
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
  // `center`/`rivalry` names the force the others act on; without one, a
  // five-force list promotes its FIRST item (conventionally rivalry) to the centre
  entryKinds: ["item", "force", "center", "rivalry"],
  sweetSpot: { min: 4, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const forces = itemsOf(spec, "item", "force");
    const explicit = spec.items.find((i) => i.kind === "center" || i.kind === "rivalry");
    const center = explicit ?? (forces.length === 5 ? forces[0] : undefined);
    const items = center && !explicit ? forces.slice(1) : forces;
    const n = Math.max(items.length, 2);
    // wide, not round: the side forces sit far out on the band, the top and
    // bottom ones closer in with their labels beside them, not above/below
    const Rx = 270;
    const Ry = 190;
    const r = 50;
    const hubR = center ? 78 : 22;
    const cx = Rx + 280;
    const cy = Ry + 60;
    const total = n + (center ? 1 : 0);
    // the centre: the force the others act on (a quiet hub when there is none)
    const hubRole = center ? ctx.role(0, { n: total, color: center.color }) : ctx.role(0, { neutral: true });
    const drawHub = () => {
      ctx.shape("circle", cx - hubR, cy - hubR, hubR * 2, hubR * 2, hubRole, { id: ctx.uid(center?.id ?? "center") });
      if (!center) return;
      const name = ctx.wrap(center.label, hubR * 1.55, 18, "heading", 2);
      const detail = center.detail ? ctx.wrap(center.detail, hubR * 1.5, 13, "body", 2) : "";
      const nameH = name.split("\n").length * 22;
      const detailH = detail ? detail.split("\n").length * 17 + 4 : 0;
      const iconH = center.icon ? 34 : 0;
      let y = cy - (iconH + nameH + detailH) / 2;
      if (center.icon) ctx.icon(center.icon, cx, y + 14, 28, hubRole.textColor);
      y += iconH;
      ctx.label(name, cx, y + nameH / 2, { size: 18, color: hubRole.textColor, weight: 700, font: "heading" });
      y += nameH;
      if (detail) ctx.label(detail, cx, y + 4 + (detailH - 4) / 2, { size: 13, color: hubRole.textColor, role: "detail" });
    };
    if (center) ctx.item(center.id, drawHub);
    else drawHub();
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i + (center ? 1 : 0), { n: total, color: item.color });
        // four forces take the textbook cross in source order: top, left,
        // right, bottom (entrants / suppliers / buyers / substitutes)
        const a = n === 4 ? [-90, 180, 0, 90][i] : -90 + (360 / n) * i;
        const sx = cx + Math.cos(rad(a)) * Rx;
        const sy = cy + Math.sin(rad(a)) * Ry;
        const len = Math.hypot(sx - cx, sy - cy) || 1;
        const ux = (sx - cx) / len;
        const uy = (sy - cy) / len;
        // spoke pointing inward (owned by this force), stopping clear of the centre
        ctx.arrow(sx - ux * (r + 8), sy - uy * (r + 8), cx + ux * (hubR + 8), cy + uy * (hubR + 8), { color: ctx.mutedInk, width: 1.6 });
        ctx.shape("circle", sx - r, sy - r, r * 2, r * 2, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, sx, sy, 36, role.textColor);
        else ctx.label(String(i + 1), sx, sy, { size: 26, color: role.textColor, weight: 700, font: "heading" });
        // side forces label outward; top/bottom ones label to their right,
        // which keeps the figure wide instead of stacking labels over the title
        const out = (Math.atan2(uy, ux) * 180) / Math.PI;
        const deg = Math.abs(Math.cos(rad(out))) < 0.35 ? 0 : out;
        rimLabel(ctx, sx, sy, r, deg, item.label, item.detail, role.color, { maxW: 210, gap: 14 });
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
    // the fan is centred on 12 o'clock and widens with the count, so the
    // effects sit symmetrically ABOVE the cause (the fitted camera centres it)
    const spread = n === 1 ? 0 : Math.min(150, 55 * (n - 1));
    const spreadStart = 270 - spread / 2;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i + 1, { n: n + 1, color: item.color });
        const a = n === 1 ? -90 : spreadStart + (spread / (n - 1)) * i;
        const dist = 210;
        const [ex, ey] = polar(cx, cy, dist, a);
        const r = 44;
        // a straight radial stem (cause -> this effect, owned by the effect):
        // its head aims at the effect's centre by construction, and every head
        // stops the same few units off its circle
        const [s1x, s1y] = polar(cx, cy, causeR + 6, a);
        const [s2x, s2y] = polar(cx, cy, dist - r - 4, a);
        ctx.arrow(s1x, s1y, s2x, s2y, { color: ctx.mutedInk, width: 1.8 });
        ctx.shape("circle", ex - r, ey - r, r * 2, r * 2, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, ex, ey, 30, role.textColor);
        else ctx.label(String(i + 1), ex, ey, { size: 24, color: role.textColor, weight: 700, font: "heading" });
        // label immediately beside its own circle (reference keeps them adjacent)
        rimLabel(ctx, ex, ey, r, a, item.label, item.detail, role.color, { maxW: 200, gap: 10 });
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
        // pale track, value band as a real fill (fill-only: no radial cap
        // strokes), then ONE ring outline over both. A value short of full
        // keeps a deliberate gap — 99% must not read as a hairline crack.
        const frac = value / 100;
        const bandEnd = frac >= 0.995 ? 359.99 : Math.min(frac * 360, 352);
        const band = dataRole(ctx, i, { n, color: item.color }, 0.7);
        ctx.shape("sector", cxP - D / 2, gy, D, D, fillOnly(ctx.role(i, { neutral: true })), { data: { start: 0, end: 359.999, inner: 0.74 }, style: { opacity: 55 } });
        ctx.shape("sector", cxP - D / 2, gy, D, D, fillOnly(band), { id: ctx.uid(item.id), data: { start: -90, end: -90 + bandEnd, inner: 0.74 } });
        ctx.shape("sector", cxP - D / 2, gy, D, D, { ...role, fill: null, fillStyle: "none" }, { data: { start: 0, end: 359.999, inner: 0.74 } });
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
