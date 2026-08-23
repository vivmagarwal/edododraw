/**
 * Lowering for the two "figure" node shapes — `character` (a sketchnote
 * person) and `icon` (a line glyph with a caption). Both validate their names
 * against the live registries. Unknown names never blank the diagram: they
 * produce a warning that lists the valid values and fall back (`standing` /
 * `neutral` / the library default; an unknown icon keeps its caption), so
 * something always renders.
 */

import {
  listCharacterAccessories,
  listCharacterEmotions,
  listCharacterFx,
  listCharacterHair,
  listCharacterPoses,
  listCharacterShirts,
} from "../viz/characters.js";
import { iconEntry, listIcons } from "../viz/icons.js";
import { CHARACTER_NODE_DEFAULT_HEIGHT, CHARACTER_NODE_MIN_HEIGHT, type CharacterNodeSpec } from "../viz/characterNode.js";
import { ICON_NODE_DEFAULT_SIZE, ICON_NODE_MIN_SIZE, type IconNodeSpec } from "../viz/iconNode.js";
import type { Attr, AttrBlock, Span, Value } from "./ast.js";
import { DiagnosticBag, nearest } from "./diagnostics.js";
import { resolveColor } from "./lower.js";

/** Attribute keys a character node understands (besides the common node attrs). */
export const CHARACTER_ATTR_KEYS = [
  "pose",
  "emotion",
  "shirt",
  "hair",
  "accessory",
  "fx",
  "prop",
  "height",
  "flip",
  "shirtColor",
  "hairColor",
  "accessoryColor",
  "fxColor",
  "propColor",
] as const;

function nameOf(v: Value): string | undefined {
  if (v.t === "ident" || v.t === "str") return v.v.trim();
  return undefined;
}

function at(span: Span): { line: number; col: number; start: number; end: number } {
  return { line: span.line, col: span.col, start: span.start, end: span.end };
}

/**
 * Build the spec. `attrs` is the node's layered attribute cascade (defaults →
 * classes → inline) so `style .hero { pose: waving }` works like any style.
 * `fallbackSpan` positions diagnostics when an attr has no span of its own.
 */
export function lowerCharacterNode(attrs: AttrBlock, tokens: Map<string, Value>, diags: DiagnosticBag, fallbackSpan: Span): CharacterNodeSpec {
  const spec: CharacterNodeSpec = { pose: "standing", height: CHARACTER_NODE_DEFAULT_HEIGHT };

  const axis = (
    a: Attr,
    key: "pose" | "emotion" | "shirt" | "hair" | "accessory" | "fx",
    valid: string[],
    fallback: string | undefined,
  ): void => {
    const name = nameOf(a.value);
    if (!name) return;
    if (name === "none" && key !== "pose" && key !== "emotion") {
      spec[key] = "none";
      return;
    }
    if (valid.includes(name)) {
      spec[key] = name;
      return;
    }
    const guess = nearest(name, valid);
    diags.warn(
      "W-CHARACTER-" + key.toUpperCase(),
      `unknown character ${key} '${name}'${fallback ? ` — using '${fallback}'` : " — ignored"}`,
      at(a.span ?? fallbackSpan),
      { expected: valid.join(" | "), found: name, hint: guess ? `did you mean '${guess}'?` : `valid ${key}s: ${valid.join(", ")}` },
    );
    if (fallback) spec[key] = fallback;
  };

  for (const a of attrs) {
    const v = a.value;
    switch (a.key) {
      case "pose":
        axis(a, "pose", listCharacterPoses(), "standing");
        break;
      case "emotion":
        axis(a, "emotion", listCharacterEmotions(), "neutral");
        break;
      case "shirt":
        axis(a, "shirt", listCharacterShirts(), undefined);
        break;
      case "hair":
        axis(a, "hair", listCharacterHair(), undefined);
        break;
      case "accessory":
        axis(a, "accessory", listCharacterAccessories(), undefined);
        break;
      case "fx":
        axis(a, "fx", listCharacterFx(), undefined);
        break;
      case "prop": {
        const name = nameOf(v);
        if (!name || name === "none") break;
        if (iconEntry(name)) spec.prop = name;
        else {
          const icons = listIcons();
          const guess = nearest(name, icons);
          diags.warn("W-CHARACTER-PROP", `unknown prop icon '${name}' — ignored`, at(a.span ?? fallbackSpan), {
            found: name,
            hint: guess ? `did you mean '${guess}'?` : `valid icons: ${icons.join(", ")}`,
          });
        }
        break;
      }
      case "height":
        if (v.t === "num") spec.height = Math.max(CHARACTER_NODE_MIN_HEIGHT, v.v);
        break;
      case "flip":
        if (v.t === "bool") spec.flip = v.v;
        else if (v.t === "ident") spec.flip = v.v === "true" || v.v === "yes";
        break;
      case "shirtColor":
      case "hairColor":
      case "accessoryColor":
      case "fxColor":
      case "propColor": {
        const c = resolveColor(v, tokens, "stroke");
        if (c) spec[a.key] = c;
        break;
      }
    }
  }
  return spec;
}

/** Attribute keys an icon node understands (besides the common node attrs). */
export const ICON_ATTR_KEYS = ["icon", "size", "iconSize"] as const;

/**
 * Build an icon node spec: `icon: <name>` (defaults to the node id, so
 * `icon rocket "Launch"` just works) and `size: <n>` / `iconSize: <n>`.
 */
export function lowerIconNode(id: string, attrs: AttrBlock, diags: DiagnosticBag, fallbackSpan: Span): IconNodeSpec {
  const spec: IconNodeSpec = { name: id, size: ICON_NODE_DEFAULT_SIZE };
  let nameAttr: Attr | undefined;
  for (const a of attrs) {
    const v = a.value;
    switch (a.key) {
      case "icon":
      case "glyph": {
        const name = nameOf(v);
        if (name) {
          spec.name = name;
          nameAttr = a;
        }
        break;
      }
      case "size":
      case "iconSize":
        if (v.t === "num") spec.size = Math.max(ICON_NODE_MIN_SIZE, v.v);
        break;
    }
  }
  if (!iconEntry(spec.name)) {
    const icons = listIcons();
    const guess = nearest(spec.name, icons);
    diags.warn("W-ICON", `unknown icon '${spec.name}' — the caption renders without a glyph`, at(nameAttr?.span ?? fallbackSpan), {
      found: spec.name,
      hint: guess ? `did you mean '${guess}'?` : `valid icons: ${icons.join(", ")}`,
    });
  }
  return spec;
}
