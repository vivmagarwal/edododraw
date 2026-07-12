/** Character QA sheet: every pose (with props) + every emotion, rendered
 *  large so joint-level breakage is visible. Usage: npx tsx render-characters.mts [outDir] [style] */
import { JSDOM } from "jsdom";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "char-qa";
const style = process.argv[3];
mkdirSync(outDir, { recursive: true });
const dom = new JSDOM("<!doctype html><html><body><div id='host' style='width:1800px;height:900px'></div></body></html>", { pretendToBeVisual: true });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).SVGSVGElement = dom.window.SVGSVGElement;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).XMLSerializer = dom.window.XMLSerializer;

const { compileEdd } = await import("../../src/engine/dsl/index.js");
const { SvgRenderer } = await import("../../src/engine/render/svgRenderer.js");
const { exportSVGString } = await import("../../src/engine/export.js");
const { listCharacterPoses, listCharacterEmotions, listCharacterShirts } = await import("../../src/engine/viz/characters.js");

const host = dom.window.document.getElementById("host") as unknown as HTMLElement;
(host as any).getBoundingClientRect = () => ({ width: 1800, height: 900, x: 0, y: 0, top: 0, left: 0, right: 1800, bottom: 900 });

const PROPS: Record<string, string> = { cheering: "star", "holding-overhead": "trophy", presenting: "flag", thinking: "bulb", confident: "gear", standing: "heart", carrying: "doc", searching: "search", jumping: "star", sitting: "phone", "arms-crossed": "warning", meditating: "leaf" };
const meta = style ? `meta { style: ${style} }\n` : "";
const chunk = <T,>(arr: T[], n: number): T[][] => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
// stacked rows of 4 keep the sheet near-square (thumbnailers crop wide strips)
// two 4-figure rows per FILE — near-square sheets survive any thumbnailer
const poseRows = chunk(listCharacterPoses(), 4).map((row, r) => `viz personas poses${r} {\n` + row.map((p) => `  item "${p}" { pose: ${p}${PROPS[p] ? `, prop: ${PROPS[p]}` : ""} }`).join("\n") + "\n}");
const poseSheets = chunk(poseRows, 2).map((pair) => meta + pair.join("\n"));
const emoSrc = meta + chunk(listCharacterEmotions(), 5)
  .map((row, r) => `viz personas emotions${r} ${r === 0 ? '"Emotions"' : ""} {\n` + row.map((e) => `  item "${e}" { pose: standing, emotion: ${e} }`).join("\n") + "\n}")
  .join("\n");

const shirtSrc = meta + chunk(listCharacterShirts(), 4)
  .map((row, r) => `viz personas shirts${r} ${r === 0 ? '"Shirts"' : ""} {\n` + row.map((sh) => `  item "${sh}" { pose: standing, shirt: ${sh} }`).join("\n") + "\n}")
  .join("\n");

const sheets: Array<[string, string]> = [...poseSheets.map((src, i) => [`poses-${i + 1}`, src] as [string, string]), ["emotions", emoSrc], ["shirts", shirtSrc]];
for (const [name, src] of sheets) {
  const { scene, diagnostics } = compileEdd(src);
  if (diagnostics.errors.length) throw new Error(String(diagnostics.errors[0]?.message));
  const r = new SvgRenderer(host);
  r.mount();
  r.render(scene);
  writeFileSync(join(outDir, `${name}${style ? `-${style}` : ""}.svg`), await exportSVGString(r, scene, { embedFont: false }));
}
console.log(`wrote pose + emotion sheets to ${outDir}`);
