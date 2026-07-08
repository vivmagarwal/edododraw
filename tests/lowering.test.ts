/**
 * Lowering-table tests for src/engine/dsl/lower.ts — the pure functions that
 * map DSL surface enums/glyphs onto Scene IR values. Exercised directly with
 * synthetic AST Value nodes (no parser involved).
 */

import { describe, expect, it } from "vitest";
import {
  lowerGlyph,
  mapAnimation,
  mapArrowhead,
  mapEasing,
  mapFillStyle,
  mapRoughness,
  mapRouting,
  mapShape,
  mapStrokeStyle,
  mapStrokeWidth,
  numberOf,
  resolveColor,
} from "@engine/dsl/lower.js";
import type { Attr, Value } from "@engine/dsl/ast.js";

const SPAN = { start: 0, end: 0, line: 1, col: 1 };
const num = (v: number, unit: string | null = null): Value => ({ t: "num", v, unit });
const ident = (v: string): Value => ({ t: "ident", v });
const color = (v: string): Value => ({ t: "color", v });
const str = (v: string): Value => ({ t: "str", v });
const token = (v: string): Value => ({ t: "token", v });
const styled = (name: string, block: Attr[]): Value => ({ t: "styled", name, block });

describe("mapShape", () => {
  it("maps DSL aliases onto renderable ShapeKinds", () => {
    expect(mapShape("rect")).toBe("rectangle");
    expect(mapShape("rectangle")).toBe("rectangle");
    expect(mapShape("round-rect")).toBe("round-rectangle");
    expect(mapShape("roundrect")).toBe("round-rectangle");
    expect(mapShape("db")).toBe("cylinder");
    expect(mapShape("database")).toBe("cylinder");
    expect(mapShape("decision")).toBe("diamond");
    expect(mapShape("stadium")).toBe("pill");
    expect(mapShape("subroutine")).toBe("rectangle");
  });

  it("defaults undefined to a rectangle", () => {
    expect(mapShape(undefined)).toBe("rectangle");
  });

  it("passes custom: shapes through untouched", () => {
    expect(mapShape("custom:mything")).toBe("custom:mything");
  });

  it("passes an unknown name through as-is (plugin-extensible)", () => {
    expect(mapShape("sparkle")).toBe("sparkle");
  });
});

describe("lowerGlyph", () => {
  it("plain lines carry no arrowheads", () => {
    expect(lowerGlyph("--")).toMatchObject({ strokeStyle: "solid", startArrowhead: "none", endArrowhead: "none" });
    expect(lowerGlyph("---")).toMatchObject({ endArrowhead: "none" });
  });

  it("forward arrows end in an arrowhead", () => {
    for (const g of ["->", "-->", "--->"]) {
      expect(lowerGlyph(g)).toMatchObject({ strokeStyle: "solid", startArrowhead: "none", endArrowhead: "arrow" });
    }
  });

  it("back arrows start with an arrowhead", () => {
    expect(lowerGlyph("<-")).toMatchObject({ startArrowhead: "arrow", endArrowhead: "none" });
    expect(lowerGlyph("<--")).toMatchObject({ startArrowhead: "arrow", endArrowhead: "none" });
  });

  it("bi-directional arrows have both heads", () => {
    expect(lowerGlyph("<->")).toMatchObject({ startArrowhead: "arrow", endArrowhead: "arrow" });
    expect(lowerGlyph("<-->")).toMatchObject({ startArrowhead: "arrow", endArrowhead: "arrow" });
  });

  it("dashed / dotted glyphs set the stroke style", () => {
    expect(lowerGlyph("-.->")).toMatchObject({ strokeStyle: "dashed", endArrowhead: "arrow" });
    expect(lowerGlyph("..>")).toMatchObject({ strokeStyle: "dotted", endArrowhead: "arrow" });
  });

  it("thick glyphs carry a stroke-width multiplier", () => {
    expect(lowerGlyph("==>")).toMatchObject({ endArrowhead: "arrow", strokeWidthMul: 2.1 });
    expect(lowerGlyph("===")).toMatchObject({ endArrowhead: "none", strokeWidthMul: 2.1 });
  });

  it("the `~>` flow glyph carries an animation + curved routing", () => {
    expect(lowerGlyph("~>")).toMatchObject({ endArrowhead: "arrow", animation: "flow", routing: "curved" });
  });

  it("circle / bar terminators map to circle / bar arrowheads", () => {
    expect(lowerGlyph("--o")).toMatchObject({ endArrowhead: "circle" });
    expect(lowerGlyph("-o")).toMatchObject({ endArrowhead: "circle" });
    expect(lowerGlyph("--x")).toMatchObject({ endArrowhead: "bar" });
    expect(lowerGlyph("-x")).toMatchObject({ endArrowhead: "bar" });
  });

  it("an unrecognized glyph falls back to a plain forward arrow", () => {
    expect(lowerGlyph("<~~>")).toMatchObject({ strokeStyle: "solid", startArrowhead: "none", endArrowhead: "arrow" });
  });
});

describe("mapStrokeWidth", () => {
  it("passes numeric widths straight through", () => {
    expect(mapStrokeWidth(num(3.2))).toBe(3.2);
    expect(mapStrokeWidth(num(0))).toBe(0);
  });
  it("maps named weights", () => {
    expect(mapStrokeWidth(ident("thin"))).toBe(1);
    expect(mapStrokeWidth(ident("medium"))).toBe(1.4);
    expect(mapStrokeWidth(ident("bold"))).toBe(2.8);
    expect(mapStrokeWidth(ident("thick"))).toBe(3.4);
  });
  it("returns undefined for unknown names or non-scalar values", () => {
    expect(mapStrokeWidth(ident("chunky"))).toBeUndefined();
    expect(mapStrokeWidth(color("#fff"))).toBeUndefined();
  });
});

describe("mapRoughness", () => {
  it("maps the three named roughness personas", () => {
    expect(mapRoughness(ident("architect"))).toBe(0);
    expect(mapRoughness(ident("artist"))).toBe(1);
    expect(mapRoughness(ident("cartoonist"))).toBe(2);
  });
  it("passes numbers through and rejects unknowns", () => {
    expect(mapRoughness(num(1.7))).toBe(1.7);
    expect(mapRoughness(ident("scribble"))).toBeUndefined();
    expect(mapRoughness(str("artist"))).toBeUndefined();
  });
});

describe("mapFillStyle / mapStrokeStyle / mapRouting / mapArrowhead", () => {
  it("mapFillStyle accepts only known fill styles", () => {
    expect(mapFillStyle(ident("cross-hatch"))).toBe("cross-hatch");
    expect(mapFillStyle(ident("solid"))).toBe("solid");
    expect(mapFillStyle(ident("plaid"))).toBeUndefined();
    expect(mapFillStyle(num(1))).toBeUndefined();
  });
  it("mapStrokeStyle accepts solid/dashed/dotted only", () => {
    expect(mapStrokeStyle(ident("dashed"))).toBe("dashed");
    expect(mapStrokeStyle(ident("dotted"))).toBe("dotted");
    expect(mapStrokeStyle(ident("wavy"))).toBeUndefined();
  });
  it("mapRouting normalizes routing aliases", () => {
    expect(mapRouting(ident("bezier"))).toBe("curved");
    expect(mapRouting(ident("arc"))).toBe("curved");
    expect(mapRouting(ident("step"))).toBe("orthogonal");
    expect(mapRouting(ident("elbow"))).toBe("elbow");
    expect(mapRouting(ident("straight"))).toBe("straight");
    expect(mapRouting(ident("teleport"))).toBeUndefined();
  });
  it("mapArrowhead passes ident names through", () => {
    expect(mapArrowhead(ident("triangle"))).toBe("triangle");
    expect(mapArrowhead(num(1))).toBeUndefined();
  });
});

describe("mapAnimation", () => {
  it("passes known animation kinds through", () => {
    expect(mapAnimation(ident("flow"))).toEqual({ kind: "flow", speed: undefined });
    expect(mapAnimation(ident("dash-march"))).toMatchObject({ kind: "dash-march" });
    expect(mapAnimation(ident("draw-on"))).toMatchObject({ kind: "draw-on" });
  });

  it("remaps spec names onto implemented kinds (glow→comet, caravan→dash-march, wiggle→flow)", () => {
    expect(mapAnimation(ident("glow"))).toMatchObject({ kind: "comet" });
    expect(mapAnimation(ident("caravan"))).toMatchObject({ kind: "dash-march" });
    expect(mapAnimation(ident("wiggle"))).toMatchObject({ kind: "flow" });
  });

  it("falls back to `flow` for an unknown animation name", () => {
    expect(mapAnimation(ident("sparkleburst"))).toMatchObject({ kind: "flow" });
  });

  it("reads a speed from a styled form `flow { speed: 1.2 }`", () => {
    const v = styled("flow", [{ key: "speed", value: num(1.2), span: SPAN }]);
    expect(mapAnimation(v)).toEqual({ kind: "flow", speed: 1.2 });
  });

  it("returns undefined for a value that is neither ident nor styled", () => {
    expect(mapAnimation(num(1))).toBeUndefined();
    expect(mapAnimation(color("#fff"))).toBeUndefined();
  });
});

describe("mapEasing", () => {
  it("passes known easing names through", () => {
    for (const e of ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "back-out", "anticipate", "spring"]) {
      expect(mapEasing(ident(e))).toBe(e);
    }
  });
  it("maps magic/bounce to spring", () => {
    expect(mapEasing(ident("magic"))).toBe("spring");
    expect(mapEasing(ident("bounce"))).toBe("spring");
  });
  it("defaults unknown / missing to ease-in-out", () => {
    expect(mapEasing(ident("zoomy"))).toBe("ease-in-out");
    expect(mapEasing(undefined)).toBe("ease-in-out");
  });
  it("recognizes a spring() call", () => {
    expect(mapEasing({ t: "call", name: "spring", args: [] })).toBe("spring");
    expect(mapEasing({ t: "call", name: "wobble", args: [] })).toBe("ease-in-out");
  });
});

describe("resolveColor", () => {
  it("returns a hex value verbatim", () => {
    expect(resolveColor(color("#2563eb"), new Map(), "stroke")).toBe("#2563eb");
  });

  it("resolves named palette colors differently for stroke vs fill", () => {
    expect(resolveColor(ident("green"), new Map(), "stroke")).toBe("#2f9e44");
    expect(resolveColor(ident("green"), new Map(), "fill")).toBe("#b2f2bb");
    expect(resolveColor(str("blue"), new Map(), "stroke")).toBe("#1971c2");
  });

  it("follows $token indirection to the underlying color", () => {
    const tokens = new Map<string, Value>([["accent", color("#2563eb")]]);
    expect(resolveColor(token("accent"), tokens, "stroke")).toBe("#2563eb");
  });

  it("follows a token that points at a palette name", () => {
    const tokens = new Map<string, Value>([["brand", ident("teal")]]);
    expect(resolveColor(token("brand"), tokens, "stroke")).toBe("#099268");
    expect(resolveColor(token("brand"), tokens, "fill")).toBe("#96f2d7");
  });

  it("returns null for an unresolved token", () => {
    expect(resolveColor(token("missing"), new Map(), "stroke")).toBe(null);
  });

  it("resolves transparent fill to null but stroke to the fallback", () => {
    expect(resolveColor(ident("transparent"), new Map(), "fill")).toBe(null);
    expect(resolveColor(ident("transparent"), new Map(), "stroke")).toBe("#1e1e1e");
  });

  it("bails out of a token cycle via the depth guard (returns null, no stack overflow)", () => {
    const tokens = new Map<string, Value>([
      ["a", token("b")],
      ["b", token("a")],
    ]);
    expect(resolveColor(token("a"), tokens, "stroke")).toBe(null);
  });
});

describe("numberOf", () => {
  it("extracts numeric values and ignores everything else", () => {
    expect(numberOf(num(42))).toBe(42);
    expect(numberOf(ident("nope"))).toBeUndefined();
    expect(numberOf(undefined)).toBeUndefined();
  });
});
