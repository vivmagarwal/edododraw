/**
 * Lowering helpers: map DSL surface enums/glyphs onto Scene IR values.
 * Kept separate from the parser so the same tables document the language and
 * drive the compiler.
 */

import { getArrowAnimation } from "../plugins/registry.js";
import { resolveFill, resolveStroke } from "../scene/palette.js";
import type {
  ArrowAnimationKind,
  ArrowheadKind,
  EdgeRouting,
  EasingName,
  FillStyle,
  ShapeKind,
  StrokeStyle,
} from "../scene/types.js";
import type { Value } from "./ast.js";

/** DSL shape name -> renderable ShapeKind. */
export const SHAPE_MAP: Record<string, ShapeKind> = {
  rect: "rectangle",
  rectangle: "rectangle",
  "round-rect": "round-rectangle",
  "round-rectangle": "round-rectangle",
  roundrect: "round-rectangle",
  ellipse: "ellipse",
  circle: "circle",
  diamond: "diamond",
  decision: "diamond",
  cylinder: "cylinder",
  db: "cylinder",
  database: "cylinder",
  hexagon: "hexagon",
  parallelogram: "parallelogram",
  trapezoid: "trapezoid",
  cloud: "cloud",
  actor: "actor",
  note: "note",
  document: "document",
  stadium: "pill",
  pill: "pill",
  subroutine: "rectangle",
  triangle: "triangle",
  star: "star",
  text: "text",
  image: "rectangle",
  frame: "rectangle",
};

export function mapShape(name: string | undefined): ShapeKind {
  if (!name) return "rectangle";
  if (name.startsWith("custom:")) return name;
  return SHAPE_MAP[name] ?? (name as ShapeKind);
}

export interface GlyphLowering {
  strokeStyle: StrokeStyle;
  startArrowhead: ArrowheadKind;
  endArrowhead: ArrowheadKind;
  animation?: ArrowAnimationKind;
  strokeWidthMul?: number;
  routing?: EdgeRouting;
}

/** Edge glyph -> default styling (spec §6.2). Overridable by the trailing block. */
export function lowerGlyph(glyph: string): GlyphLowering {
  switch (glyph) {
    case "--":
    case "---":
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "none" };
    case "->":
    case "-->":
    case "--->":
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "arrow" };
    case "<-":
    case "<--":
      return { strokeStyle: "solid", startArrowhead: "arrow", endArrowhead: "none" };
    case "<->":
    case "<-->":
      return { strokeStyle: "solid", startArrowhead: "arrow", endArrowhead: "arrow" };
    case "-.->":
      return { strokeStyle: "dashed", startArrowhead: "none", endArrowhead: "arrow" };
    case "..>":
      return { strokeStyle: "dotted", startArrowhead: "none", endArrowhead: "arrow" };
    case "==>":
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "arrow", strokeWidthMul: 2.1 };
    case "===":
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "none", strokeWidthMul: 2.1 };
    case "~>":
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "arrow", animation: "flow", routing: "curved" };
    case "--o":
    case "-o":
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "circle" };
    case "--x":
    case "-x":
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "bar" };
    default:
      return { strokeStyle: "solid", startArrowhead: "none", endArrowhead: "arrow" };
  }
}

export function mapStrokeWidth(v: Value): number | undefined {
  if (v.t === "num") return v.v;
  if (v.t === "ident") {
    return { thin: 1, medium: 1.4, bold: 2.8, thick: 3.4 }[v.v];
  }
  return undefined;
}

export function mapRoughness(v: Value): number | undefined {
  if (v.t === "num") return v.v;
  if (v.t === "ident") {
    return { architect: 0, artist: 1, cartoonist: 2 }[v.v];
  }
  return undefined;
}

export function mapFillStyle(v: Value): FillStyle | undefined {
  if (v.t !== "ident") return undefined;
  const ok = new Set(["hachure", "cross-hatch", "solid", "zigzag", "dots", "none"]);
  return ok.has(v.v) ? (v.v as FillStyle) : undefined;
}

export function mapStrokeStyle(v: Value): StrokeStyle | undefined {
  if (v.t !== "ident") return undefined;
  return ["solid", "dashed", "dotted"].includes(v.v) ? (v.v as StrokeStyle) : undefined;
}

export function mapRouting(v: Value): EdgeRouting | undefined {
  if (v.t !== "ident") return undefined;
  const map: Record<string, EdgeRouting> = {
    straight: "straight",
    bezier: "curved",
    curved: "curved",
    orthogonal: "orthogonal",
    elbow: "elbow",
    step: "orthogonal",
    arc: "curved",
  };
  return map[v.v];
}

export function mapArrowhead(v: Value): ArrowheadKind | undefined {
  if (v.t !== "ident") return undefined;
  return v.v as ArrowheadKind;
}

export function mapAnimation(v: Value): { kind: ArrowAnimationKind; speed?: number } | undefined {
  let name: string | undefined;
  let speed: number | undefined;
  if (v.t === "ident") name = v.v;
  else if (v.t === "styled") {
    name = v.name;
    const sp = v.block.find((a) => a.key === "speed");
    if (sp && sp.value.t === "num") speed = sp.value.v;
  }
  if (!name) return undefined;
  // runtime-registered kinds pass through untouched (see plugins/registry)
  if (getArrowAnimation(name)) return { kind: name as ArrowAnimationKind, speed };
  const known = new Set(["none", "flow", "dash-march", "draw-on", "pulse", "comet", "gradient-flow", "electric", "glow", "caravan", "wiggle"]);
  // remap a couple of spec names onto implemented kinds
  const remap: Record<string, ArrowAnimationKind> = { glow: "comet", caravan: "dash-march", wiggle: "flow" };
  const kind = (remap[name] ?? (known.has(name) ? name : "flow")) as ArrowAnimationKind;
  return { kind, speed };
}

export function mapEasing(v: Value | undefined): EasingName {
  if (!v) return "ease-in-out";
  if (v.t === "ident") {
    const known: EasingName[] = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "back-out", "anticipate", "spring"];
    if ((known as string[]).includes(v.v)) return v.v as EasingName;
    if (v.v === "magic" || v.v === "bounce") return "spring";
    return "ease-in-out";
  }
  if (v.t === "call") {
    if (v.name === "spring") return "spring";
    return "ease-in-out";
  }
  return "ease-in-out";
}

/** Resolve a color-ish value to a hex/CSS string, following $token indirection. */
export function resolveColor(v: Value, tokens: Map<string, Value>, kind: "stroke" | "fill", depth = 0): string | null {
  if (depth > 8) return null;
  switch (v.t) {
    case "color":
      return v.v;
    case "str":
      return kind === "fill" ? resolveFill(v.v) : resolveStroke(v.v, "#1e1e1e");
    case "ident":
      return kind === "fill" ? resolveFill(v.v) : resolveStroke(v.v, "#1e1e1e");
    case "token": {
      const t = tokens.get(v.v);
      if (!t) return null;
      return resolveColor(t, tokens, kind, depth + 1);
    }
    default:
      return null;
  }
}

export function numberOf(v: Value | undefined): number | undefined {
  return v && v.t === "num" ? v.v : undefined;
}
