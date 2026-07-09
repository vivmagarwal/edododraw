/**
 * Lower a parsed `viz` block (AST) to the engine's plain-data VizSpec.
 * Keeps all AST knowledge on the DSL side so the viz generators stay
 * DSL-independent (embedders can build VizSpecs programmatically).
 */

import type { VizItem, VizSpec } from "../viz/types.js";
import type { Value, VizDecl, VizEntry } from "./ast.js";
import { resolveColor } from "./lower.js";

const COLOR_KEYS = new Set(["color", "fill", "stroke"]);
const DETAIL_KEYS = ["detail", "note", "desc", "description"];

export function lowerViz(decl: VizDecl, index: number, tokens: Map<string, Value>): VizSpec {
  const options: Record<string, unknown> = {};
  for (const a of decl.attrs) {
    options[a.key] = COLOR_KEYS.has(a.key) ? (resolveColor(a.value, tokens, "stroke") ?? plain(a.value, tokens)) : plain(a.value, tokens);
  }
  const id = decl.id ?? `viz${index + 1}`;
  return {
    type: decl.vizType,
    id,
    title: decl.title,
    options,
    items: decl.entries.map((e, i) => lowerEntry(e, i, tokens)),
  };
}

function lowerEntry(e: VizEntry, i: number, tokens: Map<string, Value>): VizItem {
  const values: number[] = [];
  const strings: string[] = [];
  for (const v of e.values) collect(v, values, strings, tokens);

  const opts: Record<string, unknown> = {};
  let color: string | undefined;
  let icon: string | undefined;
  let detail: string | undefined;
  for (const a of e.attrs) {
    if (COLOR_KEYS.has(a.key)) {
      color = resolveColor(a.value, tokens, "stroke") ?? color;
      continue;
    }
    if (a.key === "icon") {
      const p = plain(a.value, tokens);
      if (typeof p === "string") icon = p;
      continue;
    }
    if (DETAIL_KEYS.includes(a.key)) {
      const p = plain(a.value, tokens);
      if (typeof p === "string") detail = p;
      continue;
    }
    if (a.key === "value") {
      const p = plain(a.value, tokens);
      if (typeof p === "number") values.unshift(p);
      continue;
    }
    opts[a.key] = plain(a.value, tokens);
  }
  // `item "Label" 40 "Some note"` — a trailing string doubles as the detail.
  if (detail === undefined && e.label !== undefined && strings.length) detail = strings[0];

  const label = e.label ?? prettify(e.id) ?? "";
  return {
    kind: e.kind,
    id: e.id ?? slug(e.label) ?? `${e.kind}_${i}`,
    label,
    detail,
    value: values.length ? values[0] : undefined,
    values,
    strings,
    to: e.to,
    color,
    icon,
    opts,
    children: e.children.map((c, j) => lowerEntry(c, j, tokens)),
  };
}

function collect(v: Value, nums: number[], strs: string[], tokens: Map<string, Value>): void {
  switch (v.t) {
    case "num":
      nums.push(v.v);
      break;
    case "str":
    case "ident":
    case "color":
      strs.push(v.v);
      break;
    case "list":
    case "tuple":
      for (const x of v.v) collect(x, nums, strs, tokens);
      break;
    case "token": {
      const t = tokens.get(v.v);
      if (t) collect(t, nums, strs, tokens);
      break;
    }
    default:
      break;
  }
}

function plain(v: Value, tokens: Map<string, Value>): unknown {
  switch (v.t) {
    case "num":
      return v.v;
    case "str":
    case "ident":
    case "color":
    case "class":
      return v.v;
    case "bool":
      return v.v;
    case "token": {
      const t = tokens.get(v.v);
      return t ? plain(t, tokens) : undefined;
    }
    case "tuple":
    case "list":
      return v.v.map((x) => plain(x, tokens));
    default:
      return undefined;
  }
}

function slug(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return s || undefined;
}

function prettify(id: string | undefined): string | undefined {
  return id;
}
