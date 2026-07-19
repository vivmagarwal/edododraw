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
import {
  drawCharacter,
  listCharacterPoses,
  listCharacterEmotions,
  listCharacterHair,
  listCharacterAccessories,
  listCharacterFx,
  registerCharacterPose,
  registerCharacterEmotion,
  registerCharacterShirt,
  registerCharacterHair,
  registerCharacterAccessory,
  registerCharacterFx,
  characterOptsFrom,
} from "@engine/viz/characters.js";
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
      legL: [[-0.05, 0.55], [-0.08, 1.0]],
      legR: [[0.05, 0.55], [0.08, 1.0]],
    });
    expect(listCharacterPoses()).toContain("t-pose");
    const ctx = ctxOf();
    drawCharacter(ctx, 0, 100, 100, { pose: "t-pose" });
    expect(ctx.nodes.length).toBeGreaterThan(6);
  });

  it("keeps a leaning figure's head attached to its torso", () => {
    // running leans forward; the head centre must sit over the (sheared) torso,
    // not float off to the side as it did before the shear fix.
    const ctx = ctxOf();
    drawCharacter(ctx, 0, 200, 120, { pose: "running" });
    const heads = ctx.nodes.filter((n) => n.shape === "circle" && n.w > 15); // head ~ 0.21*120
    expect(heads.length).toBeGreaterThan(0);
    const head = heads.reduce((a, b) => (a.y < b.y ? a : b)); // topmost circle = head
    const headCx = head.x + head.w / 2;
    // torso top centre is sheared to ~lean*0.67*h ≈ 10.5 for running; head tracks it
    expect(Math.abs(headCx)).toBeLessThan(0.2 * 120); // within a fifth of height of centre
    expect(headCx).toBeGreaterThan(2); // and actually leaning (not upright)
  });

  it("grounds standing feet at the ground line", () => {
    const ctx = ctxOf();
    const groundY = 200;
    drawCharacter(ctx, 0, groundY, 120, { pose: "standing" });
    const lowest = Math.max(...ctx.nodes.map((n) => n.y + n.h));
    expect(lowest).toBeGreaterThanOrEqual(groundY - 2); // feet reach the ground
    expect(lowest).toBeLessThanOrEqual(groundY + 3);
  });

  it("adds hair / accessory / fx layers on top of the base figure", () => {
    const base = ctxOf();
    drawCharacter(base, 0, 100, 100, { pose: "standing" });
    const decorated = ctxOf();
    drawCharacter(decorated, 0, 100, 100, { pose: "standing", hair: "spiky", accessory: "glasses", fx: "stars" });
    expect(decorated.nodes.length).toBeGreaterThan(base.nodes.length);
  });

  it("register* extends every axis at runtime", () => {
    registerCharacterEmotion("test-emo", (f) => f.dot(f.face.eyeL, f.face.eyeY, 2));
    registerCharacterShirt("test-shirt", (f) => f.stroke([f.T([-0.1, 0.4]), f.T([0.1, 0.4])]));
    registerCharacterHair("test-hair", (f) => f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r, 180, 360)));
    registerCharacterAccessory("test-acc", (f) => f.dot(f.head.cx, f.head.cy, 2));
    registerCharacterFx("test-fx", (f) => f.dot(f.head.cx, f.head.cy - f.head.r * 2, 2));
    expect(listCharacterEmotions()).toContain("test-emo");
    expect(listCharacterHair()).toContain("test-hair");
    expect(listCharacterAccessories()).toContain("test-acc");
    expect(listCharacterFx()).toContain("test-fx");
    const ctx = ctxOf();
    drawCharacter(ctx, 0, 100, 100, { pose: "standing", emotion: "test-emo", shirt: "test-shirt", hair: "test-hair", accessory: "test-acc", fx: "test-fx" });
    expect(ctx.nodes.every((n) => [n.x, n.y, n.w, n.h].every(Number.isFinite))).toBe(true);
  });

  it("characterOptsFrom forwards only the axes that are set", () => {
    expect(characterOptsFrom({ hair: "bob", fx: "idea", nonsense: 5 })).toEqual({ hair: "bob", fx: "idea" });
    expect(characterOptsFrom({})).toEqual({});
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

// ---- full combination matrix (poses × shirts × flip, all emotions) -----------------

import { listCharacterShirts } from "@engine/viz/characters.js";

describe("character matrix — every pose × shirt × flip", () => {
  const finite = (ctx: VizContext) =>
    ctx.nodes.every((n) => [n.x, n.y, n.w, n.h].every(Number.isFinite));

  it("renders every combination with sane geometry", () => {
    for (const pose of listCharacterPoses()) {
      for (const shirt of listCharacterShirts()) {
        for (const flip of [false, true]) {
          const ctx = ctxOf();
          const b = drawCharacter(ctx, 0, 100, 100, { pose, shirt, flip, prop: "star" });
          expect(ctx.nodes.length, `${pose}/${shirt}/flip=${flip}`).toBeGreaterThanOrEqual(10);
          expect(finite(ctx), `${pose}/${shirt}/flip=${flip} has NaN geometry`).toBe(true);
          expect(b.w, `${pose}/${shirt} bounds`).toBeGreaterThan(20);
          expect(b.h).toBeGreaterThan(80);
          // every element stays inside a sane envelope around the figure
          for (const n of ctx.nodes) {
            expect(n.x, `${pose}/${shirt} stray x`).toBeGreaterThan(-160);
            expect(n.x + n.w).toBeLessThan(160);
            expect(n.y).toBeGreaterThan(-60);
            expect(n.y + n.h).toBeLessThan(115);
          }
        }
      }
    }
  });

  it("renders every emotion on every shirt", () => {
    for (const emotion of listCharacterEmotions()) {
      for (const shirt of listCharacterShirts()) {
        const ctx = ctxOf();
        drawCharacter(ctx, 0, 100, 100, { emotion, shirt });
        expect(ctx.nodes.length, `${emotion}/${shirt}`).toBeGreaterThanOrEqual(9);
        expect(finite(ctx)).toBe(true);
      }
    }
  });

  it("renders every hair × accessory × fx with sane geometry", () => {
    for (const hair of listCharacterHair()) {
      for (const accessory of listCharacterAccessories()) {
        const ctx = ctxOf();
        drawCharacter(ctx, 0, 100, 100, { hair, accessory });
        expect(finite(ctx), `${hair}/${accessory} NaN`).toBe(true);
      }
    }
    for (const fx of listCharacterFx()) {
      const ctx = ctxOf();
      drawCharacter(ctx, 0, 100, 100, { fx, emotion: "happy" });
      expect(finite(ctx), `fx ${fx} NaN`).toBe(true);
      for (const n of ctx.nodes) {
        expect(n.y, `fx ${fx} stray`).toBeGreaterThan(-60);
        expect(n.x).toBeGreaterThan(-160);
        expect(n.x + n.w).toBeLessThan(160);
      }
    }
  });

  it("ships the full movement + expression + shirt vocabulary", () => {
    expect(listCharacterPoses().length).toBeGreaterThanOrEqual(40);
    expect(listCharacterEmotions().length).toBeGreaterThanOrEqual(24);
    // the original seven shirts stay, in order, at the front of the registry
    expect(listCharacterShirts().slice(0, 7)).toEqual(["vest", "tee", "striped", "solid", "tie", "dress", "hoodie"]);
    expect(listCharacterShirts().length).toBeGreaterThanOrEqual(12);
    for (const axis of [listCharacterHair(), listCharacterAccessories(), listCharacterFx()]) expect(axis.length).toBeGreaterThanOrEqual(10);
  });
});
