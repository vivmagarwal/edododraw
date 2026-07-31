#!/usr/bin/env node
/**
 * Publish guard: import the BUILT package (dist-lib) and prove the character
 * library survived bundling. Catches two historical failure modes:
 *   - a stale dist-lib published without a rebuild
 *   - side-effect registration modules (viz/characters/*) tree-shaken away
 *     because the package.json `sideEffects` allowlist missed them (0.12.0).
 * Runs as part of prepublishOnly, after build:pkg.
 */
import { compileEdd, listCharacterPoses, listCharacterEmotions } from "../dist-lib/index.js";

const fail = (msg) => {
  console.error(`✗ check-dist: ${msg}`);
  process.exit(1);
};

const poses = listCharacterPoses();
const emotions = listCharacterEmotions();
if (poses.length < 40) fail(`expected ≥40 poses in the built lib, found ${poses.length} — side-effect registrations were tree-shaken or dist is stale`);
if (emotions.length < 20) fail(`expected ≥20 emotions, found ${emotions.length}`);
for (const p of ["standing", "star-pose", "tiptoeing", "meditating"]) {
  if (!poses.includes(p)) fail(`pose "${p}" missing from built lib`);
}

const src = `viz personas team "Cast" {
  item "Ms. Rivera" "Grade 6 teacher" { pose: star-pose, emotion: smug, hair: afro, accessory: headphones, fx: idea, prop: bulb }
  item "Sam" "Curious student" { pose: tiptoeing, emotion: curious, hair: pigtails, accessory: glasses, fx: question }
}`;
let out;
try {
  out = compileEdd(src);
} catch (e) {
  fail(`compileEdd threw on a personas source: ${e.message}`);
}
if (out.diagnostics.hasErrors) fail(`personas source produced compile errors: ${out.diagnostics.errors.map((d) => d.code).join(", ")}`);
const n = out.scene?.nodes?.length ?? 0;
if (n < 10) fail(`personas scene rendered only ${n} elements`);

// An unknown pose must degrade gracefully (fallback figure), never crash.
try {
  const bad = compileEdd(`viz quote "Hi" { by: "X", pose: not-a-real-pose }`);
  if ((bad.scene?.nodes?.length ?? 0) < 1) fail("unknown pose produced an empty scene instead of a fallback figure");
} catch (e) {
  fail(`compileEdd crashed on an unknown pose: ${e.message}`);
}

console.log(`✓ check-dist: ${poses.length} poses, ${emotions.length} emotions, personas compiles (${n} elements), unknown-pose fallback OK`);
