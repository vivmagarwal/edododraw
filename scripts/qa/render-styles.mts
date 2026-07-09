/**
 * Headless render of one reference visual (3-set venn) in every style preset,
 * for comparison against visualization_demo-lab/data/vennstyles/vstyle-*.svg.
 */
import { JSDOM } from "jsdom";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "/private/tmp/claude-501/-Users-vivmagarwal-Work-edodo-draw/02e39ec9-3827-408c-b68c-a31629038553/scratchpad/styles-mine";
mkdirSync(outDir, { recursive: true });

const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>", { pretendToBeVisual: true });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).XMLSerializer = dom.window.XMLSerializer;

const { compileEdd } = await import("../../src/engine/dsl/index.js");
const { SvgRenderer } = await import("../../src/engine/render/svgRenderer.js");
const { exportSVGString } = await import("../../src/engine/export.js");
const { listReferencePresets } = await import("../../src/engine/style/presets.js");

const host = dom.window.document.getElementById("host") as unknown as HTMLElement;
(host as any).getBoundingClientRect = () => ({ width: 1200, height: 900, x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 900 });

const code = (style: string) => `meta { style: ${style} }
viz venn "Team Sweet Spot" {
  set "Skills" "What we're great at" { icon: star }
  set "Passion" "What we love doing" { icon: heart }
  set "Impact" "What moves the needle" { icon: trend-up }
  overlap all "Do more of this"
}`;

for (const preset of listReferencePresets()) {
  const { scene } = compileEdd(code(preset.name));
  const renderer = new SvgRenderer(host);
  renderer.mount();
  renderer.render(scene);
  const svg = await exportSVGString(renderer, scene, { embedFont: false });
  writeFileSync(join(outDir, `${preset.name}.svg`), svg);
  renderer.destroy();
}
console.log("styles rendered");
