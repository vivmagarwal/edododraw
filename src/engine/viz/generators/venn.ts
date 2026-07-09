/**
 * Venn diagrams — 2–3 true circles (translucent overlap), 4–6 rotated-ellipse
 * flower. Region labels sit outside the figure per the reference design.
 * Overlap entries (`overlap [a, b] "Label"`) label pairwise/center regions.
 */

import { registerViz } from "../registry.js";
import { withAlpha } from "../../style/color.js";
import { itemsOf, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { RoleStyle } from "../../style/presets.js";
import { polar, rad, radialLabel } from "./util.js";

/**
 * Venn fills must stay readable when regions overlap, so solid/ramp presets
 * are softened to a translucent tint of the role color (punchier on dark
 * canvases); outline presets stay outline-only. Ink-outline presets keep
 * their neutral structural stroke.
 */
function vennRole(ctx: VizContext, role: RoleStyle): RoleStyle {
  if (role.fill === null) return role;
  const alpha = ctx.preset.mode === "dark" ? 0.48 : 0.3;
  const stroke = ctx.preset.strokeMode === "ink" ? ctx.preset.ink : role.color;
  return { ...role, fill: withAlpha(role.color, alpha), stroke, fillStyle: "solid" };
}

/** Ellipse outline sampled as a closed polygon (supports rotation). */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number, rotDeg: number, segs = 56): Array<[number, number]> {
  const rot = rad(rotDeg);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < segs; i++) {
    const t = (2 * Math.PI * i) / segs;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

registerViz({
  name: "venn",
  category: "Comparison",
  summary: "Overlapping sets (2–3 circles, 4–6 ellipse petals) with region labels.",
  generate(spec: VizSpec, ctx: VizContext) {
    const sets = itemsOf(spec, "item", "set");
    const overlaps = spec.items.filter((i) => i.kind === "overlap" || i.kind === "intersection" || i.kind === "both" || i.kind === "all");
    const n = Math.max(2, Math.min(sets.length, 6));
    if (sets.length > 6) {
      ctx.diags.warn("W-VIZ-VENN", `venn supports up to 6 sets; got ${sets.length} — extra sets are dropped`, { line: 1, col: 1, start: 0, end: 0 }, { hint: "split into two diagrams or use a relationship viz" });
    }
    const used = sets.slice(0, n);
    const cx = 420;
    const cy = 300;

    /** Center of each set's circle/petal + its outward label direction. */
    const centers: Array<{ x: number; y: number; angle: number }> = [];

    if (n <= 3) {
      const R = 125; // circle radius
      const d = n === 2 ? 72 : 82; // center offset from figure center
      for (let i = 0; i < n; i++) {
        const a = n === 2 ? (i === 0 ? 180 : 0) : -90 + i * 120;
        const [sx, sy] = polar(cx, cy, d, a);
        centers.push({ x: sx, y: sy, angle: a });
      }
      used.forEach((item, i) => {
        const role = vennRole(ctx, ctx.role(i, { n, color: item.color }));
        const c = centers[i];
        ctx.shape("circle", c.x - R, c.y - R, R * 2, R * 2, role, { id: ctx.uid(item.id) });
      });
      // set labels outside their circle, away from the figure center
      used.forEach((item, i) => {
        const role = ctx.role(i, { n, color: item.color });
        const c = centers[i];
        radialLabel(ctx, c.x, c.y, R, c.angle, item.label, item.detail, role.color, { maxW: 200 });
        if (item.icon) {
          const [ix, iy] = polar(c.x, c.y, R * 0.45, c.angle);
          ctx.icon(item.icon, ix, iy, 32, role.color);
        }
      });
      // overlap labels: placed outward through the region so nothing collides —
      // pairs use the mean of their set angles; the all-sets region uses the
      // remaining free direction (up for 2 sets, right for 3).
      const idOf = (s: string) => used.findIndex((u) => u.id === s || u.label.toLowerCase() === s.toLowerCase());
      const figureR = (n === 2 ? 72 : 82) + R;
      overlaps.forEach((ov, k) => {
        const named = [...ov.strings, ...(ov.to ? [ov.to] : []), ...(ov.opts.sets && Array.isArray(ov.opts.sets) ? (ov.opts.sets as string[]) : [])];
        let members = named.map(idOf).filter((i) => i >= 0);
        if (ov.kind === "all" || members.length < 2) members = used.map((_, i) => i).slice(0, ov.kind === "all" || !members.length ? n : 2);
        const all = members.length >= n;
        const mx = members.reduce((s, i) => s + centers[i].x, 0) / members.length;
        const my = members.reduce((s, i) => s + centers[i].y, 0) / members.length;
        const role = ctx.role(n + k, { n: n + overlaps.length });
        if (ov.icon) ctx.icon(ov.icon, mx, my, 28, role.color);
        const meanAngle = (Math.atan2(members.reduce((s, i) => s + Math.sin(rad(centers[i].angle)), 0), members.reduce((s, i) => s + Math.cos(rad(centers[i].angle)), 0)) * 180) / Math.PI;
        const outAngle = all ? (n === 2 ? -90 : 0) : meanAngle;
        const block = radialLabel(ctx, cx, cy, figureR + 8, outAngle, ov.label, ov.detail, role.color, { maxW: 190 });
        // dotted leader from the region straight to the label's nearest edge,
        // vertically centered on the block so text and pointer read as one
        const bcx = block.x + block.w / 2;
        const bcy = block.y + block.h / 2;
        const ex = Math.abs(mx - bcx) > block.w / 2 + 4 ? (mx < bcx ? block.x - 8 : block.x + block.w + 8) : bcx;
        const ey = ex === bcx ? (my < bcy ? block.y - 8 : block.y + block.h + 8) : bcy;
        const dl = Math.hypot(ex - mx, ey - my) || 1;
        ctx.line(
          [
            [mx + ((ex - mx) / dl) * 22, my + ((ey - my) / dl) * 22],
            [ex, ey],
          ],
          { color: ctx.mutedInk, width: 1.2, dotted: true },
        );
      });
    } else {
      // 4–6 sets: rotated-ellipse flower
      const rx = 150;
      const ry = 78;
      used.forEach((item, i) => {
        const rot = (180 / n) * i - 90;
        const role = vennRole(ctx, ctx.role(i, { n, color: item.color }));
        const off = 40;
        const a = rot + 90;
        const [ex, ey] = polar(cx, cy, off, a);
        ctx.poly(ellipsePoints(ex, ey, rx, ry, rot), role, { id: ctx.uid(item.id) });
      });
      used.forEach((item, i) => {
        const rot = (180 / n) * i - 90;
        const a = rot + 90;
        const role = ctx.role(i, { n, color: item.color });
        radialLabel(ctx, cx, cy, rx + 60, a, item.label, item.detail, role.color, { maxW: 190 });
      });
    }
  },
});
