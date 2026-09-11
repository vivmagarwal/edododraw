/**
 * Sketchnote-native visualizations (learned from the classic sketchnoting
 * vocabulary — skeleton library, character work, containers): personas,
 * quote, clouds, fishbone. Characters come from ../characters.ts.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optStr, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { listCharacterPoses, characterOptsFrom } from "../characters.js";
import { lerp, scallopedBlob, smoothPath, type Anchor } from "./util.js";
import { mix } from "../../style/color.js";

/** Deterministic jitter (stable re-renders — no Math.random). */
const jit = (i: number, amp: number): number => Math.sin(i * 7.3) * amp;

// ---- personas -----------------------------------------------------------------

const PERSONA_POSES = ["waving", "confident", "thinking", "cheering", "presenting", "pointing"];

registerViz({
  name: "personas",
  category: "Brainstorming",
  summary: "A cast of sketchnote characters — one per role/persona, posed and labeled.",
  entryKinds: ["item", "persona", "role"],
  options: [
    { name: "pose", type: "string", description: "per item: action pose (see the character library; poses cycle when unset)" },
    { name: "emotion", type: "string", description: "per item: facial expression" },
    { name: "shirt", type: "string", description: "per item: clothing style (+ shirtColor)" },
    { name: "hair", type: "string", description: "per item: hair style (+ hairColor)" },
    { name: "accessory", type: "string", description: "per item: glasses / hat / beard … (+ accessoryColor)" },
    { name: "fx", type: "string", description: "per item: floating mark — sweat / question / idea / stars … (+ fxColor)" },
    { name: "prop", type: "string", description: "per item: any icon name, held in hand" },
  ],
  sweetSpot: { min: 2, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "persona", "role");
    const n = Math.max(items.length, 1);
    const figH = 128;
    // pitch grows with the widest label block so casts never crowd
    const blockW = Math.max(150, ...items.map((it) => ctx.measureLabelBlock(it.label, it.detail, { maxW: 180, size: 18 }).w));
    const pitch = Math.max(206, blockW + 44);
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const cx = i * pitch + pitch / 2;
        const pose = typeof item.opts.pose === "string" ? item.opts.pose : PERSONA_POSES[i % PERSONA_POSES.length];
        const chOpts = characterOptsFrom(item.opts);
        ctx.character(pose, cx, figH + 26, figH, { color: role.color, propColor: role.color, ...chOpts, prop: chOpts.prop ?? item.icon });
        // ground stroke under each figure
        ctx.line([[cx - 40, figH + 28], [cx + 40, figH + 28]], { color: ctx.mutedInk, width: 1.6 });
        ctx.labelBlock(item.label, item.detail, cx, figH + 52, { color: role.color, align: "center", maxW: 180, vAnchor: "top", size: 18 });
      }),
    );
  },
});

// ---- quote --------------------------------------------------------------------

/** An opening quote “ as two filled commas: a ball with a tail rising to the
 *  upper right (a "6"), authored in a 90×74 box. */
const QUOTE_COMMA = (dx: number): string =>
  `M${6 + dx} 54 C${4 + dx} 30 ${14 + dx} 12 ${36 + dx} 4 L${39 + dx} 10 C${25 + dx} 17 ${20 + dx} 27 ${22 + dx} 38 A16 16 0 1 1 ${6 + dx} 54 Z`;
const QUOTE_MARK_D = `${QUOTE_COMMA(0)} ${QUOTE_COMMA(48)}`;
const QUOTE_MARK_VW = 90;
const QUOTE_MARK_VH = 74;

registerViz({
  name: "quote",
  category: "Brainstorming",
  summary: "A big hand-lettered quote with attribution and a presenting character.",
  entryKinds: ["quote", "by", "item"],
  options: [
    { name: "by", type: "string", description: "attribution line (or use a `by` entry)" },
    { name: "pose", type: "string", description: 'character pose (default "presenting"; "none" hides the figure)' },
    { name: "emotion", type: "string", description: "character emotion" },
    { name: "prop", type: "string", description: "icon the character holds" },
    { name: "shirt", type: "string", description: "character shirt style (+ shirtColor)" },
    { name: "hair", type: "string", description: "character hair style (+ hairColor)" },
    { name: "accessory", type: "string", description: "worn accessory — glasses / hat / beard … (+ accessoryColor)" },
    { name: "fx", type: "string", description: "floating state mark — sweat / question / idea / stars …" },
  ],
  sweetSpot: { min: 1, max: 1 },
  generate(spec: VizSpec, ctx: VizContext) {
    const quoteEntry = spec.items.find((i) => i.kind === "quote" || i.kind === "item");
    const text = quoteEntry?.label ?? spec.title ?? "…";
    if (!quoteEntry && spec.title) ctx.titleHandled = true;
    const by = spec.items.find((i) => i.kind === "by")?.label ?? optStr(spec.options, "by");
    const accent = ctx.role(0, { n: 1 }).color;

    const wrapped = ctx.wrap(text, 430, 27, "heading", 5);
    const lineArr = wrapped.split("\n");
    const lines = lineArr.length;
    const qh = lines * 27 * 1.3;
    const qx = 250; // quote block center
    const textW = Math.max(...lineArr.map((l) => ctx.measure(l, 27, "heading")));
    const textLeft = qx - textW / 2;
    const textTop = qh / 2 + 14 - (lines * 27 * 1.25) / 2;
    // The opening quote mark is DRAWN (two filled 6-shaped commas), not typed:
    // a hand face has no bold, so a synthesised-bold “ smeared into two beans.
    // It hangs off the first line, the way a printed pull-quote does — and
    // the text is set flush-left so that edge is exact, not a measured guess.
    const markW = 38;
    const markH = 31;
    ctx.path(QUOTE_MARK_D, QUOTE_MARK_VW, QUOTE_MARK_VH, textLeft - 14 - markW, textTop - 2, markW, markH, { stroke: accent, fill: accent, fillStyle: "solid", strokeWidth: 1, roughness: Math.min(0.6, ctx.preset.roughness) }, { id: ctx.uid("mark") });
    const drawQuote = () => {
      ctx.label(wrapped, textLeft, qh / 2 + 14, { size: 27, color: ctx.ink, weight: 700, font: "heading", align: "left" });
      // flourish underline, as wide as the text it underlines
      const half = Math.max(80, textW / 2 - 10);
      ctx.line(
        [
          [qx - half, qh + 34],
          [qx + half, qh + 30],
        ],
        { color: accent, width: 2.6 },
      );
      // the byline closes on the underline's end
      if (by) ctx.label(`— ${by}`, qx + half, qh + 58, { size: 17, color: ctx.mutedInk, align: "right" });
    };
    if (quoteEntry) ctx.item(quoteEntry.id, drawQuote);
    else drawQuote();

    // the messenger: a character presenting the quote
    const pose = optStr(spec.options, "pose") ?? "presenting";
    if (pose !== "none" && listCharacterPoses().includes(pose)) {
      ctx.character(pose, qx - 306, qh + 112, 126, { color: ctx.ink, propColor: accent, shirtColor: accent, ...characterOptsFrom(spec.options) });
      ctx.line([[qx - 344, qh + 114], [qx - 266, qh + 114]], { color: ctx.mutedInk, width: 1.6 });
    }
  },
});

// ---- clouds -------------------------------------------------------------------

registerViz({
  name: "clouds",
  category: "Brainstorming",
  summary: "Scattered thought-cloud islands — a loose collection of ideas.",
  entryKinds: ["item", "idea", "cloud"],
  sweetSpot: { min: 3, max: 7 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "idea", "cloud");
    const n = Math.max(items.length, 1);
    // measure every cloud first so the staggered slots can't collide
    const sized = items.map((it) => {
      const m = ctx.measureLabelBlock(it.label, it.detail, { maxW: 170, size: 18 });
      return { it, rx: Math.max(96, m.w / 2 + 40), ry: Math.max(62, m.h / 2 + (it.icon ? 24 : 0) + 36) };
    });
    const maxRx = Math.max(...sized.map((s) => s.rx));
    const maxRy = Math.max(...sized.map((s) => s.ry));
    const perRow = n <= 4 ? 2 : 3;
    const pitchX = maxRx * 2 + 44;
    const pitchY = maxRy * 2 + 26;
    sized.forEach(({ it, rx, ry }, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const cx = col * pitchX + (row % 2 ? pitchX / 2 : 0) + maxRx + jit(i, 14);
      const cy = row * pitchY + maxRy + jit(i + 3, 10);
      ctx.item(it.id, () => {
        const role = ctx.role(i, { n, color: it.color });
        ctx.path(scallopedBlob(rx, ry, 9 + (i % 3)), rx * 2, ry * 2, cx - rx, cy - ry, rx * 2, ry * 2, { stroke: role.color, fill: role.softFill, fillStyle: "solid", strokeWidth: 2.2, roughness: ctx.preset.roughness }, { id: ctx.uid(it.id) });
        const iconLift = it.icon ? 14 : 0;
        if (it.icon) ctx.icon(it.icon, cx, cy - ry * 0.44, 26, role.color);
        ctx.labelBlock(it.label, it.detail, cx, cy + iconLift * 0.6, { color: ctx.ink, align: "center", maxW: 170, size: 18 });
      });
    });
  },
});

// ---- fishbone -----------------------------------------------------------------

registerViz({
  name: "fishbone",
  category: "Cause and Effect",
  summary: "Ishikawa diagram — cause categories on angled bones along a spine to the effect.",
  entryKinds: ["bone", "category", "item", "effect", "problem"],
  sweetSpot: { min: 2, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const bones = itemsOf(spec, "bone", "category", "item").filter((b) => b.children.length || b.kind !== "item");
    const nB = Math.max(bones.length, 1);
    const effectEntry = spec.items.find((i) => i.kind === "effect" || i.kind === "problem");
    const effect = effectEntry?.label ?? spec.title ?? "Effect";
    if (!effectEntry && spec.title) ctx.titleHandled = true;

    const pairW = 224;
    const nPairs = Math.ceil(nB / 2);
    const spineEnd = 150 + nPairs * pairW;
    const boneDX = 104;
    const boneDY = 156;

    // spine with a fish tail at the start, arrowing into the head. The tail is
    // a caudal fin fanning AWAY from the head (a chevron here read as a second
    // arrowhead), its apex ON the spine so tail and spine are one stroke.
    ctx.poly([[0, 0], [-24, -21], [-16, 0], [-24, 21]], { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 3, roughness: ctx.preset.roughness });
    ctx.arrow(-1, 0, spineEnd + 4, 0, { color: ctx.ink, width: 3 });

    // head: the effect — the subject, so the largest type on the card
    // (effect 22 > category 18 > cause 16)
    const headSize = 22;
    const headText = ctx.wrap(effect, 200, headSize, "heading", 4);
    const headW = Math.max(140, ...headText.split("\n").map((l) => ctx.measure(l, headSize, "heading"))) + 34;
    const headH = headText.split("\n").length * Math.round(headSize * 1.35) + 26;
    const drawHead = () => {
      ctx.shape("round-rectangle", spineEnd + 12, -headH / 2, headW, headH, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.4, roughness: ctx.preset.roughness, roundness: 12 }, { id: ctx.uid("effect") });
      ctx.label(headText, spineEnd + 12 + headW / 2, 0, { size: headSize, color: ctx.ink, weight: 700, font: "heading" });
    };
    if (effectEntry) ctx.item(effectEntry.id, drawHead);
    else drawHead();

    bones.forEach((bone, i) =>
      ctx.item(bone.id, () => {
        const role = ctx.role(i, { n: nB, color: bone.color });
        const up = i % 2 === 0;
        const pair = Math.floor(i / 2);
        const ax = 170 + pair * pairW + (up ? 0 : pairW / 2); // spine attachment
        const sign = up ? -1 : 1;
        const end: [number, number] = [ax - boneDX, sign * boneDY];
        ctx.line([[ax, 0], end], { color: role.color, width: 2.4 });
        // category label just beyond the bone's outer end
        ctx.labelBlock(bone.label, undefined, end[0], end[1] + sign * 12, { color: role.color, align: "center", maxW: 160, vAnchor: up ? "bottom" : "top", size: 18 });
        // causes: ticks off the bone in the bone's own hue (grey ticks read as
        // annotation, not as the content), labels trailing toward the tail
        const causes = bone.children.slice(0, 4);
        const step = Math.min(0.3, 0.6 / Math.max(causes.length - 1, 1));
        causes.forEach((cause, j) => {
          const t = 0.8 - j * step;
          const px = lerp(ax, end[0], t);
          const py = lerp(0, end[1], t);
          ctx.line([[px, py], [px - 46, py]], { color: role.color, width: 2 });
          ctx.label(ctx.wrap(cause.label, 150, 16, "body", 2), px - 52, py, { size: 16, color: ctx.ink, align: "right" });
        });
      }),
    );
  },
});

// ---- head-thoughts --------------------------------------------------------------

/**
 * The profile silhouette (face to the RIGHT), authored as points ON its
 * outline in a 300×360 box and smoothed into one path (util.smoothPath): a
 * full rounded cranium, a gentle forehead, the brow, a proper nose, lips and
 * chin, then the jaw sweeping back into a neck cut flat. The `corner`
 * anchors keep the creases under the nose, at the mouth and at the cut.
 */
const HEAD_VW = 300;
const HEAD_VH = 360;
const HEAD_ANCHORS: Anchor[] = [
  [140, 4],
  [210, 16],
  [258, 62],
  [272, 118],
  [268, 150],
  [262, 162],
  [270, 178],
  [286, 198],
  [298, 214],
  [290, 225],
  [278, 228, "corner"],
  [272, 236],
  [272, 246],
  [281, 257],
  [272, 266, "corner"],
  [279, 279],
  [268, 292],
  [278, 312],
  [262, 332],
  [226, 344],
  [205, 348],
  [203, 360, "corner"],
  [96, 360, "corner"],
  [100, 320],
  [60, 285],
  [24, 232],
  [10, 165],
  [18, 100],
  [44, 48],
  [90, 12],
];

registerViz({
  name: "head-thoughts",
  category: "Brainstorming",
  summary: "A profile-head container — what's going on in someone's mind.",
  entryKinds: ["item", "thought"],
  options: [
    { name: "who", type: "string", description: "caption under the head" },
    { name: "facing", type: "left|right", description: "which way the profile looks (default right)" },
  ],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "thought").slice(0, 6);
    const n = Math.max(items.length, 1);
    const facing = optStr(spec.options, "facing") === "left" ? "left" : "right";
    const W = 330;
    const H = 396;
    const sx = W / HEAD_VW;
    const sy = H / HEAD_VH;
    // one silhouette with a faint wash, so it reads as a solid head rather than
    // a wire — faint enough that ink text on it keeps its full contrast
    const wash = mix(ctx.preset.background, ctx.mutedInk, 0.06);
    ctx.path(smoothPath(HEAD_ANCHORS, facing === "left" ? { mirrorX: HEAD_VW } : {}), HEAD_VW, HEAD_VH, 0, 0, W, H, { stroke: ctx.ink, fill: wash, fillStyle: "solid", strokeWidth: 2.6, roughness: ctx.preset.roughness }, { id: ctx.uid("head") });

    // Thoughts fill the CRANIUM (design y ~48..244, x ~38..244 of the 300×360
    // box), never the face: rows at nose/lip height read as speech. The type
    // is the card's content, so it takes the largest size whose measured,
    // wrapped rows fit that band (20 down to 14), and the hue goes on the icon
    // while the words stay in ink.
    const bandTop = 50 * sy;
    const bandBot = 236 * sy;
    const gap = 12;
    const rowLeft = (facing === "left" ? 56 : 38) * sx;
    const rowRight = (facing === "left" ? 254 : 238) * sx;
    const iconSize = 28;
    const textX = rowLeft + iconSize + 10;
    const textW = rowRight - textX;
    // balanced wrap: the narrowest width that keeps the line count, so a
    // two-line thought never ends on a one-word orphan
    const balanced = (label: string, size: number) => {
      let best = ctx.wrap(label, textW, size, "heading", 3);
      const lines = best.split("\n").length;
      if (lines === 1) return best;
      for (let w = textW - 6; w > textW * 0.5; w -= 6) {
        const t = ctx.wrap(label, w, size, "heading", 3);
        if (t.split("\n").length !== lines) break;
        best = t;
      }
      return best;
    };
    const layout = (size: number) => {
      const texts = items.map((item) => balanced(item.label, size));
      const hs = texts.map((t) => Math.max(iconSize, t.split("\n").length * size * 1.25));
      return { size, texts, hs, total: hs.reduce((a, b) => a + b, 0) + gap * (n - 1) };
    };
    let fit = layout(20);
    for (let size = 19; size >= 14 && fit.total > bandBot - bandTop; size--) fit = layout(size);
    // spare band loosens the rows a little; then centre the stack on the band
    const rowGap = n > 1 ? Math.max(6, Math.min(20, gap + (bandBot - bandTop - fit.total) / (n - 1) / 2)) : gap;
    const stackH = fit.total + (rowGap - gap) * (n - 1);
    let y0 = Math.max(bandTop, (bandTop + bandBot) / 2 - stackH / 2 - 8 * sy);
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const y = y0 + fit.hs[i] / 2;
        y0 += fit.hs[i] + rowGap;
        const text = { size: fit.size, color: ctx.ink, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" as const };
        if (item.icon) ctx.icon(item.icon, rowLeft + iconSize / 2, y, iconSize, role.color);
        else ctx.shape("circle", rowLeft + iconSize / 2 - 6, y - 6, 12, 12, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 });
        ctx.label(fit.texts[i], textX, y, text);
      }),
    );
    const who = optStr(spec.options, "who");
    if (who) ctx.label(who, 150 * sx, H + 26, { size: 17, color: ctx.mutedInk, weight: 700, font: "heading" });
  },
});

// ---- hex-cluster ----------------------------------------------------------------

registerViz({
  name: "hex-cluster",
  category: "Business Frameworks",
  summary: "A honeycomb — one core hexagon ringed by up to six themed cells.",
  entryKinds: ["item", "cell", "center"],
  options: [{ name: "center", type: "string", description: "core cell label (or use a `center` entry)" }],
  sweetSpot: { min: 3, max: 6 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "cell").slice(0, 6);
    const n = Math.max(items.length, 1);
    const centerEntry = spec.items.find((i) => i.kind === "center");
    const centerLabel = centerEntry?.label ?? optStr(spec.options, "center") ?? spec.title;
    if (!centerEntry && centerLabel === spec.title && spec.title) ctx.titleHandled = true;

    // A REGULAR flat-top hexagon (h = w·√3/2), drawn as our own polygon: the
    // shared "hexagon" shape insets its top edge 0.22w, which reads squashed.
    const w = 172;
    const h = Math.round((w * Math.sqrt(3)) / 2);
    const g = 10; // one even gutter between every pair of touching cells
    const cell = (cx: number, cy: number, role: ReturnType<typeof ctx.role>, id?: string) =>
      ctx.poly(
        [
          [cx - w / 2, cy],
          [cx - w / 4, cy - h / 2],
          [cx + w / 4, cy - h / 2],
          [cx + w / 2, cy],
          [cx + w / 4, cy + h / 2],
          [cx - w / 4, cy + h / 2],
        ],
        role,
        { id },
      );

    // core
    const coreRole = ctx.role(0, { neutral: true });
    const drawCore = () => {
      cell(0, 0, coreRole, ctx.uid(centerEntry?.id ?? "core"));
      if (centerEntry?.icon) ctx.icon(centerEntry.icon, 0, -26, 40, ctx.ink);
      ctx.label(ctx.wrap(centerLabel ?? "Core", w - 54, 20, "heading", 3), 0, centerEntry?.icon ? 20 : 0, { size: 20, color: coreRole.textColor, weight: 700, font: "heading" });
    };
    if (centerEntry) ctx.item(centerEntry.id, drawCore);
    else drawCore();

    // Ring cells sit in the core's true honeycomb neighbour slots (a gutter
    // g apart), filled in a balanced order for each count so a short ring
    // never leaves one cell floating or one side empty.
    const sideX = 0.75 * w + (Math.sqrt(3) / 2) * g;
    const upY = (h + g) / 2;
    const SLOT: Record<string, [number, number]> = {
      top: [0, -(h + g)],
      ur: [sideX, -upY],
      lr: [sideX, upY],
      bottom: [0, h + g],
      ll: [-sideX, upY],
      ul: [-sideX, -upY],
    };
    const ORDER: Record<number, string[]> = {
      1: ["top"],
      2: ["ul", "ur"],
      3: ["top", "lr", "ll"],
      4: ["ul", "ur", "lr", "ll"],
      5: ["top", "ur", "lr", "ll", "ul"],
      6: ["top", "ur", "lr", "bottom", "ll", "ul"],
    };
    const slots = ORDER[Math.min(Math.max(items.length, 1), 6)];
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const slot = slots[i];
        const [cx, cy] = SLOT[slot];
        cell(cx, cy, role, ctx.uid(item.id));
        if (item.icon) ctx.icon(item.icon, cx, cy - 24, 40, role.color);
        ctx.label(ctx.wrap(item.label, w - 50, 18, "heading", 3), cx, cy + (item.icon ? 20 : 0), { size: 18, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        // the comb is packed, so a detail goes OUTSIDE it, off the cell's
        // outward side (never under the cell, where the next cell sits)
        if (item.detail) {
          const opts = { size: 15, color: ctx.mutedInk, role: "detail" };
          if (slot === "top" || slot === "bottom") {
            const t = ctx.wrap(item.detail, w + 20, 15, "body", 2);
            const bh = t.split("\n").length * 15 * 1.25;
            ctx.label(t, cx, slot === "top" ? cy - h / 2 - 8 - bh / 2 : cy + h / 2 + 8 + bh / 2, opts);
          } else {
            const right = cx > 0;
            ctx.label(ctx.wrap(item.detail, 190, 15, "body", 3), cx + (right ? w / 2 + 14 : -w / 2 - 14), cy, { ...opts, align: right ? ("left" as const) : ("right" as const) });
          }
        }
      }),
    );
  },
});
