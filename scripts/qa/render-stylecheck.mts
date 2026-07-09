import { JSDOM } from "jsdom";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const dom = new JSDOM("<!doctype html><body><div id=h></div>", { pretendToBeVisual: true });
(globalThis as any).window = dom.window; (globalThis as any).document = dom.window.document;
(globalThis as any).XMLSerializer = dom.window.XMLSerializer;
const { compileEdd } = await import("../../src/engine/dsl/index.js");
const { SvgRenderer } = await import("../../src/engine/render/svgRenderer.js");
const { exportSVGString } = await import("../../src/engine/export.js");
const { listStyleChoices } = await import("../../src/engine/style/presets.js");
const host = dom.window.document.getElementById("h") as any;
host.getBoundingClientRect = () => ({ width: 1000, height: 800, x:0,y:0,top:0,left:0,right:1000,bottom:800 });
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const venn = (style?: string) => `${style ? `meta { style: ${style} }\n` : ""}viz venn "Product Sweet Spot" {
  set "Desirable" "What users want" { icon: heart }
  set "Feasible" "What we can build" { icon: gear }
  set "Viable" "What sustains us" { icon: dollar }
  overlap all "Great products"
}`;
const scene = `scene {
  layout dag { direction: right, gap: 60 }
  actor user "User"
  hexagon gw "Gateway"
  round-rect api "API"
  cylinder db "Postgres"
  round-rect cache "Cache"
  user --> gw --> api
  api --> db
  api -.-> cache "warm"
}`;
const items: Array<[string,string]> = [["_scene-default", scene]];
for (const p of listStyleChoices()) items.push([p.name, venn(p.name)]);
for (const [name, src] of items) {
  const { scene: sc } = compileEdd(src);
  const r = new SvgRenderer(host); r.mount(); r.render(sc);
  writeFileSync(join(OUT, `${name}.svg`), await exportSVGString(r, sc, { embedFont:false })); r.destroy();
}
console.log("rendered", items.length, "→", items.map(i=>i[0]).join(", "));
