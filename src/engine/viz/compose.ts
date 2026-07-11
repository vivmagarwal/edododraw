/**
 * Programmatic viz composition — build visualizations on the fly, no DSL text
 * required. A host constructs VizSpec objects (plain data: type + items +
 * options), and vizToScene() turns them into a render-ready Scene exactly the
 * way the compiler does for `viz { … }` blocks: same generators, same style
 * presets, same vertical stacking. Pure and DOM-free (like compileEdd), so it
 * works in Node, workers, and build steps.
 *
 *   const { scene } = vizToScene({
 *     type: "funnel", id: "sales", title: "Pipeline",
 *     items: [vizItem("Leads", 1200), vizItem("Won", 36)],
 *   }, { style: "chalkboard" });
 *   edd.renderScene(scene);
 */

import { DiagnosticBag } from "../dsl/diagnostics.js";
import { emptyScene } from "../scene/defaults.js";
import type { Scene } from "../scene/types.js";
import { effectivePreset, getStylePreset, presetTheme } from "../style/presets.js";
import { runViz } from "./registry.js";
import type { VizItem, VizSpec } from "./types.js";

export interface VizComposeOptions {
  /** Style preset name (see docs/STYLES_GUIDE); default = Classic B&W. */
  style?: string;
  mode?: "light" | "dark";
  /** Vertical gap between stacked blocks (px). Default 100, like the DSL. */
  gap?: number;
  diagnostics?: DiagnosticBag;
}

export interface VizComposeResult {
  scene: Scene;
  diagnostics: DiagnosticBag;
}

/** A VizItem where only `label` is required — defaults are filled in. */
export type VizItemInput = Partial<VizItem> & { label: string };

/** A VizSpec where only `type` is required — defaults are filled in. */
export interface VizSpecInput {
  type: string;
  id?: string;
  title?: string;
  options?: Record<string, unknown>;
  items?: VizItemInput[];
}

/**
 * Generate one or more viz specs into a Scene (blocks stack vertically in
 * order). Unknown types / bad data surface on `diagnostics`, never throw.
 */
export function vizToScene(specs: VizSpecInput | VizSpecInput[], opts: VizComposeOptions = {}): VizComposeResult {
  const diags = opts.diagnostics ?? new DiagnosticBag();
  const mode = opts.mode ?? "light";
  const preset = getStylePreset(opts.style) ?? effectivePreset(undefined, mode);
  if (opts.style && !getStylePreset(opts.style)) {
    diags.warn("W-STYLE-PRESET", `unknown style preset '${opts.style}'`, { line: 1, col: 1, start: 0, end: 0 }, { hint: "see docs/STYLES_GUIDE for the built-in preset names" });
  }

  const scene = emptyScene(mode);
  scene.theme = presetTheme(preset);
  scene.theme.mode = mode;
  scene.meta.style = preset.name;
  scene.meta.layout = "manual"; // viz output is pinned coordinates

  const list = Array.isArray(specs) ? specs : [specs];
  let cursorY = 40;
  for (const spec of list) {
    const result = runViz(normalizeSpec(spec), preset, mode, diags);
    if (!result) continue;
    const dx = 40 - result.bounds.x;
    const dy = cursorY - result.bounds.y;
    for (const n of result.nodes) {
      n.x += dx;
      n.y += dy;
      scene.nodes.push(n);
    }
    for (const e of result.edges) {
      if (e.from.point) e.from = { ...e.from, point: { x: e.from.point.x + dx, y: e.from.point.y + dy } };
      if (e.to.point) e.to = { ...e.to, point: { x: e.to.point.x + dx, y: e.to.point.y + dy } };
      if (e.points) e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      scene.edges.push(e);
    }
    for (const a of result.annotations) scene.annotations.push(a);
    cursorY += result.bounds.h + (opts.gap ?? 100);
  }
  return { scene, diagnostics: diags };
}

let specSeq = 0;

/** Fill a partial spec's defaults (id, options, normalized items). */
function normalizeSpec(spec: VizSpecInput): VizSpec {
  return {
    ...spec,
    id: spec.id || `viz${++specSeq}`,
    options: spec.options ?? {},
    items: (spec.items ?? []).map(normalizeItem),
  };
}

function normalizeItem(item: VizItemInput): VizItem {
  return {
    kind: item.kind ?? "item",
    id: item.id ?? slug(item.label) ?? "item",
    label: item.label,
    detail: item.detail,
    value: item.value ?? item.values?.[0],
    values: item.values ?? (item.value !== undefined ? [item.value] : []),
    strings: item.strings ?? [],
    to: item.to,
    color: item.color,
    icon: item.icon,
    opts: item.opts ?? {},
    children: (item.children ?? []).map(normalizeItem),
  };
}

/** Sugar for building VizSpec items: vizItem("Leads", 1200, { icon: "user" }). */
export function vizItem(label: string, value?: number, extra: Partial<VizItem> = {}): VizItem {
  return normalizeItem({ ...extra, label, value: value ?? extra.value });
}

function slug(label: string): string | undefined {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return s || undefined;
}
