/**
 * Generate `public/llms-full.txt` (and `public/llms.txt`) — a single,
 * deterministic, LLM-consumable file containing EVERY documentation guide and
 * EVERY runnable example, concatenated from the repo's single source of truth
 * (`docs/*.md` + `examples/*.edd`). Regenerated on every build (`prebuild`), so
 * the file served at https://vivmagarwal.github.io/edododraw/llms-full.txt is
 * always in lockstep with the docs. Deterministic: fixed order, no timestamps.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Registry-driven template reference (run via tsx — see the prebuild script).
import "../src/engine/viz/generators/index.js";
import { listVizTemplates } from "../src/engine/viz/registry.js";
import { listIcons } from "../src/engine/viz/icons.js";
import { listCharacterPoses, listCharacterEmotions, listCharacterShirts, listCharacterHair, listCharacterAccessories, listCharacterFx } from "../src/engine/viz/characters.js";
import { listStyleChoices } from "../src/engine/style/presets.js";
import { VIZ_DEMOS } from "../src/site/vizDemos.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const SITE = pkg.homepage.replace(/\/$/, "");

// [file, title, site slug] — same order as the docs site nav.
const DOCS = [
  ["DSL_LANGUAGE_GUIDE.md", "Language reference", "language"],
  ["VISUALIZATIONS_GUIDE.md", "Visualizations", "visualizations"],
  ["STYLES_GUIDE.md", "Style presets", "styles"],
  ["CAMERA_AND_TIMELINE_GUIDE.md", "Camera & timeline", "camera-timeline"],
  ["ANNOTATIONS_GUIDE.md", "Annotations", "annotations"],
  ["IMPORT_AND_EXPORT_GUIDE.md", "Import & export", "import-export"],
  ["INTEGRATION_GUIDE.md", "Embed in your app", "integration"],
  ["EXTENDING_GUIDE.md", "Extend & make plugins", "extending"],
  ["ARCHITECTURE.md", "Architecture", "architecture"],
  ["DEVELOPMENT_STANDARDS.md", "Development standards", "development"],
];

const L = [];
L.push(`# EDodoDraw — complete documentation (v${pkg.version})`);
L.push("");
L.push(`> ${pkg.description}`);
L.push(">");
L.push(`> This ONE file is the full, LLM-consumable documentation for EDodoDraw. It`);
L.push(`> concatenates every guide and every runnable example, generated verbatim`);
L.push(`> from the source repo — nothing is summarised or omitted.`);
L.push("");
L.push(`- Live site (rendered docs + live demos): ${SITE}/`);
L.push(`- npm package: https://www.npmjs.com/package/${pkg.name}  (\`npm i ${pkg.name}\`)`);
L.push(`- Source repo: ${pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")}`);
L.push("");
L.push(`What EDodoDraw is: a 100% code/syntax-to-diagram engine with the Excalidraw`);
L.push(`hand-drawn look, a magic-move camera, scriptable + real-time annotations,`);
L.push(`animated arrows, and first-class Mermaid import. You write \`.edd\` source; it`);
L.push(`renders a diagram. Use it via the DSL (see "Language reference") and/or embed`);
L.push(`it in an app via the \`EdodoDraw\` facade (see "Embed in your app").`);
L.push("");
L.push("## Contents");
L.push("");
DOCS.forEach(([, title], i) => L.push(`${i + 1}. ${title}`));
L.push(`${DOCS.length + 1}. Runnable examples (.edd)`);
L.push("");
L.push("=".repeat(78));
L.push("");

for (const [file, title] of DOCS) {
  const md = readFileSync(join(root, "docs", file), "utf8").replace(/\s+$/, "");
  L.push(`# ═══ ${title}  (docs/${file}) ═══`);
  L.push("");
  L.push(md);
  L.push("");
  L.push("=".repeat(78));
  L.push("");
}

// ---- generated per-template reference (from the live registry) --------------
const templates = listVizTemplates();
const demoOf = (name) => VIZ_DEMOS.find((d) => d.type === (name.startsWith("mindmap-") ? "mindmap" : name));
L.push(`# ▸ Visualization template reference — all ${templates.length} templates (generated from the registry)`);
L.push("");
L.push(`Every template below is used as \`viz <name> [id] ["Title"] { options + entries }\`.`);
L.push(`Universal per-item attributes: \`icon:\` (glyph), \`color:\`/\`fill:\`, \`detail:\` (description), \`showValue: false\`.`);
L.push(`Universal block options: \`showValues: false\` (values drive geometry, numbers not printed) and`);
L.push(`AUTO-CHOREOGRAPHY — \`animate: true|fade|pop|draw-on\` synthesizes a timeline beat per data item`);
L.push(`(plus \`hold: <seconds>\` dwell and \`animateCamera: true\` for per-item magic-move focus), making any`);
L.push(`template a narrated build for the player or a frame-driven video host (stepStateAt()).`);
L.push(`Every element a template emits for one data entry is addressable as \`<blockId>.<itemId>\` in`);
L.push(`annotations, timeline reveal/hide, and camera focus.`);
L.push("");
L.push(`Style presets (any template × any preset, \`meta { style: <name> }\`): ${listStyleChoices().map((s) => s.name).join(", ")}.`);
L.push(`Icons (\`icon: <name>\`): ${listIcons().join(" ")}.`);
L.push(`Characters (personas/quote items: \`{ pose: …, emotion: …, shirt: …, hair: …, accessory: …, fx: …, prop: <icon> }\`) — poses: ${listCharacterPoses().join(" ")}; emotions: ${listCharacterEmotions().join(" ")}; shirts: ${listCharacterShirts().join(" ")}; hair: ${listCharacterHair().join(" ")}; accessories: ${listCharacterAccessories().join(" ")}; fx: ${listCharacterFx().join(" ")}.`);
L.push(`Sketchnote container shapes (usable on any node via \`shape:\` or as keywords): speech-bubble, starburst, ribbon, paper-fold (+ cloud, note, document).`);
L.push("");
let lastCat = "";
for (const t of templates) {
  if (t.category !== lastCat) {
    lastCat = t.category;
    L.push(`## ${t.category}`);
    L.push("");
  }
  L.push(`### viz ${t.name}`);
  L.push("");
  L.push(t.summary);
  const bits = [];
  if (t.aliases.length) bits.push(`aliases: ${t.aliases.join(", ")}`);
  bits.push(`entry kinds: ${t.entryKinds.join(", ")}`);
  if (t.sweetSpot) bits.push(`sweet spot: ${t.sweetSpot.min}\u2013${t.sweetSpot.max} items`);
  L.push(`- ${bits.join("  |  ")}`);
  for (const o of t.options) L.push(`- option \`${o.name}:\` (${o.type})${o.description ? ` — ${o.description}` : ""}`);
  const demo = demoOf(t.name);
  if (demo && !t.name.startsWith("mindmap-")) {
    L.push("");
    L.push("```edd");
    L.push(demo.code);
    L.push("```");
  } else if (t.name.startsWith("mindmap-")) {
    L.push(`- layout variant of \`mindmap\` (same data model; see the mindmap example).`);
  }
  L.push("");
}
L.push("=".repeat(78));
L.push("");

L.push(`# ▸ Runnable examples (examples/*.edd)`);
L.push("");
L.push(`Each is a complete EDodoDraw program. Paste any into the playground`);
L.push(`(${SITE}/#/playground) or compile it with \`compileEdd(source)\`.`);
L.push("");
const examples = readdirSync(join(root, "examples")).filter((f) => f.endsWith(".edd")).sort();
for (const ex of examples) {
  const src = readFileSync(join(root, "examples", ex), "utf8").replace(/\s+$/, "");
  L.push(`## examples/${ex}`);
  L.push("");
  L.push("```edd");
  L.push(src);
  L.push("```");
  L.push("");
}

const full = L.join("\n") + "\n";
writeFileSync(join(root, "public", "llms-full.txt"), full);

// Short index (the /llms.txt convention: a map that points at the full file).
const idx =
  [
    `# ${pkg.name}`,
    "",
    `> ${pkg.description}`,
    "",
    `Everything an LLM needs in ONE file: ${SITE}/llms-full.txt`,
    "",
    "## Docs",
    ...DOCS.map(([, title, slug]) => `- [${title}](${SITE}/#/docs/${slug})`),
    "",
    "## Visualizations (" + listVizTemplates().length + " templates \u00d7 " + listStyleChoices().length + " style presets)",
  "All usable as `viz <name> { item \"Label\" ... }`; full reference with runnable examples in llms-full.txt:",
  listVizTemplates().map((t) => t.name).join(", "),
  "",
  "## Links",
    `- Full docs (single file): ${SITE}/llms-full.txt`,
    `- Playground: ${SITE}/#/playground`,
    `- npm: https://www.npmjs.com/package/${pkg.name}`,
    `- Repo: ${pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")}`,
  ].join("\n") + "\n";
writeFileSync(join(root, "public", "llms.txt"), idx);

console.log(
  `wrote public/llms-full.txt (${full.length} chars, ${DOCS.length} guides + ${examples.length} examples) and public/llms.txt`,
);
