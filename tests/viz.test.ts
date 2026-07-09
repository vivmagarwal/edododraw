/**
 * Viz templates + style presets — compile-level guarantees:
 *  - every built-in template renders every gallery demo under every preset
 *    with zero error diagnostics and finite geometry
 *  - the registry exposes all 62 reference layouts
 *  - role styles keep label colors readable on their canvas
 */

import { describe, expect, it } from "vitest";
import { compileEdd } from "../src/engine/dsl/index.js";
import { getViz, listViz, listVizAliases } from "../src/engine/viz/registry.js";
import { VIZ_ALIASES } from "../src/engine/viz/aliases.js";
import { listStylePresets, listReferencePresets, roleStyle, getStylePreset } from "../src/engine/style/presets.js";
import { luma } from "../src/engine/style/color.js";
import { VIZ_DEMOS } from "../src/site/vizDemos.js";
import { variationsFor } from "../src/site/vizVariations.js";

/** The 62 unique layouts from the reference catalog (07-visual-catalog.md). */
const REFERENCE_LAYOUTS = [
  "mindmap-horizontal", "mindmap-vertical", "mindmap-left", "mindmap-right", "mindmap",
  "flowchart", "sequence", "stairs", "journey", "cycle", "gantt",
  "bar", "bar-horizontal", "stacked-bar", "stacked-bar-horizontal", "line", "area",
  "waterfall", "gauge", "pie", "drop-off", "dumbbell-vertical", "dumbbell-horizontal", "sankey",
  "timeline", "pros-and-cons", "table", "versus", "balance", "relationship", "podium",
  "decision", "spectrum", "quadrant", "venn", "swot", "pestel", "porters", "pyramid",
  "bullseye", "funnel", "key-ideas", "list", "diverge", "converge", "iceberg",
  "problem-solution", "transformation", "challenges", "bridge", "vision", "impact",
  "performance", "bottleneck", "hole", "trend", "race", "dialogue", "lens", "prism",
  "pillar", "root-causes",
];

describe("viz registry", () => {
  it("covers all 62 reference layouts", () => {
    const missing = REFERENCE_LAYOUTS.filter((name) => !getViz(name));
    expect(missing).toEqual([]);
  });

  it("every demo has a registered generator", () => {
    for (const demo of VIZ_DEMOS) expect(getViz(demo.type), demo.type).toBeTruthy();
  });

  it("defs carry category + summary", () => {
    for (const def of listViz()) {
      expect(def.category.length, def.name).toBeGreaterThan(0);
      expect(def.summary.length, def.name).toBeGreaterThan(0);
    }
  });
});

describe("viz aliases (LLM-friendly synonyms)", () => {
  it("every alias resolves to its canonical template", () => {
    const problems: string[] = [];
    for (const [canonical, aliases] of Object.entries(VIZ_ALIASES)) {
      if (!getViz(canonical)) problems.push(`missing canonical ${canonical}`);
      for (const a of aliases) {
        const def = getViz(a);
        if (!def) problems.push(`unregistered alias ${a}`);
        else if (def.name !== canonical) problems.push(`${a} -> ${def.name}, expected ${canonical}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("no alias shadows a canonical template name", () => {
    const canonicals = new Set(listViz().map((d) => d.name));
    const clashes = Object.values(VIZ_ALIASES).flat().filter((a) => canonicals.has(a));
    expect(clashes).toEqual([]);
  });

  it("no duplicate aliases across templates", () => {
    const all = Object.values(VIZ_ALIASES).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("natural-language synonyms compile", () => {
    const cases: Record<string, string> = {
      leaderboard: `viz leaderboard "Top" { item "A"; item "B"; item "C" }`,
      "conversion-funnel": `viz conversion-funnel "F" { item "Leads" 100; item "Won" 10 }`,
      "cause-effect": `viz cause-effect "Why" { item "A" "x"; item "B" "y" }`,
      constraint: `viz constraint "Neck" { in: "30"; out: "8" }`,
      "mind-map": `viz mind-map "M" { item "A" { item "x" } }`,
      "venn-diagram": `viz venn-diagram "V" { set "A"; set "B" }`,
    };
    for (const [alias, src] of Object.entries(cases)) {
      const { scene, diagnostics } = compileEdd(src);
      const errors = diagnostics.items.filter((d) => d.severity === "error");
      expect(errors, `${alias}: ${errors.map((e) => e.message).join("; ")}`).toEqual([]);
      expect(scene.nodes.length, alias).toBeGreaterThan(0);
    }
  });

  it("exposes the alias index for docs", () => {
    expect(listVizAliases().length).toBeGreaterThanOrEqual(Object.values(VIZ_ALIASES).flat().length);
  });
});

describe("viz demos × style presets", () => {
  const presets = listStylePresets().map((p) => p.name);

  it.each(VIZ_DEMOS.map((d) => [d.type, d] as const))("%s renders under every preset", (_type, demo) => {
    for (const preset of presets) {
      const { scene, diagnostics } = compileEdd(`meta { style: ${preset} }\n${demo.code}`);
      const errors = diagnostics.items.filter((d) => d.severity === "error");
      expect(errors, `${demo.type} × ${preset}: ${errors.map((e) => e.message).join("; ")}`).toEqual([]);
      expect(scene.nodes.length, `${demo.type} × ${preset}`).toBeGreaterThan(0);
      for (const n of scene.nodes) {
        expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.w) && Number.isFinite(n.h), `${demo.type} × ${preset}: node ${n.id} has non-finite geometry`).toBe(true);
      }
    }
  });
});

describe("content variations", () => {
  it("every template has content variations", () => {
    const missing = VIZ_DEMOS.filter((d) => variationsFor(d.type).length === 0).map((d) => d.type);
    expect(missing).toEqual([]);
  });

  it.each(VIZ_DEMOS.map((d) => [d.type] as const))("%s variations compile with finite geometry", (type) => {
    for (const v of variationsFor(type)) {
      const { scene, diagnostics } = compileEdd(v.code);
      const errors = diagnostics.items.filter((d) => d.severity === "error");
      expect(errors, `${type} / ${v.label}: ${errors.map((e) => e.message).join("; ")}`).toEqual([]);
      expect(scene.nodes.length, `${type} / ${v.label}`).toBeGreaterThan(0);
      for (const n of scene.nodes) {
        expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.w) && Number.isFinite(n.h), `${type} / ${v.label}: node ${n.id}`).toBe(true);
      }
    }
  });
});

describe("style presets", () => {
  it("ships the classic family + reference styles", () => {
    expect(listReferencePresets().length).toBeGreaterThanOrEqual(7);
    expect(getStylePreset("classic")).toBeTruthy();
    expect(getStylePreset("classic-dark")).toBeTruthy();
    expect(getStylePreset("classic-color")).toBeTruthy();
    // Classic is the black-and-white hand-drawn default
    const classic = getStylePreset("classic")!;
    expect(classic.fillMode).toBe("outline");
    expect(classic.palette).toEqual(["#1e1e1e"]);
  });

  it("removed styles are gone", () => {
    for (const gone of ["subtle-accent", "monochrome-pro", "corporate-clean", "minimal-contrast", "bold-canvas", "radiant-blocks", "glowful-breeze", "carefree-mist", "lively-layers"]) {
      expect(getStylePreset(gone), gone).toBeUndefined();
    }
  });

  it("renamed styles resolve via their old-id aliases", () => {
    expect(getStylePreset("vibrant-strokes")?.name).toBe("neutral-lines");
    expect(getStylePreset("sketch-notes")?.name).toBe("chalkboard");
    expect(getStylePreset("pragmatic-shades")?.name).toBe("earthy-gradient");
    expect(getStylePreset("silver-beam")?.name).toBe("mono-accent");
    expect(getStylePreset("artistic-flair")?.name).toBe("crayon");
    expect(getStylePreset("elegant-outline")?.name).toBe("fine-line");
    // aliases don't appear as separate entries in the list
    expect(listStylePresets().some((p) => p.name === "vibrant-strokes")).toBe(false);
  });

  it("default (no style) applies the Classic B&W look", () => {
    const { scene } = compileEdd(`scene { rect a "Hi" }`);
    expect(scene.meta.style).toBe("classic");
    expect(scene.theme.background).toBe("#ffffff");
    const node = scene.nodes.find((n) => n.id === "a")!;
    expect(node.style.stroke).toBe("#1e1e1e");
    expect(node.style.strokeWidth).toBe(2.2);
  });

  it("role label colors contrast with the canvas", () => {
    for (const preset of listStylePresets()) {
      for (let i = 0; i < 6; i++) {
        const role = roleStyle(preset, i, { n: 6 });
        const diff = Math.abs(luma(role.color) - luma(preset.background));
        expect(diff, `${preset.name} role ${i} label ${role.color} on ${preset.background}`).toBeGreaterThanOrEqual(55);
      }
    }
  });

  it("meta style flows into the scene theme", () => {
    const { scene } = compileEdd(`meta { style: chalkboard }\nscene { a[Hi] }`);
    expect(scene.meta.style).toBe("chalkboard");
    expect(scene.theme.background).toBe("#195e98");
    expect(scene.theme.mode).toBe("dark");
  });

  it("unknown preset warns and falls back", () => {
    const { scene, diagnostics } = compileEdd(`meta { style: nope }\nscene { a[Hi] }`);
    expect(diagnostics.items.some((d) => d.code === "W-STYLE-PRESET")).toBe(true);
    expect(scene.theme.background).toBe("#ffffff");
  });

  it("compile option overrides the declared preset", () => {
    const { scene } = compileEdd(`meta { style: neon-night }\nscene { a[Hi] }`, { stylePreset: "chalkboard" });
    expect(scene.meta.style).toBe("chalkboard");
    expect(scene.theme.background).toBe("#195e98");
  });
});
