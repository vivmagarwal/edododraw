/**
 * Stacked-band visualizations: funnel, pyramid, list, key-ideas.
 * Geometry follows design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optStr, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- funnel -----------------------------------------------------------------

registerViz({
  name: "funnel",
  category: "Business Frameworks",
  summary: "Narrowing stages with side labels; optional input/output captions.",
  entryKinds: ["item", "stage", "level"],
  options: [
    { name: "input", type: "string", description: "caption above the funnel mouth" },
    { name: "output", type: "string", description: "caption below the funnel tip" },
    { name: "showValues", type: "boolean", description: "print item values (default true)" },
  ],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "stage", "level");
    const n = Math.max(items.length, 1);
    const topW = 360;
    const tipW = 140;
    const cx = topW / 2;
    const input = optStr(spec.options, "input");
    const output = optStr(spec.options, "output");
    // band height grows to fit the tallest side label so long descriptions
    // never overlap the next stage (keeps the funnel proportional).
    const labelH = Math.max(0, ...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: 240 }).h));
    const bandH = Math.max(82, labelH + 18);

    let y = 0;
    if (input) {
      ctx.label(input, cx, 10, { size: 20, color: ctx.ink, font: "heading", weight: ctx.preset.fonts.headingWeight });
      y = 44;
    }
    const y0 = y;
    // The silhouette is two straight slopes: take every corner's width FROM ITS
    // OWN y rather than from the band index, so the 4-unit gap between bands
    // (which keeps each boundary stroked once instead of twice, with two
    // independent jitters) does not step the outline inward at every join.
    const wAt = (yy: number) => lerp(topW, tipW, (yy - y0) / (n * bandH));
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const top = y0 + i * bandH;
        const yT = top + (i ? 2 : 0);
        const yB = top + bandH - 2;
        const wT = wAt(yT);
        const wB = wAt(yB);
        ctx.poly(
          [
            [cx - wT / 2, yT],
            [cx + wT / 2, yT],
            [cx + wB / 2, yB],
            [cx - wB / 2, yB],
          ],
          role,
          { id: ctx.uid(item.id) },
        );
        // side label with a chevron arrow pointing at the band edge
        const midY = top + bandH / 2 - 2;
        const edgeX = cx + wAt(midY) / 2;
        const labelX = cx + topW / 2 + 76;
        ctx.arrow(labelX - 10, midY, edgeX + 8, midY, { color: ctx.preset.edge, width: 1.6 });
        ctx.labelBlock(item.label, item.detail, labelX, midY, { color: role.color, align: "left", maxW: 240 });
        // the number belongs to the band, not to the stage name: set inside,
        // big, so the funnel itself carries the quantity it is about.
        const value = ctx.showValue(item) && item.value !== undefined ? fmtNum(item.value) : "";
        const vw = value ? ctx.measure(value, 24, "heading") : 0;
        const iw = item.icon ? 34 : 0;
        const gap = value && item.icon ? 12 : 0;
        let px = cx - (iw + gap + vw) / 2;
        if (item.icon) {
          ctx.icon(item.icon, px + iw / 2, midY, iw, role.textColor);
          px += iw + gap;
        }
        if (value) ctx.label(value, px + vw / 2, midY, { size: 24, color: role.textColor, weight: 700, font: "heading", role: "value" });
      }),
    );
    if (output) {
      ctx.label(output, cx, y0 + n * bandH + 34, { size: 20, color: ctx.ink, font: "heading", weight: ctx.preset.fonts.headingWeight });
    }
    // Place the title ourselves so it shares the funnel's axis: the default
    // (registry) title centres on the whole bbox, which the 240-unit side
    // labels drag ~150px to the right of the input/output captions.
    if (spec.title) ctx.title(spec.title, cx, ctx.bounds().y - 44);
  },
});

// ---- pyramid ------------------------------------------------------------------

registerViz({
  name: "pyramid",
  category: "Hierarchy",
  summary: "Triangle of stacked levels, numbered, labels staggered on the slope.",
  entryKinds: ["item", "level"],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "level");
    const n = Math.max(items.length, 1);
    const baseW = 520;
    const cx = baseW / 2;
    // band height grows to fit the tallest slope label (long descriptions).
    const labelH = Math.max(0, ...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: 250 }).h));
    const bandH = Math.max(n <= 4 ? 96 : 84, labelH + 14);
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const wT = baseW * (i / n);
        const wB = baseW * ((i + 1) / n);
        const top = i * bandH;
        const pts: Array<[number, number]> =
          i === 0
            ? [
                [cx, top],
                [cx + wB / 2, top + bandH - 4],
                [cx - wB / 2, top + bandH - 4],
              ]
            : [
                [cx - wT / 2, top],
                [cx + wT / 2, top],
                [cx + wB / 2, top + bandH - 4],
                [cx - wB / 2, top + bandH - 4],
              ];
        ctx.poly(pts, role, { id: ctx.uid(item.id) });
        const midY = top + bandH / 2;
        // level number inside (from level 2 down there is room)
        if (i > 0) {
          ctx.label(String(i + 1), cx - wT / 2 + 14, midY, { size: 30, color: role.textColor, weight: 700, align: "left", font: "heading" });
        }
        // label just clear of the band's widest (bottom) right edge, so long
        // descriptions never overlap the pyramid — labels stagger out with width
        const slopeX = cx + wB / 2 + 22;
        ctx.labelBlock(item.label, item.detail, slopeX, midY, { color: role.color, align: "left", maxW: 250 });
        if (item.icon) ctx.icon(item.icon, cx + 14, i === 0 ? midY + 10 : midY, 30, role.textColor);
      }),
    );
  },
});

// ---- list ------------------------------------------------------------------------

registerViz({
  name: "list",
  category: "Brainstorming",
  summary: "Styled list — numbered circles + labels (vertical ≤5, horizontal 6+).",
  entryKinds: ["item"],
  options: [{ name: "orientation", type: "horizontal|vertical", description: "override the ≤5-vertical / 6+-horizontal default" }],
  sweetSpot: { min: 2, max: 8 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item");
    const n = items.length;
    const horizontal = optStr(spec.options, "orientation") === "horizontal" || (n >= 6 && optStr(spec.options, "orientation") !== "vertical");
    if (!horizontal) {
      // row pitch grows to fit the tallest label so long details don't overlap
      const rowH = Math.max(0, ...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: 340 }).h));
      const pitch = Math.max(88, rowH + 26);
      items.forEach((item, i) =>
        ctx.item(item.id, () => {
          const role = ctx.role(i, { n, color: item.color });
          const cy = i * pitch + 30;
          ctx.shape("circle", 0, cy - 30, 60, 60, role, { id: ctx.uid(item.id) });
          const glyph = item.icon ?? String(i + 1);
          if (item.icon) ctx.icon(item.icon, 30, cy, 32, role.textColor);
          else ctx.label(glyph, 30, cy, { size: 24, color: role.textColor, weight: 700, font: "heading" });
          ctx.labelBlock(item.label, item.detail, 84, cy, { color: ctx.ink, align: "left", maxW: 340 });
        }),
      );
    } else {
      const pitch = 160;
      items.forEach((item, i) =>
        ctx.item(item.id, () => {
          const role = ctx.role(i, { n, color: item.color });
          const cx = i * pitch + 70;
          if (item.icon) ctx.icon(item.icon, cx, 24, 40, role.color);
          else {
            ctx.shape("circle", cx - 24, 0, 48, 48, role, { id: ctx.uid(item.id) });
            ctx.label(String(i + 1), cx, 24, { size: 20, color: role.textColor, weight: 700, font: "heading" });
          }
          ctx.labelBlock(item.label, item.detail, cx, 74, { color: ctx.ink, align: "center", maxW: pitch - 24, vAnchor: "top" });
        }),
      );
    }
  },
});

/**
 * A lightbulb's glass, in a local box `2R` wide and `neckY` tall: a circle of
 * radius `R` centred at (R, R), pinched into a neck 38 wide at `neckY`. The arc
 * leaves the circle 35° below the equator on each side; the S-curve arrives
 * there along the circle's tangent so the join has no kink.
 */
function bulbPath(R: number, neckY: number): string {
  const a = (145 * Math.PI) / 180;
  const px = R + R * Math.cos(a);
  const py = R + R * Math.sin(a);
  // tangent of increasing angle at 145° is (-sin, cos); the curve arrives moving that way
  const tx = -Math.sin(a);
  const ty = Math.cos(a);
  const k = 14;
  const nl = R - 19;
  const nr = R + 19;
  const f = (v: number) => Math.round(v * 100) / 100;
  return [
    `M${f(nl)} ${f(neckY)}`,
    `C${f(nl)} ${f(neckY - 12)} ${f(px - tx * k)} ${f(py - ty * k)} ${f(px)} ${f(py)}`,
    `A${f(R)} ${f(R)} 0 1 1 ${f(2 * R - px)} ${f(py)}`,
    `C${f(2 * R - px + tx * k)} ${f(py - ty * k)} ${f(nr)} ${f(neckY - 12)} ${f(nr)} ${f(neckY)}`,
    "Z",
  ].join(" ");
}

// ---- key-ideas ----------------------------------------------------------------------

registerViz({
  name: "key-ideas",
  aliases: ["ideas"],
  category: "Brainstorming",
  summary: "A row of lightbulbs, one per idea, with label + description below.",
  entryKinds: ["item", "idea"],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "idea");
    const n = Math.max(items.length, 1);
    const pitch = 210;
    const D = 116; // the globe's width (reference proportion)
    const R = D / 2;
    const neckY = D + 10; // where the glass meets the screw base
    const baseH = 22;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const cx = i * pitch + 90;
      const cy = R;
      // A lightbulb, not a ring: a round globe that pinches into a neck, a
      // threaded base under it, and a contact tip. The earlier version was a
      // full circle over two floating lines, and read as a balloon — or as
      // nothing at all once the camera fitted it large.
      // The globe is an exact arc over the top, joined to the neck by two
      // S-curves that leave the circle along its own tangent (G1 at the join),
      // so the silhouette is a circle with a pinch. A spline through points on
      // the circle cannot do this: its handles come out ~11% short at 45°
      // spacing and the globe reads faintly octagonal once a camera fits it.
      ctx.path(bulbPath(R, neckY), D, neckY, cx - R, 0, D, neckY, role, { id: ctx.uid(item.id) });
      const metal = role.stroke === ctx.preset.background ? role.color : role.stroke;
      // the threaded base: a band with two threads, then the contact tip
      ctx.shape("rectangle", cx - 19, neckY, 38, baseH, { ...role, fill: ctx.preset.background, roundness: 5 }, { id: ctx.uid(`${item.id}-base`) });
      for (const t of [neckY + 8, neckY + 15]) {
        ctx.line(
          [
            [cx - 19, t],
            [cx + 19, t],
          ],
          { color: metal, width: Math.max(1, role.strokeWidth * 0.8) },
        );
      }
      ctx.line(
        [
          [cx - 8, neckY + baseH + 5],
          [cx + 8, neckY + baseH + 5],
        ],
        { color: metal, width: role.strokeWidth * 1.4 },
      );
      // icon (or a filament: two stems rising from the neck into a coil) inside the globe
      if (item.icon) ctx.icon(item.icon, cx, cy - 4, 46, role.fill ? role.textColor : role.color);
      else {
        const fc = role.fill ? role.textColor : role.color;
        for (const sx of [-9, 9]) {
          ctx.line(
            [
              [cx + sx, D - 4],
              [cx + sx * 0.8, cy + 16],
            ],
            { color: fc, width: 1.6 },
          );
        }
        ctx.line(
          [
            [cx - 7.2, cy + 16],
            [cx - 3.6, cy + 6],
            [cx, cy + 16],
            [cx + 3.6, cy + 6],
            [cx + 7.2, cy + 16],
          ],
          { color: fc, width: 1.8 },
        );
      }
      ctx.labelBlock(item.label, item.detail, cx, neckY + baseH + 22, { color: role.color, align: "center", maxW: pitch - 34, vAnchor: "top" });
      }),
    );
  },
});

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US");
  return String(v);
}
