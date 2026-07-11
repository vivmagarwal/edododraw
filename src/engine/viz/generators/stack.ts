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
    const valueText = (it: (typeof items)[number]) => (ctx.showValue(it) && it.value !== undefined ? `  ${fmtNum(it.value)}` : "");
    const labelH = Math.max(0, ...items.map((it) => ctx.measureLabelBlock(it.label + valueText(it), it.detail, { maxW: 240 }).h));
    const bandH = Math.max(82, labelH + 18);

    let y = 0;
    if (input) {
      ctx.label(input, cx, 10, { size: 20, color: ctx.ink, font: "heading", weight: ctx.preset.fonts.headingWeight });
      y = 44;
    }
    const y0 = y;
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const wT = lerp(topW, tipW, i / n);
        const wB = lerp(topW, tipW, (i + 1) / n);
        const top = y0 + i * bandH;
        ctx.poly(
          [
            [cx - wT / 2, top],
            [cx + wT / 2, top],
            [cx + wB / 2, top + bandH],
            [cx - wB / 2, top + bandH],
          ],
          role,
          { id: ctx.uid(item.id) },
        );
        // side label with a chevron arrow pointing at the band edge
        const midY = top + bandH / 2 - 2;
        const edgeX = cx + (wT + wB) / 4;
        const labelX = cx + topW / 2 + 76;
        ctx.arrow(labelX - 10, midY, edgeX + 8, midY, { color: ctx.preset.edge, width: 1.6 });
        ctx.labelBlock(item.label + valueText(item), item.detail, labelX, midY, { color: role.color, align: "left", maxW: 240 });
        if (item.icon) ctx.icon(item.icon, cx, midY, 34, role.textColor);
      }),
    );
    if (output) {
      ctx.label(output, cx, y0 + n * bandH + 34, { size: 20, color: ctx.ink, font: "heading", weight: ctx.preset.fonts.headingWeight });
    }
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
    const D = 116; // large thin-ring bulb (reference proportion)
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
      const role = ctx.role(i, { n, color: item.color });
      const cx = i * pitch + 90;
      const cy = D / 2;
      // bulb: big ring + collar lines + base
      ctx.shape("circle", cx - D / 2, 0, D, D, role, { id: ctx.uid(item.id) });
      const collar = role.stroke === ctx.preset.background ? role.color : role.stroke;
      ctx.line(
        [
          [cx - 19, D + 5],
          [cx + 19, D + 5],
        ],
        { color: collar, width: role.strokeWidth },
      );
      ctx.line(
        [
          [cx - 14, D + 14],
          [cx + 14, D + 14],
        ],
        { color: collar, width: role.strokeWidth },
      );
      // icon (or filament: stem + zigzag coil) inside the bulb
      if (item.icon) ctx.icon(item.icon, cx, cy, 48, role.fill ? role.textColor : role.color);
      else {
        const fc = role.fill ? role.textColor : role.color;
        ctx.line(
          [
            [cx - 13, cy + 24],
            [cx - 6.5, cy + 8],
            [cx, cy + 21],
            [cx + 6.5, cy + 8],
            [cx + 13, cy + 24],
          ],
          { color: fc, width: 2 },
        );
        ctx.line(
          [
            [cx, cy - 18],
            [cx, cy + 6],
          ],
          { color: fc, width: 2 },
        );
      }
      ctx.labelBlock(item.label, item.detail, cx, D + 40, { color: role.color, align: "center", maxW: pitch - 34, vAnchor: "top" });
      }),
    );
  },
});

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US");
  return String(v);
}
