/**
 * Process & timeline visualizations: flowchart, sequence, timeline, journey,
 * stairs. Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { RoleStyle } from "../../style/presets.js";
import { rad } from "./util.js";

/** Stroke color that survives "seam" presets (which outline in the bg color). */
function seamSafe(ctx: VizContext, role: RoleStyle): string {
  return role.stroke === ctx.preset.background ? role.color : role.stroke;
}

// ---- flowchart -----------------------------------------------------------------

/** Icon + label centered as one group inside a step box. */
function stepLabel(ctx: VizContext, item: VizItem, cx: number, cy: number, maxTextW: number, role: RoleStyle): void {
  const textW = Math.min(ctx.measure(item.label, 17, "heading"), maxTextW);
  const opts = { size: 17, color: role.textColor, font: "heading", weight: ctx.preset.fonts.headingWeight };
  if (item.icon) {
    const start = cx - (34 + textW) / 2;
    ctx.icon(item.icon, start + 12, cy, 24, role.textColor);
    ctx.label(ctx.wrap(item.label, maxTextW, 17, "heading", 2), start + 34, cy, { ...opts, align: "left" });
  } else {
    ctx.label(ctx.wrap(item.label, maxTextW, 17, "heading", 2), cx, cy, opts);
  }
}

registerViz({
  name: "flowchart",
  aliases: ["flow", "process"],
  category: "Process",
  summary: "Chain of rounded steps with straight arrows; `direction: right` for horizontal.",
  entryKinds: ["item", "step"],
  options: [
    { name: "direction", type: "right|down", description: "right (or horizontal) lays the chain horizontally" },
    { name: "orientation", type: "horizontal|vertical", description: "alias for direction" },
  ],
  sweetSpot: { min: 2, max: 7 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "step");
    const n = Math.max(items.length, 1);
    const dir = optStr(spec.options, "direction") ?? optStr(spec.options, "orientation");
    const horizontal = dir === "right" || dir === "horizontal";
    const stepH = 56;
    const gap = 64;

    if (horizontal) {
      let x = 0;
      items.forEach((item, i) => {
        const iconW = item.icon ? 34 : 0;
        const textW = Math.min(ctx.measure(item.label, 17, "heading"), 240);
        const w = Math.max(150, textW + iconW + 48);
        ctx.item(item.id, () => {
          const role = ctx.role(i, { n, color: item.color });
          ctx.shape("rectangle", x, 0, w, stepH, role, { id: ctx.uid(item.id), style: { roundness: 14 } });
          stepLabel(ctx, item, x + w / 2, stepH / 2, w - iconW - 48, role);
          if (item.detail) {
            ctx.label(ctx.wrap(item.detail, w + 26, 14), x + w / 2, stepH + 18, { size: 14, color: ctx.mutedInk, vAnchor: "top" });
          }
        });
        // connector between two steps — shared, stays unscoped
        if (i < items.length - 1) ctx.arrow(x + w + 6, stepH / 2, x + w + gap - 6, stepH / 2, { color: ctx.preset.edge, width: 2 });
        x += w + gap;
      });
    } else {
      const widths = items.map((it) => Math.min(ctx.measure(it.label, 17, "heading"), 260) + (it.icon ? 34 : 0) + 48);
      const stepW = Math.min(360, Math.max(170, ...widths));
      const cx = stepW / 2;
      items.forEach((item, i) => {
        const y = i * (stepH + gap);
        ctx.item(item.id, () => {
          const role = ctx.role(i, { n, color: item.color });
          ctx.shape("rectangle", 0, y, stepW, stepH, role, { id: ctx.uid(item.id), style: { roundness: 14 } });
          stepLabel(ctx, item, cx, y + stepH / 2, stepW - (item.icon ? 34 : 0) - 48, role);
          if (item.detail) {
            ctx.label(ctx.wrap(item.detail, 220, 14), stepW + 22, y + stepH / 2, { size: 14, color: ctx.mutedInk, align: "left" });
          }
        });
        // connector between two steps — shared, stays unscoped
        if (i < items.length - 1) ctx.arrow(cx, y + stepH + 5, cx, y + stepH + gap - 5, { color: ctx.preset.edge, width: 2 });
      });
    }
  },
});

// ---- sequence -----------------------------------------------------------------

registerViz({
  name: "sequence",
  category: "Process",
  summary: "Boustrophedon grid of titled description panels joined by flow arrows.",
  entryKinds: ["item", "step"],
  options: [{ name: "columns", type: "number", description: "grid columns, clamped 2-4 (default 3)" }],
  sweetSpot: { min: 4, max: 9 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "step");
    const n = Math.max(items.length, 1);
    const cols = Math.max(2, Math.min(4, optNum(spec.options, "columns") ?? 3));
    const cellW = 280;
    const cellH = 234;
    const panelW = 240;
    const panelH = 130;
    const panelTop = 40;
    const pos = items.map((_, i) => {
      const row = Math.floor(i / cols);
      const rc = i % cols;
      const col = row % 2 === 0 ? rc : cols - 1 - rc;
      return { row, col, x: col * cellW, y: row * cellH };
    });
    items.forEach((item, i) => {
      const { x, y } = pos[i];
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const stroke = seamSafe(ctx, role);
        // colored step title bound to the panel: a title bar sitting on the panel
        ctx.label(ctx.wrap(item.label, panelW - 4, 20, "heading", 1), x + panelW / 2, y + panelTop - 16, {
          size: 20,
          color: role.color,
          font: "heading",
          weight: ctx.preset.fonts.headingWeight,
        });
        ctx.line(
          [
            [x + 14, y + panelTop - 1],
            [x + panelW - 14, y + panelTop - 1],
          ],
          { color: role.color, width: 2.4 },
        );
        // hand-drawn description panel
        ctx.shape(
          "rectangle",
          x,
          y + panelTop,
          panelW,
          panelH,
          { stroke, fill: role.softFill, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: role.roughness },
          { id: ctx.uid(item.id), style: { roundness: 10 } },
        );
        const midY = y + panelTop + panelH / 2;
        if (item.icon && item.detail) {
          ctx.icon(item.icon, x + panelW / 2, y + panelTop + 28, 30, role.color);
          ctx.label(ctx.wrap(item.detail, panelW - 30, 15, undefined, 4), x + panelW / 2, y + panelTop + 52, { size: 15, color: ctx.ink, vAnchor: "top" });
        } else if (item.icon) {
          ctx.icon(item.icon, x + panelW / 2, midY, 40, role.color);
        } else if (item.detail) {
          ctx.label(ctx.wrap(item.detail, panelW - 30, 15, undefined, 5), x + panelW / 2, midY, { size: 15, color: ctx.ink });
        }
      });
      // flow arrow to the next step: right/right on even rows, down at row
      // ends, left/left on odd rows — joins two items, stays unscoped
      if (i < items.length - 1) {
        const a = pos[i];
        const b = pos[i + 1];
        if (a.row === b.row) {
          const ay = a.y + panelTop + panelH / 2;
          const right = b.col > a.col;
          const x1 = a.x + (right ? panelW + 8 : -8);
          const x2 = b.x + (right ? -8 : panelW + 8);
          ctx.arrow(x1, ay, x2, ay, { color: ctx.preset.edge, width: 2 });
        } else {
          const axc = a.x + panelW / 2;
          ctx.arrow(axc, a.y + panelTop + panelH + 8, axc, b.y - 6, { color: ctx.preset.edge, width: 2 });
        }
      }
    });
  },
});

// ---- timeline -----------------------------------------------------------------

/** Map-pin/teardrop balloon paths (100×140 design space). */
const PIN_DOWN = "M50 140 C40 110 8 94 8 52 A42 42 0 1 1 92 52 C92 94 60 110 50 140 Z";
const PIN_UP = "M50 0 C40 30 8 46 8 88 A42 42 0 1 0 92 88 C92 46 60 30 50 0 Z";

registerViz({
  name: "timeline",
  category: "Timelines",
  summary: "A baseline with alternating teardrop pins: icon inside, date + description beside.",
  entryKinds: ["item", "event", "milestone"],
  sweetSpot: { min: 3, max: 7 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "event", "milestone");
    const n = Math.max(items.length, 1);
    const pitch = 190;
    const baseY = 210;
    const pinW = 86;
    const pinH = 116;
    ctx.line(
      [
        [0, baseY],
        [(n - 1) * pitch + 150, baseY],
      ],
      { color: ctx.preset.edge, width: 2, z: -1 },
    );
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const cx = i * pitch + 76;
        const up = i % 2 === 0;
        // teardrop balloon, tip touching the baseline (reference design)
        const pinY = up ? baseY - pinH : baseY;
        ctx.path(up ? PIN_DOWN : PIN_UP, 100, 140, cx - pinW / 2, pinY, pinW, pinH, role, { id: ctx.uid(item.id) });
        // ring marker on the baseline
        ctx.shape("circle", cx - 8, baseY - 8, 16, 16, { stroke: role.color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: 2, roughness: Math.min(0.8, ctx.preset.roughness) }, { z: 2 });
        ctx.shape("circle", cx - 3.5, baseY - 3.5, 7, 7, { stroke: role.color, fill: null, fillStyle: "none", strokeWidth: 1.6, roughness: 0.4 }, { z: 2 });
        // icon inside the balloon bulb
        const bulbY = up ? pinY + pinH * 0.37 : pinY + pinH * 0.63;
        if (item.icon) ctx.icon(item.icon, cx, bulbY, 38, role.fill ? role.textColor : role.color);
        // date + description on the far side of the balloon
        ctx.labelBlock(item.label, item.detail, cx, up ? pinY - 14 : pinY + pinH + 14, {
          color: role.color,
          align: "center",
          maxW: 165,
          vAnchor: up ? "bottom" : "top",
        });
      }),
    );
  },
});

// ---- journey ------------------------------------------------------------------

registerViz({
  name: "journey",
  aliases: ["roadmap"],
  category: "Process",
  summary: "A winding two-walled ribbon road, one color segment per stage (reference design).",
  entryKinds: ["item", "stage", "stop"],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "stage", "stop");
    const n = Math.max(items.length, 1);
    // serpentine centerline: vertical runs joined by U-turns, one run per stage
    const runH = 200;
    const pitch = 150;
    const yTop = 60;
    const yBot = yTop + runH;
    const half = 17; // ribbon half-width
    const center: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const x = 60 + i * pitch;
      const down = i % 2 === 0;
      // vertical run
      for (let s = 0; s <= 20; s++) {
        const y = down ? yTop + (runH * s) / 20 : yBot - (runH * s) / 20;
        center.push([x, y]);
      }
      // U-turn to the next run: semicircle bulging past the bottom (after a
      // down run) or the top (after an up run), from x to x+pitch
      if (i < n - 1) {
        const cxT = x + pitch / 2;
        const r = pitch / 2;
        for (let s = 1; s < 12; s++) {
          const a = down ? 180 - (180 * s) / 12 : 180 + (180 * s) / 12;
          center.push([cxT + Math.cos(rad(a)) * r, (down ? yBot : yTop) + Math.sin(rad(a)) * r]);
        }
      }
    }
    // offset walls via segment normals
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let i = 0; i < center.length; i++) {
      const [x, y] = center[i];
      const [px, py] = center[Math.max(0, i - 1)];
      const [nx, ny] = center[Math.min(center.length - 1, i + 1)];
      let dx = nx - px;
      let dy = ny - py;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      left.push([x - dy * half, y + dx * half]);
      right.push([x + dy * half, y - dx * half]);
    }
    // draw the walls per stage in the stage color
    const chunk = Math.floor(center.length / n);
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const from = i * chunk;
        const to = i === n - 1 ? center.length : (i + 1) * chunk + 1;
        const wallColor = role.stroke === ctx.preset.background ? role.color : role.stroke;
        ctx.line(left.slice(from, to), { id: ctx.uid(item.id), color: wallColor, width: 2.6 });
        ctx.line(right.slice(from, to), { color: wallColor, width: 2.6 });
        // stage label above/below its run, clear of the U-turn bulges (r=pitch/2)
        const runX = 60 + i * pitch;
        const above = i % 2 === 0;
        const labelY = above ? yTop - (n > 1 ? pitch / 2 : half) - 18 : yBot + (n > 1 ? pitch / 2 : half) + 18;
        ctx.labelBlock(item.label, item.detail, runX, labelY, {
          color: role.color,
          align: "center",
          maxW: 150,
          vAnchor: above ? "bottom" : "top",
        });
        if (item.icon) ctx.icon(item.icon, runX, yTop + runH / 2 + (above ? 30 : -30), 30, role.color);
      }),
    );
    // arrowhead where the ribbon ends — terminal decoration for the whole
    // ribbon (not one stage's element), stays unscoped
    const lastDown = (n - 1) % 2 === 0;
    const endX = 60 + (n - 1) * pitch;
    const endY = lastDown ? yBot + 4 : yTop - 4;
    const lastRole = ctx.role(n - 1, { n, color: items[n - 1]?.color });
    const tipColor = lastRole.stroke === ctx.preset.background ? lastRole.color : lastRole.stroke;
    ctx.poly(
      lastDown
        ? [
            [endX - half * 1.7, endY],
            [endX, endY + 30],
            [endX + half * 1.7, endY],
          ]
        : [
            [endX - half * 1.7, endY],
            [endX, endY - 30],
            [endX + half * 1.7, endY],
          ],
      { stroke: tipColor, fill: lastRole.fill, fillStyle: lastRole.fill ? "solid" : "none", strokeWidth: 2.6, roughness: ctx.preset.roughness },
    );
  },
});

// ---- stairs -------------------------------------------------------------------

registerViz({
  name: "stairs",
  aliases: ["staircase"],
  category: "Process",
  summary: "Ascending abutting step blocks with icon above and label inside each.",
  entryKinds: ["item", "step"],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "step");
    const n = Math.max(items.length, 1);
    const stepW = 156;
    const rise = 52;
    const firstH = 64;
    const top = 64; // headroom for the icon above the highest step
    const y0 = top + firstH + (n - 1) * rise; // shared ground level
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const x = i * stepW;
        const h = firstH + i * rise;
        // closed step block down to the shared baseline (reference design)
        ctx.shape("rectangle", x, y0 - h, stepW, h, role, { id: ctx.uid(item.id) });
        if (item.icon) ctx.icon(item.icon, x + stepW / 2, y0 - h - 34, 46, role.color);
        const inside = role.fill ? role.textColor : role.color;
        ctx.label(item.label, x + stepW / 2, y0 - h + 24, { size: 18, color: inside, font: "heading", weight: ctx.preset.fonts.headingWeight, maxW: stepW - 16 });
        if (item.detail) {
          ctx.label(ctx.wrap(item.detail, stepW - 20, 13, undefined, 3), x + stepW / 2, y0 - h + 52, { size: 13, color: role.fill ? role.textColor : ctx.ink });
        }
      }),
    );
  },
});
