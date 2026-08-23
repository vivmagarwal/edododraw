/** Duplicate-face audit: renders every emotion on the same pose and compares
 *  the emitted geometry signature. Two emotions that produce the SAME signature
 *  are literally the same drawing — a director asking for one gets the other.
 *  Usage: npx tsx scripts/qa/audit-faces.mts */
import { VizContext } from "../../src/engine/viz/context.js";
import { DiagnosticBag } from "../../src/engine/dsl/diagnostics.js";
import { effectivePreset } from "../../src/engine/style/presets.js";
import { drawCharacter, listCharacterEmotions, listCharacterPoses, getCharacterPose } from "../../src/engine/viz/characters.js";

const sig = (emotion: string): string => {
  const ctx = new VizContext("t", effectivePreset(undefined, "light"), "light", new DiagnosticBag());
  drawCharacter(ctx, 0, 100, 100, { pose: "standing", emotion });
  return ctx.nodes
    .map((n) => [n.shape, n.x.toFixed(3), n.y.toFixed(3), n.w.toFixed(3), n.h.toFixed(3), n.label ?? "", JSON.stringify((n.data as any)?.points ?? null)].join("|"))
    .join("\n");
};

const byS = new Map<string, string[]>();
for (const e of listCharacterEmotions()) {
  const s = sig(e);
  (byS.get(s) ?? byS.set(s, []).get(s)!).push(e);
}
let dupes = 0;
for (const [, names] of byS) if (names.length > 1) { dupes++; console.log(`DUPLICATE FACES: ${names.join(" ≡ ")}`); }
console.log(dupes ? `\n${dupes} duplicate group(s) across ${listCharacterEmotions().length} emotions` : `no duplicates across ${listCharacterEmotions().length} emotions`);

const defaulted = listCharacterPoses().filter((p) => getCharacterPose(p)?.emotion === "determined");
console.log(`\nposes defaulting to "determined" (${defaulted.length}): ${defaulted.join(", ") || "none"}`);
const noEmotion = listCharacterPoses().filter((p) => !getCharacterPose(p)?.emotion);
console.log(`poses with NO declared emotion (${noEmotion.length}): ${noEmotion.join(", ") || "none"}`);
