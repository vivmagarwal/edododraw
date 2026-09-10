/**
 * Compile-safety probe: compile `.edd` sources in a SEPARATE, memory-capped
 * process and report timing per source.
 *
 * Why a separate process: a compiler bug that spins (the `parseReveal` hang
 * fixed in 0.15.0 — `reveal a with draw-on; narrate: "hi"` looped forever and
 * OOM'd) is a BLOCKING synchronous loop. An in-process test timeout cannot
 * interrupt one: the timer never gets a turn, so the whole test run wedges and
 * CI hangs instead of failing. Run the compile out-of-process with a kill
 * timeout and a hang becomes a normal, fast test failure.
 *
 * Usage:
 *   tsx scripts/qa/parse-probe.mts file.edd [more.edd …]   # compile files
 *   echo '["scene { a }", …]' | tsx scripts/qa/parse-probe.mts --stdin
 *
 * Prints one JSON object per source to stdout and exits non-zero if any source
 * failed to compile (a compile ERROR is a failure; warnings are reported).
 */

import { readFileSync } from "node:fs";
import { compileEdd } from "../../src/engine/dsl/index.js";

const args = process.argv.slice(2);
const useStdin = args.includes("--stdin");
const files = args.filter((a) => !a.startsWith("--"));

const sources: { name: string; src: string }[] = useStdin
  ? (JSON.parse(readFileSync(0, "utf8")) as string[]).map((src, i) => ({ name: `stdin[${i}]`, src }))
  : files.map((f) => ({ name: f, src: readFileSync(f, "utf8") }));

let failed = 0;
for (const { name, src } of sources) {
  const t0 = Date.now();
  try {
    const { scene, diagnostics } = compileEdd(src);
    const errors = diagnostics.items.filter((d) => d.severity === "error");
    if (errors.length) failed++;
    process.stdout.write(
      JSON.stringify({
        name,
        ok: errors.length === 0,
        ms: Date.now() - t0,
        nodes: scene.nodes.length,
        edges: scene.edges.length,
        steps: scene.steps.length,
        codes: diagnostics.items.map((d) => d.code),
        errors: errors.map((d) => d.message),
      }) + "\n",
    );
  } catch (err) {
    failed++;
    process.stdout.write(JSON.stringify({ name, ok: false, ms: Date.now() - t0, threw: (err as Error).message }) + "\n");
  }
}

process.exit(failed === 0 ? 0 : 1);
