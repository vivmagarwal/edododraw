/** Completeness audit: every registered template must have a demo, content
 *  variations, catalog + ranges rows in VISUALIZATIONS_GUIDE, and metadata. */
import { readFileSync } from "node:fs";
import "../../src/engine/viz/generators/index.js";
import { listVizTemplates } from "../../src/engine/viz/registry.js";
import { VIZ_DEMOS } from "../../src/site/vizDemos.js";
import { variationsFor } from "../../src/site/vizVariations.js";

const all = listVizTemplates();
console.log("registry:", all.length);
const demoTypes = new Set(VIZ_DEMOS.map((d) => d.type));
const guide = readFileSync("docs/VISUALIZATIONS_GUIDE.md", "utf8");

const miss: Record<string, string[]> = { demo: [], variations: [], guide: [], ranges: [], summary: [], sweetSpot: [] };
const ranges = guide.split("## 3.")[1]?.split("## 4.")[0] ?? "";
for (const t of all) {
  const base = t.name.startsWith("mindmap-") ? "mindmap" : t.name;
  if (!demoTypes.has(base)) miss.demo.push(t.name);
  if (!variationsFor(base).length) miss.variations.push(t.name);
  if (!guide.includes("`" + base + "`")) miss.guide.push(t.name);
  if (!ranges.includes("`" + base + "`") && !ranges.includes(base)) miss.ranges.push(t.name);
  if (!t.summary) miss.summary.push(t.name);
  if (!t.sweetSpot && !["gauge", "hole", "bottleneck", "mindmap-left", "mindmap-right", "mindmap-horizontal", "mindmap-vertical"].includes(t.name)) miss.sweetSpot.push(t.name);
}
let bad = 0;
for (const [k, v] of Object.entries(miss)) {
  if (v.length) { console.log(`MISSING ${k}:`, v.join(", ")); bad += v.length; }
}
console.log(bad ? `\n${bad} gaps` : "\nall complete ✓");
process.exit(bad ? 1 : 0);
