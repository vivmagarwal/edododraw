import { compileEdd } from "../../src/engine/dsl/index.js";
import { VIZ_DEMOS } from "../../src/site/vizDemos.js";
import { variationsFor } from "../../src/site/vizVariations.js";

let fails = 0, total = 0, missing: string[] = [];
for (const demo of VIZ_DEMOS) {
  const vars = variationsFor(demo.type);
  if (!vars.length) { missing.push(demo.type); continue; }
  for (const v of vars) {
    total++;
    try {
      const { scene, diagnostics } = compileEdd(v.code);
      const errs = diagnostics.items.filter((d) => d.severity === "error");
      const bad = scene.nodes.find((nd) => ![nd.x, nd.y, nd.w, nd.h].every(Number.isFinite));
      if (errs.length) { fails++; console.log(`ERR ${demo.type} / ${v.label}: ${errs.map((e) => e.code + " " + e.message).join("; ")}`); }
      else if (!scene.nodes.length) { fails++; console.log(`EMPTY ${demo.type} / ${v.label}`); }
      else if (bad) { fails++; console.log(`NAN ${demo.type} / ${v.label}: ${bad.id}`); }
    } catch (e) { fails++; console.log(`THROW ${demo.type} / ${v.label}: ${(e as Error).message}`); }
  }
}
console.log(`\n${total} variations across ${VIZ_DEMOS.length - missing.length} templates, ${fails} failures`);
if (missing.length) console.log(`No variations for: ${missing.join(", ")}`);
