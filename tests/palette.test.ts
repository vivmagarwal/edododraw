/**
 * Color-palette resolver tests — src/engine/scene/palette.ts.
 * Covers named colors, hex passthrough, transparent/none handling, the
 * fill<->stroke pairing helper, and the marker palette used by annotations.
 */

import { describe, expect, it } from "vitest";
import {
  pairedStrokeForFill,
  resolveFill,
  resolveMarker,
  resolveStroke,
  MARKER_PALETTE,
  STROKE_PALETTE,
  FILL_PALETTE,
} from "@engine/scene/palette.js";

describe("resolveStroke", () => {
  it("resolves named strokes to their hue hex", () => {
    expect(resolveStroke("green", "#000")).toBe("#2f9e44");
    expect(resolveStroke("blue", "#000")).toBe("#1971c2");
    expect(resolveStroke("black", "#000")).toBe(STROKE_PALETTE.black);
  });

  it("is case-insensitive for names but returns the canonical hex", () => {
    expect(resolveStroke("GREEN", "#000")).toBe("#2f9e44");
    expect(resolveStroke("  Teal  ", "#000")).toBe("#099268");
  });

  it("passes hex values through (trimmed, original case preserved)", () => {
    expect(resolveStroke("#ABCDEF", "#000")).toBe("#ABCDEF");
    expect(resolveStroke("  #123456 ", "#000")).toBe("#123456");
  });

  it("returns the fallback for transparent / none / undefined", () => {
    expect(resolveStroke("transparent", "#111")).toBe("#111");
    expect(resolveStroke("none", "#111")).toBe("#111");
    expect(resolveStroke(undefined, "#111")).toBe("#111");
  });

  it("passes an unknown CSS color name straight through to SVG", () => {
    expect(resolveStroke("rebeccapurple", "#000")).toBe("rebeccapurple");
    expect(resolveStroke("rgb(1,2,3)", "#000")).toBe("rgb(1,2,3)");
  });
});

describe("resolveFill", () => {
  it("resolves named fills to their SOFT background shade", () => {
    expect(resolveFill("green")).toBe("#b2f2bb");
    expect(resolveFill("red")).toBe("#ffc9c9");
    // the soft fill differs from the stroke hue for the same name
    expect(resolveFill("green")).not.toBe(resolveStroke("green", "#000"));
  });

  it("maps transparent / none / undefined to null", () => {
    expect(resolveFill("transparent")).toBe(null);
    expect(resolveFill("none")).toBe(null);
    expect(resolveFill(undefined)).toBe(null);
    expect(FILL_PALETTE.transparent).toBe(null);
  });

  it("passes hex + unknown names through", () => {
    expect(resolveFill("#ff0000")).toBe("#ff0000");
    expect(resolveFill("papayawhip")).toBe("papayawhip");
  });
});

describe("pairedStrokeForFill", () => {
  it("returns the matching stroke hue for a named fill", () => {
    expect(pairedStrokeForFill("green")).toBe("#2f9e44");
    expect(pairedStrokeForFill("orange")).toBe("#e8590c");
  });

  it("returns null when there is no pairing (hex, transparent, undefined)", () => {
    expect(pairedStrokeForFill("#abcabc")).toBe(null);
    expect(pairedStrokeForFill("transparent")).toBe(null);
    expect(pairedStrokeForFill(undefined)).toBe(null);
  });
});

describe("resolveMarker", () => {
  it("defaults to the yellow highlighter", () => {
    expect(resolveMarker(undefined)).toBe(MARKER_PALETTE.yellow);
    expect(resolveMarker(undefined)).toBe("#ffe066");
  });

  it("uses the (softer) marker palette for its own named colors", () => {
    expect(resolveMarker("green")).toBe("#8ce99a");
    expect(resolveMarker("blue")).toBe("#74c0fc");
    // distinct from the solid stroke palette
    expect(resolveMarker("green")).not.toBe(STROKE_PALETTE.green);
  });

  it("passes hex values through", () => {
    expect(resolveMarker("#654321")).toBe("#654321");
  });

  it("falls back to the stroke palette for names not in the marker set", () => {
    // `teal` is not a marker color, but it is a stroke color
    expect(resolveMarker("teal")).toBe(STROKE_PALETTE.teal);
  });
});
