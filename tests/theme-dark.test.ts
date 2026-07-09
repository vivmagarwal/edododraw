import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { isLightColor } from "@engine/scene/palette.js";
import { DARK_THEME, LIGHT_THEME } from "@engine/scene/defaults.js";

const nodeById = (src: string, id: string, mode?: "light" | "dark") => {
  const { scene, diagnostics } = compileEdd(src, mode ? { mode } : undefined);
  expect(diagnostics.errors).toEqual([]);
  const n = scene.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node ${id} not found`);
  return { scene, node: n };
};

describe("compile mode override", () => {
  it("forces the dark theme regardless of the DSL", () => {
    const { scene } = compileEdd("scene { rect a }", { mode: "dark" });
    expect(scene.theme.mode).toBe("dark");
    expect(scene.theme.background).toBe(DARK_THEME.background);
    expect(scene.theme.gridColor).toBe(DARK_THEME.gridColor);
  });

  it("defaults to light and exposes the light grid color", () => {
    const { scene } = compileEdd("scene { rect a }");
    expect(scene.theme.mode).toBe("light");
    expect(scene.theme.gridColor).toBe(LIGHT_THEME.gridColor);
    expect(LIGHT_THEME.gridColor).toBe("#d5d9e0");
    expect(DARK_THEME.gridColor).toBe("#2c313a");
  });

  it("mode:'dark' overrides a DSL that declares a light theme", () => {
    const src = `theme light {}\nscene { use theme light\n rect a }`;
    expect(compileEdd(src).scene.theme.mode).toBe("light");
    expect(compileEdd(src, { mode: "dark" }).scene.theme.mode).toBe("dark");
  });

  it("mode:'light' overrides a DSL that declares a dark theme", () => {
    const src = `theme dark {}\nscene { use theme dark\n rect a }`;
    expect(compileEdd(src).scene.theme.mode).toBe("dark");
    expect(compileEdd(src, { mode: "light" }).scene.theme.mode).toBe("light");
  });
});

describe("isLightColor", () => {
  it("classifies the Excalidraw pastels as light", () => {
    for (const c of ["#ffec99", "#a5d8ff", "#b2f2bb", "#d0bfff", "#ffffff", "#fff"]) {
      expect(isLightColor(c)).toBe(true);
    }
  });
  it("classifies ink/dark tones as dark", () => {
    for (const c of ["#1e1e1e", "#121212", "#000", "#2f9e44"]) {
      expect(isLightColor(c)).toBe(false);
    }
  });
  it("treats null/undefined (no fill) as dark → wants light ink", () => {
    expect(isLightColor(null)).toBe(false);
    expect(isLightColor(undefined)).toBe(false);
  });
  it("assumes light for unparseable / named colors (keeps ink dark on pastels)", () => {
    expect(isLightColor("rebeccapurple")).toBe(true);
    expect(isLightColor("rgb(0,0,0)")).toBe(true); // not measured → assumed light
  });
});

describe("dark-mode ink (applyDarkInk)", () => {
  it("gives unfilled nodes light ink so they read on the dark canvas", () => {
    const { node } = nodeById("scene { rect a }", "a", "dark");
    expect(node.style.stroke).toBe("#e3e3e3");
    expect(node.style.textColor).toBe("#e3e3e3");
  });

  it("keeps light ink for the default (hachure) pastel fill — the canvas shows through", () => {
    const { node } = nodeById("scene { rect a { fill: yellow } }", "a", "dark");
    // default fillStyle is hachure → not solid → light ink
    expect(node.style.textColor).toBe("#e3e3e3");
    expect(node.style.stroke).toBe("#e3e3e3");
  });

  it("uses dark ink only when a SOLID light fill actually backs the label", () => {
    const { node } = nodeById("scene { rect a { fill: yellow, fillStyle: solid } }", "a", "dark");
    expect(node.style.textColor).toBe("#1e1e1e");
    expect(node.style.stroke).toBe("#1e1e1e");
  });

  it("uses light ink for a solid DARK fill", () => {
    const { node } = nodeById("scene { rect a { fill: #101010, fillStyle: solid } }", "a", "dark");
    expect(node.style.textColor).toBe("#e3e3e3");
  });

  it("never overrides an explicit stroke / textColor", () => {
    const { node } = nodeById(
      "scene { rect a { fill: yellow, fillStyle: solid, stroke: red, textColor: blue } }",
      "a",
      "dark",
    );
    expect(node.style.stroke).toBe("#e03131"); // red, not dark ink
    expect(node.style.textColor).toBe("#1971c2"); // blue, not dark ink
  });

  it("is a no-op in light mode (ink stays black)", () => {
    const { node } = nodeById("scene { rect a { fill: yellow } }", "a", "light");
    expect(node.style.stroke).toBe("#1e1e1e");
    expect(node.style.textColor).toBe("#1e1e1e");
  });
});
