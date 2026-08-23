/**
 * Standalone `character` and `icon` nodes: DSL parse/compile (attrs, style
 * cascade, diagnostics + fallbacks), the node box the layout sees, edges /
 * camera / annotation targeting, and the DOM render (jsdom) including
 * setRevealProgress draw-on over a figure.
 */
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import type { Scene } from "@engine/scene/types.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { elementBBox, listCharacterNodes, listIconNodes } from "@engine/scene/query.js";
import { resolveCameraDirective, stepStateAt } from "@engine/timeline/stepState.js";
import { listIcons, iconEntry } from "@engine/viz/icons.js";
import { characterNodeSpec } from "@engine/viz/characterNode.js";
import { iconNodeSpec } from "@engine/viz/iconNode.js";
import "@engine/viz/generators/index.js";

function mount(src: string, opts?: { static?: boolean }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const { scene, diagnostics } = compileEdd(src);
  const renderer = new SvgRenderer(host, opts);
  renderer.mount();
  renderer.render(scene);
  return { host, renderer, scene, diagnostics };
}

const errorsOf = (d: { items: { severity: string }[] }) => d.items.filter((x) => x.severity === "error");
const nodeOf = (scene: Scene, id: string) => scene.nodes.find((n) => n.id === id)!;

const BRAD = `scene {
  layout manual
  character brad "Brad" { at: (0, 0), pose: thinking, emotion: curious, hair: short, shirt: hoodie, accessory: glasses, fx: question, prop: bulb, height: 240, flip: true }
}`;

// ---- compile ------------------------------------------------------------------

describe("character node — compile", () => {
  it("compiles the keyword form into a character node carrying every axis", () => {
    const { scene, diagnostics } = compileEdd(BRAD);
    expect(errorsOf(diagnostics)).toEqual([]);
    const n = nodeOf(scene, "brad");
    expect(n.shape).toBe("character");
    expect(n.label).toBe("Brad");
    const spec = characterNodeSpec(n)!;
    expect(spec).toMatchObject({
      pose: "thinking",
      emotion: "curious",
      hair: "short",
      shirt: "hoodie",
      accessory: "glasses",
      fx: "question",
      prop: "bulb",
      height: 240,
      flip: true,
    });
    expect(listCharacterNodes(scene)).toEqual(["brad"]);
  });

  it("defaults to a standing figure at the default height", () => {
    const { scene, diagnostics } = compileEdd(`scene { character sam }`);
    expect(errorsOf(diagnostics)).toEqual([]);
    const spec = characterNodeSpec(nodeOf(scene, "sam"))!;
    expect(spec.pose).toBe("standing");
    expect(spec.height).toBe(200);
  });

  it("accepts the explicit and attribute forms too", () => {
    const a = compileEdd(`scene { node sam "Sam" as character { pose: waving } }`);
    expect(characterNodeSpec(nodeOf(a.scene, "sam"))!.pose).toBe("waving");
    const b = compileEdd(`scene { rect sam "Sam" { shape: character, pose: sitting } }`);
    expect(nodeOf(b.scene, "sam").shape).toBe("character");
    expect(characterNodeSpec(nodeOf(b.scene, "sam"))!.pose).toBe("sitting");
  });

  it("takes character axes through the style cascade (:::class)", () => {
    const { scene } = compileEdd(`style .hero { pose: cheering, emotion: excited }
scene { character kim "Kim" :::hero }`);
    const spec = characterNodeSpec(nodeOf(scene, "kim"))!;
    expect(spec.pose).toBe("cheering");
    expect(spec.emotion).toBe("excited");
  });

  it("`label: false` (and an empty label) drops the caption", () => {
    const { scene } = compileEdd(`scene { character ghost { label: false, pose: standing } }`);
    const n = nodeOf(scene, "ghost");
    expect(n.label).toBe("");
    // the box is then just the figure — no label row
    expect(n.h).toBeCloseTo(characterNodeSpec(n)!.figure!.h, 1);
  });

  it("resolves colors through theme tokens, never hardcoding", () => {
    const { scene } = compileEdd(`theme light { tokens { $brand: #2563eb } }
scene { use theme light
  character kim "Kim" { pose: standing, shirtColor: $brand, hairColor: red } }`);
    const spec = characterNodeSpec(nodeOf(scene, "kim"))!;
    expect(spec.shirtColor).toBe("#2563eb");
    expect(spec.hairColor).toBeTruthy();
    expect(spec.hairColor).not.toBe("red"); // resolved through the palette
  });
});

// ---- diagnostics ---------------------------------------------------------------

describe("character node — diagnostics", () => {
  it("warns with the valid list and falls back instead of blanking the figure", () => {
    const { scene, diagnostics } = compileEdd(`scene { character x "X" { pose: nope, emotion: meh } }`);
    expect(errorsOf(diagnostics)).toEqual([]);
    const pose = diagnostics.items.find((d) => d.code === "W-CHARACTER-POSE")!;
    expect(pose.severity).toBe("warning");
    expect(pose.message).toContain("nope");
    expect(pose.expected).toContain("standing");
    const emo = diagnostics.items.find((d) => d.code === "W-CHARACTER-EMOTION")!;
    expect(emo.expected).toContain("neutral");
    const spec = characterNodeSpec(nodeOf(scene, "x"))!;
    expect(spec.pose).toBe("standing");
    expect(spec.emotion).toBe("neutral");
    expect(nodeOf(scene, "x").w).toBeGreaterThan(0);
  });

  it("suggests a near miss and ignores unknown optional axes / props", () => {
    const { diagnostics } = compileEdd(`scene { character x { pose: standin, hair: weird, prop: nothing } }`);
    expect(diagnostics.items.find((d) => d.code === "W-CHARACTER-POSE")!.hint).toContain("standing");
    expect(diagnostics.items.find((d) => d.code === "W-CHARACTER-HAIR")).toBeTruthy();
    expect(diagnostics.items.find((d) => d.code === "W-CHARACTER-PROP")).toBeTruthy();
    expect(errorsOf(diagnostics)).toEqual([]);
  });

  it("renders an unknown-pose figure rather than nothing", () => {
    const { renderer } = mount(`scene { character x "X" { pose: not-real } }`);
    const g = renderer.svg.querySelector('[data-node="x"]')!;
    expect(g.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect").length).toBeGreaterThan(5);
  });
});

// ---- geometry / layout ---------------------------------------------------------

describe("character node — box & layout", () => {
  it("sizes the box from the figure extents plus the label row", () => {
    const { scene } = compileEdd(BRAD);
    const n = nodeOf(scene, "brad");
    const fig = characterNodeSpec(n)!.figure!;
    expect(n.h).toBeGreaterThan(240); // 240 figure + label row
    expect(n.h).toBeGreaterThan(fig.h);
    expect(n.w).toBeGreaterThanOrEqual(fig.w);
    expect(n.w).toBeLessThan(240); // a person is taller than wide
  });

  it("height: scales the box", () => {
    const small = compileEdd(`scene { character a "A" { pose: standing, height: 100 } }`);
    const big = compileEdd(`scene { character a "A" { pose: standing, height: 300 } }`);
    expect(nodeOf(big.scene, "a").h).toBeGreaterThan(nodeOf(small.scene, "a").h * 2.5);
  });

  it("participates in dag layout and anchors edges on its bbox", () => {
    const { scene, diagnostics } = compileEdd(`scene {
      layout dag { direction: right }
      character kim "Kim" { pose: presenting }
      rect idea "The idea"
      kim --> idea "explains"
    }`);
    expect(errorsOf(diagnostics)).toEqual([]);
    const kim = nodeOf(scene, "kim");
    const idea = nodeOf(scene, "idea");
    expect(idea.x).toBeGreaterThan(kim.x + kim.w - 1); // laid out to the right, no overlap
    const edge = scene.edges[0];
    expect(edge.points!.length).toBeGreaterThanOrEqual(2);
    const start = edge.points![0];
    expect(start.x).toBeGreaterThanOrEqual(kim.x - 1);
    expect(start.x).toBeLessThanOrEqual(kim.x + kim.w + 1);
  });

  it("honours manual placement (at:) and pins the node", () => {
    const { scene } = compileEdd(`scene { layout manual\n character kim "Kim" { at: (500, 120), pose: waving } }`);
    const n = nodeOf(scene, "kim");
    expect([n.x, n.y]).toEqual([500, 120]);
    expect(n.pinned).toBe(true);
  });

  it("is a camera / annotation / reveal target", () => {
    const { scene, diagnostics } = compileEdd(`scene { character kim "Kim" { pose: standing } }
annotate { circle-mark kim "here" }
timeline { beat one { camera focus kim zoom 1.5; reveal { draw-on kim } } }`);
    expect(diagnostics.items.filter((d) => d.code === "W-ANNOT-TARGET" || d.code === "W-STEP-TARGET")).toEqual([]);
    const box = elementBBox(scene, "kim")!;
    expect(box.maxY).toBeGreaterThan(box.minY);
    const st = stepStateAt(scene, 0);
    expect(st.camera!.targets).toContain("kim");
    const cam = resolveCameraDirective(scene, st.camera, { w: 1920, h: 1080 });
    expect(cam.zoom).toBeCloseTo(1.5, 5);
    expect(cam.cx).toBeCloseTo((box.minX + box.maxX) / 2, 1);
  });

  it("flip mirrors the figure horizontally", () => {
    const a = mount(`scene { layout manual\n character p { at: (0,0), pose: pointing, label: false } }`);
    const b = mount(`scene { layout manual\n character p { at: (0,0), pose: pointing, flip: true, label: false } }`);
    const armTip = (r: typeof a.renderer) => {
      const g = r.svg.querySelector('[data-node="p"]')!;
      const xs = [...g.querySelectorAll("path")].map((el) => (el.getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g) ?? []);
      const all = xs.flat().map(Number);
      return { min: Math.min(...all), max: Math.max(...all) };
    };
    // pointing reaches right; flipped it must reach left of the figure centre
    const ca = nodeOf(a.scene, "p");
    const cb = nodeOf(b.scene, "p");
    expect(armTip(a.renderer).max).toBeGreaterThan(ca.x + ca.w * 0.6);
    expect(armTip(b.renderer).min).toBeLessThan(cb.x + cb.w * 0.4);
  });
});

// ---- render --------------------------------------------------------------------

describe("character node — render", () => {
  it("draws the figure and its label inside one data-node group", () => {
    const { renderer, scene } = mount(BRAD);
    const g = renderer.svg.querySelector<SVGGElement>('[data-node="brad"]')!;
    expect(g).toBeTruthy();
    expect(g.querySelector(".edd-character")).toBeTruthy();
    // head + torso + 4 limbs + feet + face + hair + glasses + prop + fx
    expect(g.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect").length).toBeGreaterThan(12);
    const texts = [...g.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toContain("Brad");
    // label sits under the feet, inside the node box
    const label = [...g.querySelectorAll("text")].find((t) => t.textContent === "Brad")!;
    const y = Number(label.querySelector("tspan")!.getAttribute("y"));
    const n = nodeOf(scene, "brad");
    expect(y).toBeGreaterThan(n.y + n.h - 40);
    expect(y).toBeLessThanOrEqual(n.y + n.h);
  });

  it("is deterministic across renders (stable rough seeds)", () => {
    const a = mount(BRAD).renderer.svg.querySelector('[data-node="brad"]')!.innerHTML;
    const b = mount(BRAD).renderer.svg.querySelector('[data-node="brad"]')!.innerHTML;
    expect(a).toBe(b);
  });

  it("derives ink from the active style preset, not a hardcoded color", () => {
    const strokeOf = (src: string) =>
      mount(src).renderer.svg.querySelector('[data-node="p"] path')!.getAttribute("stroke");
    const classic = strokeOf(`meta { style: classic }\nscene { character p "P" }`);
    const chalk = strokeOf(`meta { style: chalkboard }\nscene { character p "P" }`);
    const authored = strokeOf(`meta { style: classic }\nscene { character p "P" { stroke: #2563eb } }`);
    expect(classic).toBeTruthy();
    expect(chalk).not.toBe(classic); // the preset's ink, not a constant
    expect(authored).toBe("#2563eb"); // an authored color still wins
  });

  it("setRevealProgress sweeps the whole figure on as one drawing", () => {
    const { renderer } = mount(BRAD, { static: true });
    const strokes = () =>
      [...renderer.svg.querySelectorAll<SVGElement>('[data-node="brad"] path,[data-node="brad"] line,[data-node="brad"] polyline,[data-node="brad"] circle,[data-node="brad"] ellipse,[data-node="brad"] rect')];
    renderer.setRevealProgress("brad", 0);
    const offsets0 = strokes().map((el) => Number(el.getAttribute("stroke-dashoffset") ?? 0));
    expect(offsets0.some((v) => v > 0)).toBe(true);
    const text = renderer.svg.querySelector<SVGTextElement>('[data-node="brad"] text')!;
    expect(Number(text.style.opacity)).toBe(0);

    renderer.setRevealProgress("brad", 0.5);
    const offsets50 = strokes().map((el) => Number(el.getAttribute("stroke-dashoffset") ?? 0));
    // half-way: some strokes fully drawn (offset 0), later ones still pending
    expect(offsets50.filter((v) => v === 0).length).toBeGreaterThan(0);
    expect(offsets50.some((v) => v > 0)).toBe(true);
    expect(offsets50.reduce((a, b) => a + b, 0)).toBeLessThan(offsets0.reduce((a, b) => a + b, 0));

    renderer.setRevealProgress("brad", 1);
    expect(strokes().every((el) => el.getAttribute("stroke-dashoffset") === null)).toBe(true);
    expect(text.style.opacity).toBe("");
  });

  it("hides/shows with applyVisibility like any node", () => {
    const { renderer } = mount(BRAD, { static: true });
    const g = renderer.svg.querySelector<SVGGElement>('[data-node="brad"]')!;
    renderer.applyVisibility(new Set(["brad"]));
    expect(g.classList.contains("edd-hidden")).toBe(true);
    renderer.applyVisibility(new Set());
    expect(g.classList.contains("edd-hidden")).toBe(false);
  });
});

// ---- icon nodes ----------------------------------------------------------------

describe("icon node", () => {
  it("compiles `icon <id> \"Label\"` with the id as the glyph name", () => {
    const { scene, diagnostics } = compileEdd(`scene { icon wheelchair "Access" }`);
    expect(errorsOf(diagnostics)).toEqual([]);
    const n = nodeOf(scene, "wheelchair");
    expect(n.shape).toBe("icon");
    expect(iconNodeSpec(n)!.name).toBe("wheelchair");
    expect(listIconNodes(scene)).toEqual(["wheelchair"]);
    expect(n.h).toBeGreaterThan(64); // glyph + caption
  });

  it("takes an explicit icon: name and size:", () => {
    const { scene } = compileEdd(`scene { icon g "Growth" { icon: trend-up, size: 96 } }`);
    const n = nodeOf(scene, "g");
    expect(iconNodeSpec(n)!).toMatchObject({ name: "trend-up", size: 96 });
    expect(n.h).toBeGreaterThan(96);
  });

  it("warns (but still captions) on an unknown glyph", () => {
    const { scene, diagnostics } = compileEdd(`scene { icon x "Mystery" { icon: not-an-icon } }`);
    expect(errorsOf(diagnostics)).toEqual([]);
    expect(diagnostics.items.find((d) => d.code === "W-ICON")).toBeTruthy();
    expect(nodeOf(scene, "x").label).toBe("Mystery");
  });

  it("renders the glyph + caption in one node group and draws on", () => {
    const { renderer } = mount(`scene { icon scaffold "Scaffold" }`, { static: true });
    const g = renderer.svg.querySelector<SVGGElement>('[data-node="scaffold"]')!;
    expect(g.querySelector(".edd-icon")).toBeTruthy();
    expect(g.querySelectorAll("path").length).toBeGreaterThan(0);
    expect([...g.querySelectorAll("text")].map((t) => t.textContent)).toContain("Scaffold");
    renderer.setRevealProgress("scaffold", 0.4);
    expect([...g.querySelectorAll("path")].some((el) => Number(el.getAttribute("stroke-dashoffset") ?? 0) > 0)).toBe(true);
  });
});

// ---- new icons -----------------------------------------------------------------

describe("0.13 icons", () => {
  it("registers the new glyphs", () => {
    const icons = listIcons();
    for (const name of ["wheelchair", "ladder", "scaffold", "sparkle", "robot", "brain", "graduation-cap"]) {
      expect(icons).toContain(name);
      const entry = iconEntry(name)!;
      expect(entry.viewBox).toBe(24);
      expect(entry.d.length).toBeGreaterThan(20);
    }
  });

  it("resolves the aliases", () => {
    for (const [alias, canonical] of [["ai", "sparkle"], ["magic", "sparkle"], ["bot", "robot"], ["graduate", "graduation-cap"], ["school", "graduation-cap"], ["accessibility", "wheelchair"]]) {
      expect(iconEntry(alias)!.d).toBe(iconEntry(canonical)!.d);
    }
  });

  it("works as a viz item icon and as a character prop", () => {
    const v = compileEdd(`viz list l { item "Support" { icon: scaffold } }`);
    expect(errorsOf(v.diagnostics)).toEqual([]);
    const c = compileEdd(`scene { character p "P" { pose: holding-overhead, prop: brain } }`);
    expect(errorsOf(c.diagnostics)).toEqual([]);
    expect(characterNodeSpec(nodeOf(c.scene, "p"))!.prop).toBe("brain");
  });
});
