/**
 * Label-collision audit — compiles EVERY viz demo + EVERY content variation
 * under EVERY style preset (pure, no DOM) and flags pairs of TEXT nodes whose
 * boxes overlap significantly. Different presets use different font stacks, so
 * layout shifts per preset; this catches the long-tail collisions at unusual
 * item counts that a single-render eyeball pass misses.
 *
 *   npx tsx scripts/qa/audit-collisions.mts [minScore]
 */
import "../../src/engine/viz/generators/index.js";
import { compileEdd } from "../../src/engine/dsl/index.js";
import { listStylePresets } from "../../src/engine/style/presets.js";
import { VIZ_DEMOS } from "../../src/site/vizDemos.js";
import { variationsFor } from "../../src/site/vizVariations.js";

const MIN = Number(process.argv[2] ?? 0.25); // overlap fraction of the smaller box

interface Hit { tmpl: string; variation: string; preset: string; a: string; b: string; frac: number }
const hits: Hit[] = [];
const presets = listStylePresets().map((p) => p.name);

for (const demo of VIZ_DEMOS) {
  const cases = [{ label: "demo", code: demo.code }, ...variationsFor(demo.type)];
  for (const c of cases) {
    for (const preset of presets) {
      const { scene } = compileEdd(c.code, { stylePreset: preset });
      const texts = scene.nodes.filter((n) => n.shape === "text" && n.label.trim());
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i];
          const b = texts[j];
          const iw = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const ih = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (iw < 7 || ih < 7) continue;
          const frac = (iw * ih) / Math.min(a.w * a.h, b.w * b.h);
          if (frac < MIN) continue;
          hits.push({ tmpl: demo.type, variation: c.label, preset, a: a.label.replace(/\n/g, "⏎").slice(0, 26), b: b.label.replace(/\n/g, "⏎").slice(0, 26), frac });
        }
      }
    }
  }
}

// aggregate: worst fraction per (template, variation, pair) + preset count
const agg = new Map<string, { frac: number; presets: number; sample: Hit }>();
for (const h of hits) {
  const key = `${h.tmpl}|${h.variation}|${h.a}|${h.b}`;
  const cur = agg.get(key);
  if (!cur) agg.set(key, { frac: h.frac, presets: 1, sample: h });
  else {
    cur.presets++;
    if (h.frac > cur.frac) { cur.frac = h.frac; cur.sample = h; }
  }
}
const rows = [...agg.values()].sort((x, y) => y.frac - x.frac);
for (const r of rows) {
  const h = r.sample;
  console.log(`${(r.frac * 100).toFixed(0).padStart(3)}%  ${String(r.presets).padStart(2)}p  ${h.tmpl.padEnd(22)} ${h.variation.padEnd(14)} "${h.a}" × "${h.b}"`);
}
console.log(`\n${rows.length} colliding pairs (${hits.length} hits) across ${VIZ_DEMOS.length} templates × ${presets.length} presets, threshold ${MIN}`);
