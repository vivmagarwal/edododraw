/**
 * Headless render of every viz demo to SVG (jsdom), for reference comparison.
 * Usage: npx tsx render-all.mts [outDir] [style]
 */
import { JSDOM } from "jsdom";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] ?? "/private/tmp/claude-501/-Users-vivmagarwal-Work-edodo-draw/02e39ec9-3827-408c-b68c-a31629038553/scratchpad/mine";
const style = process.argv[3];
mkdirSync(outDir, { recursive: true });

const dom = new JSDOM("<!doctype html><html><body><div id='host' style='width:1200px;height:900px'></div></body></html>", { pretendToBeVisual: true });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
try { (globalThis as any).navigator = dom.window.navigator; } catch { /* readonly in newer Node */ }
(globalThis as any).SVGSVGElement = dom.window.SVGSVGElement;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).XMLSerializer = dom.window.XMLSerializer;
(globalThis as any).Image = dom.window.Image;
(globalThis as any).btoa = dom.window.btoa;

// jsdom lacks layout: give the host a fake size
const { compileEdd } = await import("../../src/engine/dsl/index.js");
const { SvgRenderer } = await import("../../src/engine/render/svgRenderer.js");
const { exportSVGString } = await import("../../src/engine/export.js");
const { VIZ_DEMOS } = await import("../../src/site/vizDemos.js");

const host = dom.window.document.getElementById("host") as unknown as HTMLElement;
(host as any).getBoundingClientRect = () => ({ width: 1200, height: 900, x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 900 });

let fails = 0;
for (const demo of VIZ_DEMOS) {
  try {
    const src = style ? `meta { style: ${style} }\n${demo.code}` : demo.code;
    const { scene } = compileEdd(src);
    const renderer = new SvgRenderer(host);
    renderer.mount();
    renderer.render(scene);
    const svg = await exportSVGString(renderer, scene, { embedFont: false });
    writeFileSync(join(outDir, `${demo.type}.svg`), svg);
    renderer.destroy();
  } catch (e) {
    fails++;
    console.log(`FAIL ${demo.type}: ${(e as Error).message}`);
  }
}
console.log(`rendered ${VIZ_DEMOS.length - fails}/${VIZ_DEMOS.length} to ${outDir}`);
