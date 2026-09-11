/**
 * Process & timeline visualizations: flowchart, sequence, timeline, journey,
 * stairs. Geometry per design-notes/viz-import/LAYOUT_RECIPES.md.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optNum, optStr, type VizItem, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import type { RoleStyle } from "../../style/presets.js";
import { smoothPath, type Anchor } from "./util.js";

/** Stroke color that survives "seam" presets (which outline in the bg color). */
function seamSafe(ctx: VizContext, role: RoleStyle): string {
  return role.stroke === ctx.preset.background ? role.color : role.stroke;
}

const lineCount = (wrapped: string): number => wrapped.split("\n").length;

/** Local-box geometry for one or more anchor runs emitted as a single path node. */
function anchorBox(runs: Anchor[][]): { x: number; y: number; w: number; h: number; local: (a: Anchor[]) => Anchor[] } {
  const all = runs.flat();
  const x = Math.min(...all.map((a) => a[0]));
  const y = Math.min(...all.map((a) => a[1]));
  const w = Math.max(Math.max(...all.map((a) => a[0])) - x, 1);
  const h = Math.max(Math.max(...all.map((a) => a[1])) - y, 1);
  const local = (a: Anchor[]): Anchor[] => a.map(([ax, ay, c]) => (c ? ([ax - x, ay - y, c] as Anchor) : ([ax - x, ay - y] as Anchor)));
  return { x, y, w, h, local };
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
    {
      name: "direction",
      type: "right|down",
      description: "right (or horizontal) lays the chain horizontally, down (or vertical) stacks it; unset picks horizontal for up to 5 steps with short details",
    },
    { name: "orientation", type: "horizontal|vertical", description: "alias for direction" },
  ],
  sweetSpot: { min: 2, max: 7 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "step");
    const n = Math.max(items.length, 1);
    const dir = optStr(spec.options, "direction") ?? optStr(spec.options, "orientation");
    // A vertical chain of 4 boxes is a narrow column in a ~2.4:1 frame (13% of
    // its width, type shrunk to fit the height), so a short chain defaults to
    // horizontal; long chains and long details still stack.
    const horizontal = dir ? dir === "right" || dir === "horizontal" : items.length <= 5 && !items.some((it) => (it.detail?.length ?? 0) > 40);
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
  summary: "Boustrophedon grid of numbered, titled description panels joined by flow arrows.",
  entryKinds: ["item", "step"],
  options: [{ name: "columns", type: "number", description: "grid columns, clamped 2-4 (default 3)" }],
  sweetSpot: { min: 4, max: 9 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "step");
    const n = Math.max(items.length, 1);
    const cols = Math.max(2, Math.min(4, optNum(spec.options, "columns") ?? 3));
    const panelW = 290;
    const gapX = 56; // room for the row arrows
    const gapY = 52; // room for the turn arrow between rows
    const headH = 46; // numbered header band inside the panel
    const pad = 14;
    const detailSize = 17;
    const lineH = detailSize * 1.25;
    const detailW = panelW - 36;
    const badge = 28;
    // One panel height for the whole grid, sized to the wordiest step — a
    // fixed box left one short line floating in a mostly empty tint.
    const bodyNeed = (item: VizItem): number => {
      if (item.detail) return lineCount(ctx.wrap(item.detail, detailW, detailSize, undefined, 5)) * lineH + pad * 2;
      return item.icon ? 60 : 0;
    };
    const panelH = headH + Math.max(34, ...items.map(bodyNeed));
    const cellW = panelW + gapX;
    const cellH = panelH + gapY;
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
        // hand-drawn panel; the title lives INSIDE it as a header band, so no
        // rule has to sit on (and double) the panel's own top edge
        ctx.shape(
          "rectangle",
          x,
          y,
          panelW,
          panelH,
          { stroke, fill: role.softFill, fillStyle: "solid", strokeWidth: role.strokeWidth, roughness: role.roughness },
          { id: ctx.uid(item.id), style: { roundness: 10 } },
        );
        // step number badge — row 2 runs right-to-left, so the order is spelled out
        const bx = x + pad + badge / 2;
        const by = y + headH / 2 + 1;
        ctx.shape("circle", bx - badge / 2, by - badge / 2, badge, badge, {
          stroke: role.color,
          fill: ctx.preset.background,
          fillStyle: "solid",
          strokeWidth: 1.8,
          roughness: Math.min(0.8, ctx.preset.roughness),
        });
        ctx.label(String(i + 1), bx, by, { size: 15, color: role.color, weight: 700, font: "heading", role: "value" });
        const iconInHead = !!(item.icon && item.detail);
        const titleX = bx + badge / 2 + 10;
        const titleW = x + panelW - pad - (iconInHead ? 34 : 0) - titleX;
        ctx.label(ctx.wrap(item.label, titleW, 20, "heading", 1), titleX, by, {
          size: 20,
          color: role.color,
          font: "heading",
          weight: ctx.preset.fonts.headingWeight,
          align: "left",
        });
        if (iconInHead) ctx.icon(item.icon, x + panelW - pad - 12, by, 24, role.color);
        ctx.line(
          [
            [x + 12, y + headH],
            [x + panelW - 12, y + headH],
          ],
          { color: role.color, width: 1.4 },
        );
        const midY = y + headH + (panelH - headH) / 2;
        if (item.detail) {
          ctx.label(ctx.wrap(item.detail, detailW, detailSize, undefined, 5), x + panelW / 2, midY, { size: detailSize, color: ctx.ink, role: "detail" });
        } else if (item.icon) {
          ctx.icon(item.icon, x + panelW / 2, midY, 40, role.color);
        }
      });
      // flow arrow to the next step: right/right on even rows, down at row
      // ends, left/left on odd rows — joins two items, stays unscoped
      if (i < items.length - 1) {
        const a = pos[i];
        const b = pos[i + 1];
        if (a.row === b.row) {
          const ay = a.y + panelH / 2;
          const right = b.col > a.col;
          const x1 = a.x + (right ? panelW + 10 : -10);
          const x2 = b.x + (right ? -10 : panelW + 10);
          ctx.arrow(x1, ay, x2, ay, { color: ctx.preset.edge, width: 2 });
        } else {
          const axc = a.x + panelW / 2;
          ctx.arrow(axc, a.y + panelH + 10, axc, b.y - 10, { color: ctx.preset.edge, width: 2 });
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
  summary: "A winding two-walled ribbon road with numbered stops, one color segment per stage (reference design).",
  entryKinds: ["item", "stage", "stop"],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "stage", "stop");
    const n = Math.max(items.length, 1);
    // Serpentine centreline: vertical runs joined by semi-elliptical U-turns,
    // one run per stage. Each stage's label hangs in the pocket to the RIGHT of
    // its own run, beside a numbered stop on the road, so the pitch is sized to
    // hold a label; the flattened U-turns keep that wide pitch from making the
    // card tall.
    const runH = 220;
    const half = 21; // ribbon half-width
    const labelGap = 14;
    const labelW = 150;
    const pitch = half * 2 + labelGap * 2 + labelW;
    const rx = pitch / 2;
    const ry = 64;
    const yTop = 0;
    const yBot = runH;
    const runX = (i: number): number => i * pitch;
    const center: Array<[number, number]> = [];
    const bendMid: number[] = []; // centreline index of each U-turn's apex
    const runMid = (yTop + yBot) / 2;
    for (let i = 0; i < n; i++) {
      const x = runX(i);
      const down = i % 2 === 0;
      const steps = Math.ceil(runH / 8);
      // every run starts on the U-turn's end point (the U-turn loop skips both ends)
      for (let s = 0; s <= steps; s++) {
        const y = down ? yTop + (runH * s) / steps : yBot - (runH * s) / steps;
        center.push([x, y]);
      }
      // U-turn to the next run: half an ellipse bulging past the bottom (after
      // a down run) or the top (after an up run)
      if (i < n - 1) {
        const cx = x + rx;
        const cy = down ? yBot : yTop;
        const S = 48;
        for (let s = 1; s < S; s++) {
          const t = Math.PI - (Math.PI * s) / S;
          center.push([cx + Math.cos(t) * rx, cy + (down ? 1 : -1) * Math.sin(t) * ry]);
          if (s === S / 2) bendMid[i] = center.length - 1;
        }
      }
    }
    // walls: the centreline offset along its normals
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
    const lastIdx = center.length - 1;
    // start cap: the road begins as a closed rounded mouth, not two bare ends
    const cap: Anchor[] = [];
    for (let a = 15; a < 180; a += 15) cap.push([Math.cos((-a * Math.PI) / 180) * half, yTop + Math.sin((-a * Math.PI) / 180) * half]);
    // end arrowhead, continuous with the last stage's walls (no cross-bar)
    const lastDown = (n - 1) % 2 === 0;
    const endX = runX(n - 1);
    const endY = lastDown ? yBot : yTop;
    const dirY = lastDown ? 1 : -1;
    const flare = half * 1.8;
    // `left` sits at -x on a down run and +x on an up run
    const lSide = lastDown ? -1 : 1;
    const head: Anchor[] = [
      [endX + lSide * flare, endY, "corner"],
      [endX, endY + dirY * 34, "corner"],
      [endX - lSide * flare, endY, "corner"],
    ];

    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const wallColor = seamSafe(ctx, role);
        const first = i === 0;
        const last = i === n - 1;
        // one run plus half of each adjoining U-turn: colour boundaries sit at
        // the U-turn apexes, so every colour is centred on its own stop
        const from = first ? 0 : bendMid[i - 1];
        const to = last ? lastIdx : bendMid[i];
        const L: Anchor[] = left.slice(from, to + 1).map(([x, y]) => [x, y]);
        const R: Anchor[] = right.slice(from, to + 1).map(([x, y]) => [x, y]);
        if (last) {
          const [lx1, ly1] = L[L.length - 1];
          const [rx1, ry1] = R[R.length - 1];
          L[L.length - 1] = [lx1, ly1, "corner"];
          R[R.length - 1] = [rx1, ry1, "corner"];
        }
        const Rrev = [...R].reverse();
        // soft road surface under the walls (one closed region per stage)
        const surface: Anchor[] = [...L, ...(last ? head : []), ...Rrev, ...(first ? cap : [])];
        if (!last) {
          surface[L.length - 1] = [surface[L.length - 1][0], surface[L.length - 1][1], "corner"];
          surface[L.length] = [surface[L.length][0], surface[L.length][1], "corner"];
        }
        if (!first) {
          surface[0] = [surface[0][0], surface[0][1], "corner"];
          surface[surface.length - 1] = [surface[surface.length - 1][0], surface[surface.length - 1][1], "corner"];
        }
        const sb = anchorBox([surface]);
        ctx.path(smoothPath(sb.local(surface), { closed: true }), sb.w, sb.h, sb.x, sb.y, sb.w, sb.h, {
          stroke: "transparent",
          fill: role.softFill,
          fillStyle: "solid",
          strokeWidth: 0,
          roughness: ctx.preset.roughness,
        }, { z: -1 });
        // the two walls: one continuous stroke where the stage has a cap or a
        // head, two open strokes for a middle stage
        const wall = { stroke: wallColor, fill: null, fillStyle: "none" as const, strokeWidth: 2.6, roughness: ctx.preset.roughness };
        let runs: Anchor[][];
        let closed = false;
        if (first && last) {
          runs = [[...L, ...head, ...Rrev, ...cap]];
          closed = true;
        } else if (last) runs = [[...L, ...head, ...Rrev]];
        else if (first) runs = [[...Rrev, ...cap, ...L]];
        else runs = [L, R];
        const wb = anchorBox(runs);
        const d = runs.map((r) => smoothPath(wb.local(r), { closed })).join(" ");
        ctx.path(d, wb.w, wb.h, wb.x, wb.y, wb.w, wb.h, wall, { id: ctx.uid(item.id) });

        // numbered stop on the road, label hanging beside it in the pocket
        const x = runX(i);
        const my = runMid;
        const badge = 30;
        ctx.shape("circle", x - badge / 2, my - badge / 2, badge, badge, {
          stroke: wallColor,
          fill: ctx.preset.background,
          fillStyle: "solid",
          strokeWidth: 2.2,
          roughness: Math.min(0.8, ctx.preset.roughness),
        }, { z: 1 });
        ctx.label(String(i + 1), x, my, { size: 16, color: role.color, weight: 700, font: "heading", role: "value", z: 2 });
        const lx = x + half + labelGap;
        const block = ctx.labelBlock(item.label, item.detail, lx, my, { color: role.color, align: "left", maxW: labelW, vAnchor: "middle" });
        if (item.icon) ctx.icon(item.icon, lx + 14, block.y - 22, 28, role.color);
      }),
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
    const heightOf = (i: number): number => firstH + i * rise;
    // The staircase is ONE outline: separate rounded blocks butted together
    // bit a V-notch out of the ground at every join, pinched each riser and
    // doubled every shared wall in two colours. Steps are tinted fills under it.
    const outlinePts: Array<[number, number]> = [[0, y0]];
    items.forEach((_, i) => {
      outlinePts.push([i * stepW, y0 - heightOf(i)], [(i + 1) * stepW, y0 - heightOf(i)]);
    });
    outlinePts.push([n * stepW, y0]);
    const lineW = Math.min(2.4, ctx.preset.strokeWidth);
    ctx.poly(outlinePts, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: lineW, roughness: ctx.preset.roughness }, { z: 1 });
    // each join drawn once: the lower step's side wall down to the ground
    for (let i = 1; i < n; i++) {
      ctx.line(
        [
          [i * stepW, y0 - heightOf(i - 1)],
          [i * stepW, y0],
        ],
        { color: ctx.ink, width: Math.min(1.6, lineW), z: 1 },
      );
    }
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const x = i * stepW;
        const h = heightOf(i);
        // the step's tint, square-cornered so it sits flush in the outline
        ctx.shape(
          "rectangle",
          x,
          y0 - h,
          stepW,
          h,
          { stroke: "transparent", fill: role.fill ?? role.softFill, fillStyle: role.fill ? role.fillStyle : "solid", strokeWidth: 0, roughness: ctx.preset.roughness },
          { id: ctx.uid(item.id), z: -1, style: { roundness: 0 } },
        );
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
