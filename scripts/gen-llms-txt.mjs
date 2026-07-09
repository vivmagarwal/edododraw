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
