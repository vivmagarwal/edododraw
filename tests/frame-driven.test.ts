/**
 * Frame-driven / video-host integration surface:
 * static render mode, viz item grouping (data-viz-item), showValues,
 * pure timeline stepState, setRevealProgress, dotted annotation targets,
 * startHidden, and the machine-readable template catalog.
 */
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { elementBBox, listVizItems, vizItemMembers } from "@engine/scene/query.js";
import { computeHiddenAt, resolveCameraDirective, stepStateAt } from "@engine/timeline/stepState.js";
import { mixCameras } from "@engine/camera/fit.js";
import { listVizTemplates } from "@engine/viz/registry.js";
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

const VIZ_LIST = `viz list fix "Fixes" {
  item "The busy slide" detail: "too much at once"
  item "No contrast"
}`;

// ---- static mode -------------------------------------------------------------

describe("static render mode", () => {
  it("tags the svg with edd-static and emits no animated-arrow overlay", () => {
    const src = `scene { a[A] --> b[B] { animate: flow } }`;
    const on = mount(src);
    expect(on.renderer.svg.getAttribute("class")).not.toContain("edd-static");
    expect(on.renderer.svg.querySelector(".edd-anim")).toBeTruthy();

    const off = mount(src, { static: true });
    expect(off.renderer.svg.getAttribute("class")).toContain("edd-static");
    expect(off.renderer.svg.querySelector(".edd-anim")).toBeNull();
  });

  it("injects the .edd-static CSS override (no transitions/animations)", () => {
    mount("scene { rect a }", { static: true });
    const styles = document.getElementById("edd-engine-styles")?.textContent ?? "";
    expect(styles).toContain(".edd-static");
    expect(styles).toContain("transition: none !important");
  });
});

// ---- viz item grouping ---------------------------------------------------------

describe("viz item grouping (data-viz-item)", () => {
  it("tags every element of a data item in the Scene IR and the DOM", () => {
    const { scene, renderer } = mount(VIZ_LIST);
    const members = vizItemMembers(scene, "fix.the-busy-slide");
    expect(members.length).toBeGreaterThanOrEqual(3); // circle + number/label + detail
    // the Scene IR carries the tag…
    const tagged = scene.nodes.filter((n) => (n.data as { vizItem?: string })?.vizItem === "fix.the-busy-slide");
    expect(tagged.length).toBe(members.length);
    // …and the DOM exposes it as an attribute, with semantic roles
    const domEls = renderer.svg.querySelectorAll('[data-viz-item="fix.the-busy-slide"]');
    expect(domEls.length).toBe(members.length);
    const roles = new Set([...domEls].map((el) => el.getAttribute("data-viz-role")));
    expect(roles.has("shape")).toBe(true);
    expect(roles.has("label")).toBe(true);
  });

  it("lists item keys and resolves them as bboxes (annotation/camera anchoring)", () => {
    const { scene } = mount(VIZ_LIST);
    expect(listVizItems(scene)).toContain("fix.no-contrast");
    const box = elementBBox(scene, "fix.the-busy-slide")!;
    expect(box).toBeTruthy();
    expect(box.maxX).toBeGreaterThan(box.minX);
  });
});

// ---- showValues ---------------------------------------------------------------

describe("showValues option", () => {
  const FUNNEL = (opts: string) => `viz funnel f {
    ${opts}
    item "Visitors" 1200
    item "Signups" 300
  }`;

  it("prints values by default, suppresses them with showValues: false", () => {
    const on = compileEdd(FUNNEL("")).scene;
    expect(on.nodes.some((n) => n.label.includes("1,200"))).toBe(true);
    const off = compileEdd(FUNNEL("showValues: false")).scene;
    expect(off.nodes.some((n) => n.label.includes("1,200"))).toBe(false);
    // values still drive geometry/labels otherwise
    expect(off.nodes.some((n) => n.label.includes("Visitors"))).toBe(true);
  });
});

// ---- annotation targets ---------------------------------------------------------

describe("annotation targets for dotted ids", () => {
  it("resolves `strike fix.the-busy-slide` to the viz item (no silent no-op)", () => {
    const { scene, diagnostics } = compileEdd(`${VIZ_LIST}\nannotate { strike fix.the-busy-slide }`);
    const an = scene.annotations[0];
    expect(an.target.ref).toBe("fix.the-busy-slide");
    expect(an.target.part).toBeUndefined();
    expect(diagnostics.items.filter((d) => d.code === "W-ANNOT-TARGET")).toEqual([]);
    // and the layer can anchor it
    expect(elementBBox(scene, an.target.ref!)).toBeTruthy();
  });

  it("supports an explicit quoted target: attribute", () => {
    const { scene, diagnostics } = compileEdd(`${VIZ_LIST}\nannotate { strike { target: "fix.the-busy-slide" } }`);
    expect(scene.annotations[0].target.ref).toBe("fix.the-busy-slide");
    expect(diagnostics.items.filter((d) => d.code === "W-ANNOT-TARGET")).toEqual([]);
  });

  it("emits W-ANNOT-TARGET when a target matches nothing", () => {
    const { diagnostics } = compileEdd(`scene { rect a }\nannotate { strike nope.missing }`);
    const warns = diagnostics.items.filter((d) => d.code === "W-ANNOT-TARGET");
    expect(warns.length).toBe(1);
    expect(warns[0].message).toContain("nope.missing");
  });

  it("leaves legitimate part targets (a.label) alone", () => {
    const { scene, diagnostics } = compileEdd(`scene { rect a }\nannotate { underline a.label }`);
    expect(scene.annotations[0].target).toMatchObject({ ref: "a", part: "label" });
    expect(diagnostics.items.filter((d) => d.code === "W-ANNOT-TARGET")).toEqual([]);
  });
});

// ---- timeline: viz item targets + pure step state --------------------------------

describe("timeline viz-item targets", () => {
  it("expands a viz item key in reveal/hide to all member elements", () => {
    const { scene } = compileEdd(`${VIZ_LIST}\ntimeline t { beat one "1" { hide fix.the-busy-slide } }`);
    const members = vizItemMembers(scene, "fix.the-busy-slide");
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) expect(scene.steps[0].hide).toContain(m);
  });

  it("warns on unknown timeline targets", () => {
    const { diagnostics } = compileEdd(`scene { rect a }\ntimeline t { beat one "1" { hide missing-thing } }`);
    expect(diagnostics.items.some((d) => d.code === "W-STEP-TARGET")).toBe(true);
  });
});

describe("pure step state (frame-driven timeline)", () => {
  const SRC = `scene { rect a "A"\n rect b "B"\n rect c "C" }
annotate { box-around a "base" }
timeline t {
  beat one "1" { hide b; camera focus [a] zoom 2; narrate: "first" }
  beat two "2" { hide c; annotate { circle-around a } }
  beat three "3" { show b }
}`;

  it("accumulates sticky visibility and layers beat annotations over always-on", () => {
    const { scene } = compileEdd(SRC);
    expect(stepStateAt(scene, -1)).toMatchObject({ index: -1, stepName: "Overview", hidden: [] });
    expect(new Set(stepStateAt(scene, 0).hidden)).toEqual(new Set(["b"]));
    const s1 = stepStateAt(scene, 1);
    expect(new Set(s1.hidden)).toEqual(new Set(["b", "c"]));
    expect(s1.annotations.length).toBe(2); // always-on box + beat circle
    expect(new Set(stepStateAt(scene, 2).hidden)).toEqual(new Set(["c"]));
    expect(stepStateAt(scene, 0).caption).toBe("first");
    // matches the player's own math
    expect(new Set(stepStateAt(scene, 1).hidden)).toEqual(computeHiddenAt(scene.steps, 1));
  });

  it("keeps the camera sticky across steps that don't move it", () => {
    const { scene } = compileEdd(SRC);
    const s1 = stepStateAt(scene, 1);
    expect(s1.camera).toBeUndefined();
    expect(s1.effectiveCamera).toMatchObject({ op: "focus", zoom: 2 });
  });

  it("resolves camera directives to concrete transforms, and mixes them", () => {
    const { scene } = compileEdd(SRC);
    const vp = { w: 800, h: 600 };
    const fit = resolveCameraDirective(scene, undefined, vp);
    expect(fit.zoom).toBeGreaterThan(0);
    const focus = resolveCameraDirective(scene, stepStateAt(scene, 1).effectiveCamera, vp);
    expect(focus.zoom).toBe(2);
    const mid = mixCameras(fit, focus, 0.5);
    expect(mid.zoom).toBeCloseTo(fit.zoom * Math.sqrt(focus.zoom / fit.zoom));
    expect(mid.cx).toBeCloseTo((fit.cx + focus.cx) / 2);
  });
});

// ---- setRevealProgress -----------------------------------------------------------

describe("setRevealProgress", () => {
  it("sweeps strokes with dashoffset mid-progress and restores cleanly at 1", () => {
    const { renderer } = mount(`scene { rect a "Hello" }`, { static: true });
    renderer.setRevealProgress("a", 0.4);
    const g = renderer.svg.querySelector('[data-node="a"]')!;
    const dashed = g.querySelectorAll("[stroke-dashoffset]");
    expect(dashed.length).toBeGreaterThan(0);
    const text = g.querySelector("text") as SVGTextElement;
    expect(text.style.opacity).toBe("0"); // labels fade only near the end

    renderer.setRevealProgress("a", 0.9);
    expect(Number(text.style.opacity)).toBeGreaterThan(0);

    renderer.setRevealProgress("a", 1);
    expect(g.querySelectorAll("[stroke-dashoffset]").length).toBe(0);
    expect(g.querySelectorAll("[data-edd-dash]").length).toBe(0);
    expect(text.style.opacity).toBe("");
  });

  it("treats a viz-item key as one continuous drawing", () => {
    const { renderer } = mount(VIZ_LIST, { static: true });
    renderer.setRevealProgress("fix.the-busy-slide", 0.5);
    const els = renderer.svg.querySelectorAll('[data-viz-item="fix.the-busy-slide"] [stroke-dashoffset]');
    expect(els.length).toBeGreaterThan(0);
    renderer.setRevealProgress("fix.the-busy-slide", 1);
    expect(renderer.svg.querySelectorAll('[data-viz-item="fix.the-busy-slide"] [stroke-dashoffset]').length).toBe(0);
  });
});

// ---- template catalog -------------------------------------------------------------

describe("listVizTemplates", () => {
  it("returns a machine-readable catalog with aliases and entry kinds", () => {
    const all = listVizTemplates();
    expect(all.length).toBeGreaterThanOrEqual(60);
    const funnel = all.find((t) => t.name === "funnel")!;
    expect(funnel.entryKinds).toContain("stage");
    expect(funnel.options.some((o) => o.name === "showValues")).toBe(true);
    expect(funnel.sweetSpot).toBeTruthy();
    const ideas = all.find((t) => t.name === "key-ideas")!;
    expect(ideas.aliases).toContain("ideas");
  });
});

// ---- auto-choreography (animate: on any viz block) --------------------------------

describe("viz auto-choreography", () => {
  const SRC = `viz list fix "Fixes" {
  animate: pop
  hold: 2
  item "The busy slide"
  item "No contrast"
}`;

  it("synthesizes overview + one beat per item + closing fit-all", () => {
    const { scene } = compileEdd(SRC);
    expect(scene.steps.length).toBe(4);
    expect(scene.steps[0]).toMatchObject({ name: "Overview", camera: { op: "fit-all" } });
    const members = vizItemMembers(scene, "fix.the-busy-slide");
    for (const m of members) expect(scene.steps[0].hide).toContain(m);
    const beat = scene.steps[1];
    expect(beat.caption).toBe("The busy slide");
    expect(beat.reveal).toEqual(expect.arrayContaining(members));
    expect(beat.revealFx?.[members[0]]).toBe("pop");
    expect(beat.autoAdvanceMs).toBe(2000);
    expect(scene.steps[3].camera).toMatchObject({ op: "fit-all" });
    // the pure frame-driven API sees the same story
    expect(new Set(stepStateAt(scene, 0).hidden)).toEqual(computeHiddenAt(scene.steps, 0));
    expect(stepStateAt(scene, 1).hidden.length).toBeLessThan(stepStateAt(scene, 0).hidden.length);
  });

  it("animateCamera focuses each item's group", () => {
    const { scene } = compileEdd(SRC.replace("animate: pop", "animate: true\n  animateCamera: true"));
    expect(scene.steps[1].camera).toMatchObject({ op: "focus", targets: ["fix.the-busy-slide"] });
  });

  it("an explicit timeline always wins over animate:", () => {
    const { scene } = compileEdd(`${SRC}\ntimeline t { beat one "1" { camera fit-all } }`);
    expect(scene.steps.length).toBe(1);
    expect(scene.steps[0].name).toBe("1");
  });
});
