/**
 * Viz template registry — like the shape plugin registry, this is the seam
 * that makes new visualization types a no-grammar-change addition: register a
 * generator and `viz <name> { … }` works immediately.
 */

import type { DiagnosticBag } from "../dsl/diagnostics.js";
import type { StylePreset } from "../style/presets.js";
import { VizContext } from "./context.js";
import type { VizDef, VizResult, VizSpec } from "./types.js";

const generators = new Map<string, VizDef>();
/** alias -> canonical name (for docs/introspection; resolution uses `generators`). */
const aliasIndex = new Map<string, string>();

export function registerViz(def: VizDef): void {
  generators.set(def.name, def);
  for (const alias of def.aliases ?? []) {
    generators.set(alias, def);
    aliasIndex.set(alias, def.name);
  }
}

/**
 * Register an extra LLM-friendly alias for an already-registered template.
 * Silently skips (and warns in dev) on a name/alias collision so one careless
 * synonym can never shadow a real template.
 */
export function registerVizAlias(alias: string, canonical: string): void {
  const def = generators.get(canonical);
  if (!def) return;
  const existing = generators.get(alias);
  if (existing) {
    if (existing !== def && typeof console !== "undefined") console.warn(`viz alias '${alias}' already resolves elsewhere — skipped`);
    return;
  }
  generators.set(alias, def);
  aliasIndex.set(alias, def.name);
}

export function getViz(name: string): VizDef | undefined {
  return generators.get(name);
}

/** Every alias -> canonical-name mapping (for docs + the language spec). */
export function listVizAliases(): Array<{ alias: string; canonical: string }> {
  return [...aliasIndex.entries()].map(([alias, canonical]) => ({ alias, canonical }));
}

/** Unique defs (aliases deduped), sorted by category then name. */
export function listViz(): VizDef[] {
  const seen = new Set<VizDef>();
  const out: VizDef[] = [];
  for (const def of generators.values()) {
    if (seen.has(def)) continue;
    seen.add(def);
    out.push(def);
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/**
 * Run the generator for a spec. Adds the title above the content when the
 * generator didn't place it itself. Returns null (with a diagnostic) for
 * unknown types.
 */
export function runViz(spec: VizSpec, preset: StylePreset, mode: "light" | "dark", diags: DiagnosticBag): VizResult | null {
  const def = getViz(spec.type);
  if (!def) {
    const known = listViz()
      .map((d) => d.name)
      .join(", ");
    diags.error("E-VIZ-TYPE", `unknown viz type '${spec.type}'`, { line: 1, col: 1, start: 0, end: 0 }, { hint: `known types: ${known}` });
    return null;
  }
  const ctx = new VizContext(spec.id, preset, mode, diags);
  def.generate(spec, ctx);
  if (spec.title && !ctx.titleHandled) {
    const b = ctx.bounds();
    ctx.title(spec.title, b.x + b.w / 2, b.y - 44);
  }
  return ctx.result();
}
