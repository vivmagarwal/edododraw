import { JSDOM } from "jsdom";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const dom = new JSDOM("<!doctype html><body><div id=h></div>", { pretendToBeVisual: true });
(globalThis as any).window = dom.window; (globalThis as any).document = dom.window.document;
(globalThis as any).XMLSerializer = dom.window.XMLSerializer;
const { compileEdd } = await import("../../src/engine/dsl/index.js");
const { SvgRenderer } = await import("../../src/engine/render/svgRenderer.js");
const { exportSVGString } = await import("../../src/engine/export.js");
const { VIZ_DEMOS } = await import("../../src/site/vizDemos.js");
const { variationsFor } = await import("../../src/site/vizVariations.js");
const host = dom.window.document.getElementById("h") as any;
host.getBoundingClientRect = () => ({ width: 1000, height: 800, x:0,y:0,top:0,left:0,right:1000,bottom:800 });
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const manifest: Record<string,string[]> = {};
for (const demo of VIZ_DEMOS) {
  manifest[demo.type] = [];
  for (const v of variationsFor(demo.type)) {
    const { scene } = compileEdd(v.code);
    const r = new SvgRenderer(host); r.mount(); r.render(scene);
    const slug = `${demo.type}__${v.label.replace(/[^a-z0-9]+/gi,"-")}`;
    writeFileSync(join(OUT, `${slug}.svg`), await exportSVGString(r, scene, { embedFont:false })); r.destroy();
    manifest[demo.type].push(slug);
  }
}
writeFileSync(join(OUT, "_manifest.json"), JSON.stringify(manifest));
console.log("rendered variations for", Object.keys(manifest).length, "templates");
