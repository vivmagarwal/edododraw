/**
 * Sketchnote-native visualizations (learned from the classic sketchnoting
 * vocabulary — skeleton library, character work, containers): personas,
 * quote, clouds, fishbone. Characters come from ../characters.ts.
 */

import { registerViz } from "../registry.js";
import { itemsOf, optStr, type VizSpec } from "../types.js";
import type { VizContext } from "../context.js";
import { listCharacterPoses } from "../characters.js";
import { lerp, scallopedBlob } from "./util.js";

/** Deterministic jitter (stable re-renders — no Math.random). */
const jit = (i: number, amp: number): number => Math.sin(i * 7.3) * amp;

// ---- personas -----------------------------------------------------------------

const PERSONA_POSES = ["waving", "confident", "thinking", "cheering", "presenting", "pointing"];

registerViz({
  name: "personas",
  category: "Brainstorming",
  summary: "A cast of sketchnote characters — one per role/persona, posed and labeled.",
  entryKinds: ["item", "persona", "role"],
  options: [],
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
        const emotion = typeof item.opts.emotion === "string" ? item.opts.emotion : undefined;
        const prop = typeof item.opts.prop === "string" ? item.opts.prop : item.icon;
        const shirt = typeof item.opts.shirt === "string" ? item.opts.shirt : undefined;
        const shirtColor = typeof item.opts.shirtColor === "string" ? item.opts.shirtColor : undefined;
        ctx.character(pose, cx, figH + 26, figH, { color: role.color, emotion, prop, propColor: role.color, shirt, shirtColor });
        // ground stroke under each figure
        ctx.line([[cx - 34, figH + 28], [cx + 34, figH + 28]], { color: ctx.mutedInk, width: 1.6 });
        ctx.labelBlock(item.label, item.detail, cx, figH + 52, { color: role.color, align: "center", maxW: 180, vAnchor: "top", size: 18 });
      }),
    );
  },
});

// ---- quote --------------------------------------------------------------------

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
    { name: "shirt", type: "string", description: "character shirt style (vest/tee/striped/solid/tie/dress/hoodie)" },
  ],
  sweetSpot: { min: 1, max: 1 },
  generate(spec: VizSpec, ctx: VizContext) {
    const quoteEntry = spec.items.find((i) => i.kind === "quote" || i.kind === "item");
    const text = quoteEntry?.label ?? spec.title ?? "…";
    if (!quoteEntry && spec.title) ctx.titleHandled = true;
    const by = spec.items.find((i) => i.kind === "by")?.label ?? optStr(spec.options, "by");
    const accent = ctx.role(0, { n: 1 }).color;

    const wrapped = ctx.wrap(text, 430, 27, "heading", 5);
    const lines = wrapped.split("\n").length;
    const qh = lines * 27 * 1.3;
    const qx = 250; // quote block center
    // giant opening quote mark, slightly above-left of the text
    ctx.label("“", qx - 240, 6, { size: 86, color: accent, weight: 700, font: "title" });
    const drawQuote = () => {
      ctx.label(wrapped, qx, qh / 2 + 14, { size: 27, color: ctx.ink, weight: 700, font: "heading" });
      // flourish underline
      ctx.line(
        [
          [qx - 160, qh + 34],
          [qx + 160, qh + 30],
        ],
        { color: accent, width: 2.6 },
      );
      if (by) ctx.label(`— ${by}`, qx + 200, qh + 58, { size: 17, color: ctx.mutedInk, align: "right" });
    };
    if (quoteEntry) ctx.item(quoteEntry.id, drawQuote);
    else drawQuote();

    // the messenger: a character presenting the quote
    const pose = optStr(spec.options, "pose") ?? "presenting";
    if (pose !== "none" && listCharacterPoses().includes(pose)) {
      ctx.character(pose, qx - 306, qh + 112, 126, {
        color: ctx.ink,
        emotion: optStr(spec.options, "emotion"),
        prop: optStr(spec.options, "prop"),
        propColor: accent,
        shirt: optStr(spec.options, "shirt"),
        shirtColor: accent,
      });
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

    // spine with a fish tail at the start, arrowing into the head
    ctx.line([[24, -26], [0, 0], [24, 26]], { color: ctx.ink, width: 2.6 });
    ctx.arrow(6, 0, spineEnd + 4, 0, { color: ctx.ink, width: 3 });

    // head: the effect, in a rounded box at the spine's end
    const headText = ctx.wrap(effect, 150, 17, "heading", 4);
    const headW = Math.max(120, ...headText.split("\n").map((l) => ctx.measure(l, 17, "heading"))) + 30;
    const headH = headText.split("\n").length * 23 + 24;
    const drawHead = () => {
      ctx.shape("round-rectangle", spineEnd + 12, -headH / 2, headW, headH, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.4, roughness: ctx.preset.roughness, roundness: 12 }, { id: ctx.uid("effect") });
      ctx.label(headText, spineEnd + 12 + headW / 2, 0, { size: 17, color: ctx.ink, weight: 700, font: "heading" });
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
        ctx.labelBlock(bone.label, undefined, end[0], end[1] + sign * 12, { color: role.color, align: "center", maxW: 160, vAnchor: up ? "bottom" : "top" });
        // causes: ticks off the bone, labels trailing toward the tail
        bone.children.slice(0, 4).forEach((cause, j) => {
          const t = 0.78 - j * 0.2;
          const px = lerp(ax, end[0], t);
          const py = lerp(0, end[1], t);
          ctx.line([[px, py], [px - 40, py]], { color: ctx.mutedInk, width: 1.4 });
          ctx.label(ctx.wrap(cause.label, 128, 13, "body", 2), px - 46, py, { size: 13, color: ctx.ink, align: "right" });
        });
      }),
    );
  },
});

// ---- head-thoughts --------------------------------------------------------------

registerViz({
  name: "head-thoughts",
  category: "Brainstorming",
  summary: "A profile-head container — what's going on in someone's mind.",
  entryKinds: ["item", "thought"],
  options: [{ name: "who", type: "string", description: "caption under the head" }],
  sweetSpot: { min: 2, max: 5 },
  generate(spec: VizSpec, ctx: VizContext) {
    const items = itemsOf(spec, "item", "thought").slice(0, 6);
    const n = Math.max(items.length, 1);
    // side-profile head (facing right), designed in a 300×360 box
    const HEAD_D =
      "M150 10 C 220 10 268 58 272 128 C 274 162 264 180 276 196 L 292 218 L 272 226 " +
      "L 274 252 C 274 268 260 274 240 270 L 218 266 C 214 292 206 318 182 340 L 96 340 " +
      "C 60 300 30 260 30 180 C 30 80 80 10 150 10 Z";
    const W = 330;
    const H = 396;
    ctx.path(HEAD_D, 300, 360, 0, 0, W, H, { stroke: ctx.ink, fill: null, fillStyle: "none", strokeWidth: 2.6, roughness: ctx.preset.roughness }, { id: ctx.uid("head") });

    // thoughts stacked inside the cranium
    const slots: Array<[number, number]> = [
      [142, 90],
      [146, 156],
      [142, 222],
      [134, 288],
      [148, 122],
      [146, 190],
    ];
    const order = n <= 4 ? [0, 1, 2, 3] : [4, 5, 2, 3, 0, 1];
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const [sx, sy] = slots[n <= 4 ? order[i] : order[i % order.length]];
        const px = (sx / 300) * W;
        const py = (sy / 360) * H;
        if (item.icon) {
          ctx.icon(item.icon, px - 62, py, 24, role.color);
          ctx.label(ctx.wrap(item.label, 118, 14, "heading", 2), px - 44, py, { size: 14, color: role.color, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" });
        } else {
          ctx.shape("circle", px - 66, py - 4, 8, 8, { stroke: role.color, fill: role.color, fillStyle: "solid", strokeWidth: 1, roughness: 0.5 });
          ctx.label(ctx.wrap(item.label, 128, 14, "heading", 2), px - 50, py, { size: 14, color: role.color, weight: ctx.preset.fonts.headingWeight, font: "heading", align: "left" });
        }
      }),
    );
    const who = optStr(spec.options, "who");
    if (who) ctx.label(who, W * 0.42, H + 26, { size: 17, color: ctx.mutedInk, weight: 700, font: "heading" });
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

    const w = 172;
    const h = 150;
    const ringR = h * 1.06;
    const cell = (cx: number, cy: number, role: ReturnType<typeof ctx.role>, id?: string) =>
      ctx.shape("hexagon", cx - w / 2, cy - h / 2, w, h, role, { id });

    // core
    const coreRole = ctx.role(0, { neutral: true });
    const drawCore = () => {
      cell(0, 0, coreRole, ctx.uid(centerEntry?.id ?? "core"));
      if (centerEntry?.icon) ctx.icon(centerEntry.icon, 0, -22, 30, coreRole.textColor);
      ctx.label(ctx.wrap(centerLabel ?? "Core", w - 60, 17, "heading", 3), 0, centerEntry?.icon ? 14 : 0, { size: 17, color: coreRole.textColor, weight: 700, font: "heading" });
    };
    if (centerEntry) ctx.item(centerEntry.id, drawCore);
    else drawCore();

    // ring cells at 60° steps, starting top
    items.forEach((item, i) =>
      ctx.item(item.id, () => {
        const role = ctx.role(i, { n, color: item.color });
        const ang = -90 + (i * 360) / Math.max(n, 3);
        const cx = Math.cos((ang * Math.PI) / 180) * ringR * 1.35;
        const cy = Math.sin((ang * Math.PI) / 180) * ringR;
        cell(cx, cy, role, ctx.uid(item.id));
        if (item.icon) ctx.icon(item.icon, cx, cy - 26, 26, role.textColor);
        ctx.label(ctx.wrap(item.label, w - 56, 15, "heading", 3), cx, cy + (item.icon ? 12 : 0), { size: 15, color: role.textColor, weight: ctx.preset.fonts.headingWeight, font: "heading" });
        if (item.detail) ctx.label(ctx.wrap(item.detail, w + 10, 13, "body", 2), cx, cy + h / 2 + 20, { size: 13, color: ctx.mutedInk, role: "detail" });
      }),
    );
  },
});
