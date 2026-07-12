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
        ctx.character(pose, cx, figH + 26, figH, { color: role.color, emotion, prop, propColor: role.color });
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
