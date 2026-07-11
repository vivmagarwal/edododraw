/**
 * Venn diagrams — a symmetric rosette of N equal overlapping circles (2–7),
 * exactly like the reference set: circle centres sit on a ring, adjacent
 * circles overlap, and the ring radius grows with N so 2 circles read as a
 * lens and 6–7 as a pinwheel rosette. Set labels + icons hug each circle's
 * outer lobe; `overlap [a, b] "Label"` / `overlap all "Label"` label the
 * shared regions.
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
  const alpha = ctx.preset.mode === "dark" ? 0.46 : 0.28;
  const stroke = ctx.preset.strokeMode === "ink" ? ctx.preset.ink : role.color;
  return { ...role, fill: withAlpha(role.color, alpha), stroke, fillStyle: "solid" };
}

registerViz({
  name: "venn",
  category: "Comparison",
  summary: "Overlapping sets (2–7 circles) in a symmetric rosette with region labels.",
  entryKinds: ["item", "set", "overlap", "intersection", "both", "all"],
  sweetSpot: { min: 2, max: 3 },
  generate(spec: VizSpec, ctx: VizContext) {
    const sets = itemsOf(spec, "item", "set");
    const overlaps = spec.items.filter((i) => i.kind === "overlap" || i.kind === "intersection" || i.kind === "both" || i.kind === "all");
    const n = Math.max(2, Math.min(sets.length, 7));
    if (sets.length > 7) {
      ctx.diags.warn("W-VIZ-VENN", `venn supports up to 7 sets; got ${sets.length} — extra sets are dropped`, { line: 1, col: 1, start: 0, end: 0 }, { hint: "split into two diagrams or use a relationship viz" });
    }
    const used = sets.slice(0, n);
    const cx = 440;
    const cy = 340;
    // circle radius + ring radius: d/R climbs with N so 2 circles overlap like
    // a lens and 6–7 spread into a rosette (each overlapping only its neighbours).
    const R = n >= 5 ? 118 : 130;
    const d = R * (0.42 + 0.09 * n);
    const startA = n === 2 ? 180 : -90; // set 0 on the left (n=2) or on top (n≥3)

    const centers = used.map((_, i) => {
      const a = startA + (360 / n) * i;
      const [x, y] = polar(cx, cy, d, a);
      return { x, y, angle: a };
    });

    // tinted overlapping circles
    used.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = vennRole(ctx, ctx.role(i, { n, color: item.color }));
        const c = centers[i];
        ctx.shape("circle", c.x - R, c.y - R, R * 2, R * 2, role, { id: ctx.uid(item.id) });
      }),
    );

    // set label + icon in each circle's outer lobe
    const labelSize = n >= 6 ? 17 : 20;
    const labelW = n >= 6 ? 150 : n >= 5 ? 165 : 200;
    used.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const c = centers[i];
        radialLabel(ctx, c.x, c.y, R, c.angle, item.label, item.detail, role.color, { maxW: labelW, size: labelSize });
        if (item.icon) {
          const [ix, iy] = polar(cx, cy, d + R * 0.5, c.angle);
          ctx.icon(item.icon, ix, iy, 34, role.color);
        }
      }),
    );

    // overlap regions: icon inside, label pulled outward with a dotted leader.
    // These span multiple sets, so they are deliberately NOT item-scoped.
    const idOf = (s: string) => used.findIndex((u) => u.id === s || u.label.toLowerCase() === s.toLowerCase());
    const figureR = d + R;
    overlaps.forEach((ov, k) => {
      const named = [...ov.strings, ...(ov.to ? [ov.to] : []), ...(ov.opts.sets && Array.isArray(ov.opts.sets) ? (ov.opts.sets as string[]) : [])];
      let members = named.map(idOf).filter((i) => i >= 0);
      const isAll = ov.kind === "all" || members.length >= n || (!members.length && ov.kind !== "overlap" && ov.kind !== "intersection");
      if (isAll) members = used.map((_, i) => i);
      else if (members.length < 2) members = [0, Math.min(1, n - 1)];
      const all = members.length >= n;
      // region anchor: figure centre for all-sets, else the midpoint of the
      // member circle centres (which sits in their shared lens)
      const rx = all ? cx : members.reduce((s, i) => s + centers[i].x, 0) / members.length;
      const ry = all ? cy : members.reduce((s, i) => s + centers[i].y, 0) / members.length;
      let outAngle = all ? (n === 2 ? -90 : 8) : (Math.atan2(ry - cy, rx - cx) * 180) / Math.PI;
      if (!Number.isFinite(outAngle)) outAngle = -90;
      const role = ctx.role(n + k, { n: n + overlaps.length });
      if (ov.icon) ctx.icon(ov.icon, rx, ry, 28, role.color);
      const block = radialLabel(ctx, cx, cy, figureR + 6, outAngle, ov.label, ov.detail, role.color, { maxW: 180 });
      // dotted leader from the region to the label's nearest edge
      const bcx = block.x + block.w / 2;
      const bcy = block.y + block.h / 2;
      const ex = Math.abs(rx - bcx) > block.w / 2 + 4 ? (rx < bcx ? block.x - 8 : block.x + block.w + 8) : bcx;
      const ey = ex === bcx ? (ry < bcy ? block.y - 8 : block.y + block.h + 8) : bcy;
      const dl = Math.hypot(ex - rx, ey - ry) || 1;
      const gap = ov.icon ? 24 : 14;
      ctx.line(
        [
          [rx + ((ex - rx) / dl) * gap, ry + ((ey - ry) / dl) * gap],
          [ex, ey],
        ],
        { color: ctx.mutedInk, width: 1.2, dotted: true },
      );
    });
  },
});
