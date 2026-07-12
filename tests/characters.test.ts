/**
 * Character library + sketchnote shapes/templates: parametric figures
 * (poses × emotions × icon props), container shapes, and the four
 * sketchnote-native templates.
 */
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { VizContext } from "@engine/viz/context.js";
import { DiagnosticBag } from "@engine/dsl/diagnostics.js";
import { effectivePreset } from "@engine/style/presets.js";
import { drawCharacter, listCharacterPoses, listCharacterEmotions, registerCharacterPose } from "@engine/viz/characters.js";
import { vizItemMembers } from "@engine/scene/query.js";
import "@engine/viz/generators/index.js";

const ctxOf = () => new VizContext("t", effectivePreset(undefined, "light"), "light", new DiagnosticBag());

describe("character library", () => {
  it("ships the sketchnote pose + emotion vocabulary", () => {
    for (const p of ["standing", "waving", "pointing", "cheering", "running", "confident", "thinking", "pulling", "peering"]) {
      expect(listCharacterPoses()).toContain(p);
    }
    expect(listCharacterEmotions()).toContain("determined");
  });

  it("draws a figure: head + torso + limbs, tagged with role 'character'", () => {
    const ctx = ctxOf();
    const b = ctx.item("hero", () => drawCharacter(ctx, 100, 200, 120, { pose: "cheering", prop: "star" }));
    expect(ctx.nodes.length).toBeGreaterThanOrEqual(10); // head, face, torso, 4 limbs, feet, motion, prop
    expect(ctx.nodes.some((n) => (n.data as { vizRole?: string })?.vizRole === "character")).toBe(true);
    expect(ctx.nodes.some((n) => (n.data as { vizRole?: string })?.vizRole === "icon")).toBe(true); // the star prop
    // bounds contain the figure frame
    expect(b.y).toBeLessThan(90);
    expect(b.h).toBeGreaterThan(110);
  });

  it("flip mirrors the pose", () => {
    const a = ctxOf();
    drawCharacter(a, 0, 100, 100, { pose: "pointing" });
    const b = ctxOf();
    drawCharacter(b, 0, 100, 100, { pose: "pointing", flip: true });
    const maxX = (c: VizContext) => Math.max(...c.nodes.map((n) => n.x + n.w));
    const minX = (c: VizContext) => Math.min(...c.nodes.map((n) => n.x));
    expect(maxX(a)).toBeGreaterThan(30); // arm reaches right
    expect(minX(b)).toBeLessThan(-30); // mirrored arm reaches left
  });

  it("registerCharacterPose extends the vocabulary", () => {
    registerCharacterPose("t-pose", {
      armL: [[-0.1, 0.31], [-0.3, 0.31]],
      armR: [[0.1, 0.31], [0.3, 0.31]],
      legL: [[-0.05, 0.55], [-0.08, 0.97]],
      legR: [[0.05, 0.55], [0.08, 0.97]],
    });
    expect(listCharacterPoses()).toContain("t-pose");
    const ctx = ctxOf();
    drawCharacter(ctx, 0, 100, 100, { pose: "t-pose" });
    expect(ctx.nodes.length).toBeGreaterThan(6);
  });
});

describe("sketchnote templates", () => {
  it("personas renders a tagged character per item with pose/prop attrs", () => {
    const { scene, diagnostics } = compileEdd(`viz personas cast { item "Builder" { pose: confident, prop: wrench }\n item "Champion" { pose: cheering } }`);
    expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    expect(vizItemMembers(scene, "cast.builder").length).toBeGreaterThanOrEqual(9);
    expect(vizItemMembers(scene, "cast.champion").length).toBeGreaterThanOrEqual(9);
  });

  it("quote/clouds/fishbone compile clean and tag their items", () => {
    const q = compileEdd(`viz quote "Less, but better." { by: "Dieter Rams" }`);
    expect(q.diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    const c = compileEdd(`viz clouds cl { item "One"; item "Two"; item "Three" }`);
    expect(vizItemMembers(c.scene, "cl.one").length).toBeGreaterThanOrEqual(2);
    const f = compileEdd(`viz fishbone "Slow builds" { bone "Tools" { item "Old CI" }\n bone "Process" { item "No cache" } }`);
    expect(f.diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    expect(vizItemMembers(f.scene, "viz1.tools").length).toBeGreaterThanOrEqual(3);
  });
});

describe("sketchnote container shapes", () => {
  it("renders speech-bubble/starburst/ribbon/paper-fold via their keywords", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { scene, diagnostics } = compileEdd(`scene {
      speech-bubble say "Quotes live here"
      starburst wow "IMPACT"
      ribbon title "CHAPTER ONE"
      paper-fold doc "The memo"
    }`);
    expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    const r = new SvgRenderer(host);
    r.mount();
    r.render(scene);
    for (const id of ["say", "wow", "title", "doc"]) {
      const g = r.svg.querySelector(`[data-node="${id}"]`)!;
      expect(g, id).toBeTruthy();
      expect(g.querySelectorAll("path, polygon").length, id).toBeGreaterThan(0);
      expect(g.textContent).toBeTruthy();
    }
  });
});
