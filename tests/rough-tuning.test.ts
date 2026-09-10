/**
 * Rough geometry tuning: the four RoughTuning options, the `hand-clean`
 * preset, and the two render-time knobs (`setRoughnessScale`,
 * `nonScalingStroke`) that keep a diagram crisp through a camera punch-in.
 *
 * 0.15 also changes the DEFAULT: `classic` and `classic-color` now ship the
 * smooth tuning (pinned corners, one pass) because rough.js perturbs geometry
 * in world units and a camera `scale(zoom)` magnifies both the jitter and the
 * stroke width — 1.71px of corner error at 1x is 4.84px at 4x. The pre-0.15
 * values live on as `classic-rough`, and the tests below pin BOTH: the new
 * default is smooth, and `classic-rough` still draws the old scratchy bytes.
 */
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { getStylePreset, listStyleChoices, roughTuning, presetDeclaresRoughTuning } from "@engine/style/presets.js";
import type { Scene } from "@engine/scene/types.js";

function mount(src: string, opts: ConstructorParameters<typeof SvgRenderer>[1] = {}) {
  const { scene, diagnostics } = compileEdd(src);
  expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const renderer = new SvgRenderer(host, opts);
  renderer.mount();
  renderer.render(scene);
  return { host, renderer, scene };
}

/** Every `d` under the world group, joined — a byte-level fingerprint. */
function paths(r: SvgRenderer): string {
  return [...r.world.querySelectorAll("path,line,polyline,polygon,ellipse,circle,rect")]
    .map((el) => `${el.tagName}:${el.getAttribute("d") ?? ""}${el.getAttribute("points") ?? ""}${el.getAttribute("x1") ?? ""}`)
    .join("|");
}

/** Max |y - baselineY| over the sampled vertices of a path's `d`. */
function verticalSpread(d: string, baselineY: number): number {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  let worst = 0;
  for (let i = 1; i < nums.length; i += 2) worst = Math.max(worst, Math.abs(nums[i] - baselineY));
  return worst;
}

const PLAIN = `scene {
  group g "Cluster" { rect a "Alpha"; rect b "Beta" }
  a --> b
}
annotate { circle-mark a "look"; underline b }`;

describe("RoughTuning — the default is now smooth", () => {
  it("a diagram that names nothing inherits the smooth tuning from `classic`", () => {
    const { scene } = compileEdd(PLAIN);
    for (const st of [scene.nodes[0].style, scene.edges[0].style] as const) {
      expect(st.roughness).toBe(0.45);
      expect(st.bowing).toBe(0.4);
      expect(st.maxRandomnessOffset).toBe(1);
      expect(st.preserveVertices).toBe(true);
      expect(st.disableMultiStroke).toBe(true);
    }
    // `meta.rough` records the diagram-wide EFFECTIVE tuning, and the preset is
    // now part of it. What it must never do is exist when nothing supplies it —
    // see the `classic-rough` case below.
    expect(scene.meta.rough).toEqual({
      roughness: 0.45, bowing: 0.4, maxRandomnessOffset: 1, preserveVertices: true, disableMultiStroke: true,
    });
  });

  it("`classic-rough` restores exactly the pre-0.15 geometry", () => {
    const p = getStylePreset("classic-rough")!;
    expect(p).toBeTruthy();
    expect(p.roughness).toBe(1.15);
    expect(p.bowing).toBe(1);
    expect(p.maxRandomnessOffset).toBe(2);
    expect(p.preserveVertices).toBe(false);
    expect(p.disableMultiStroke).toBe(false);
    // and it keeps classic's identity — one ink, no fills, hand lettering
    expect(p.palette).toEqual(getStylePreset("classic")!.palette);
    expect(p.fillMode).toBe(getStylePreset("classic")!.fillMode);
    expect(p.fonts.body).toBe("hand");
  });

  it("only the hand-drawn presets declare tuning; the line-art ones still do not", () => {
    const declares = new Set(["classic", "classic-color", "classic-rough", "hand-clean", "hand-clean-dark"]);
    for (const p of listStyleChoices()) {
      if (declares.has(p.name)) {
        expect(presetDeclaresRoughTuning(p), p.name).toBe(true);
        expect(Object.keys(roughTuning(p)).length, p.name).toBeGreaterThan(0);
      } else {
        expect(roughTuning(p), p.name).toEqual({});
        expect(presetDeclaresRoughTuning(p), p.name).toBe(false);
      }
    }
  });

  it("a roughnessScale of 1 draws the same bytes as no scale at all", () => {
    const plain = mount(PLAIN);
    const scaled = mount(PLAIN, { roughnessScale: 1 });
    expect(paths(scaled.renderer)).toBe(paths(plain.renderer));
  });

  it("nonScalingStroke is off by default — no vector-effect anywhere", () => {
    const { renderer } = mount(PLAIN);
    expect(renderer.world.querySelectorAll("[vector-effect]").length).toBe(0);
    expect(renderer.nonScalingStroke).toBe(false);
  });
});

describe("the hand-clean presets", () => {
  it("ship the measured video values, light and dark", () => {
    for (const name of ["hand-clean", "hand-clean-dark"]) {
      const p = getStylePreset(name)!;
      expect(p, name).toBeTruthy();
      expect(p.roughness).toBe(0.35);
      expect(p.bowing).toBe(0.35);
      expect(p.maxRandomnessOffset).toBe(1);
      expect(p.preserveVertices).toBe(true);
      expect(p.disableMultiStroke).toBe(true);
    }
    expect(getStylePreset("hand-clean")!.mode).toBe("light");
    expect(getStylePreset("hand-clean-dark")!.mode).toBe("dark");
    // a designed dark stage, not an inverted light one
    expect(getStylePreset("hand-clean-dark")!.fillMode).toBe("translucent");
    expect(getStylePreset("hand-clean")!.fillMode).toBe("soft");
  });

  it("appears in the style chooser, with the dark auto-variant hidden", () => {
    const names = listStyleChoices().map((p) => p.name);
    expect(names).toContain("hand-clean");
    expect(names).not.toContain("hand-clean-dark");
    expect(names).not.toContain("classic-dark");
  });

  it("governs nodes, edges, viz templates, group frames and annotations at once", () => {
    const { scene } = compileEdd(`meta { style: hand-clean }\n${PLAIN}\nviz bar v "R" { item "Q1" 12; item "Q2" 19 }`);
    expect(scene.meta.rough).toEqual({ roughness: 0.35, bowing: 0.35, maxRandomnessOffset: 1, preserveVertices: true, disableMultiStroke: true });
    for (const el of [scene.nodes[0].style, scene.edges[0].style] as const) {
      expect(el.roughness).toBe(0.35);
      expect(el.preserveVertices).toBe(true);
    }
    const vizNode = scene.nodes.find((n) => n.id.startsWith("v."))!;
    expect(vizNode.style.roughness).toBe(0.35);
    expect(vizNode.style.preserveVertices).toBe(true);
  });

  it("pins the corners it promises — the drawn OUTLINE starts exactly on the box", () => {
    // `roundness: 0` so both presets draw the same sharp box (hand-clean ships
    // cornerRadius 10, and a rounded corner is not a corner error). The
    // outline is the stroked path — rough.js emits a separate, unstroked fill
    // polygon first, and `solidFillPolygon` does not honour preserveVertices.
    const cornerError = (style: string) => {
      const { renderer } = mount(`meta { style: ${style} }\nscene { rect a "A" { roundness: 0 } }`);
      const node = (renderer as unknown as { getScene(): Scene }).getScene()!.nodes[0];
      const outline = [...renderer.world.querySelectorAll('[data-node="a"] path')].find(
        (el) => (el.getAttribute("stroke") ?? "none") !== "none",
      )!;
      // every sub-stroke endpoint, vs the box's top-left corner
      let best = Infinity;
      for (const sub of outline.getAttribute("d")!.split(/(?=M)/)) {
        const nums = (sub.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        for (const [px, py] of [[nums[0], nums[1]], [nums[nums.length - 2], nums[nums.length - 1]]]) {
          best = Math.min(best, Math.hypot(px - node.x, py - node.y));
        }
      }
      renderer.destroy();
      return best;
    };
    expect(cornerError("hand-clean")).toBeLessThan(0.001);
    // the new default pins them too — that is the whole point of 0.15
    expect(cornerError("classic")).toBeLessThan(0.001);
    // and the opt-in rough look is the one that overshoots
    expect(cornerError("classic-rough")).toBeGreaterThan(0.2);
  });
});

describe("the DSL surface", () => {
  it("accepts every documented attribute and alias", () => {
    const { scene } = compileEdd(`defaults {
      node { roughness: clean, pinCorners: true, singleStroke: true, jitter: 1, bowing: slight }
      edge { roughness: clean, pinCorners: yes }
    }
    scene { rect a "A"; rect b "B"; a --> b }`);
    const n = scene.nodes[0].style;
    expect([n.roughness, n.bowing, n.maxRandomnessOffset, n.preserveVertices, n.disableMultiStroke]).toEqual([0.35, 0.35, 1, true, true]);
    const e = scene.edges[0].style;
    expect([e.roughness, e.preserveVertices]).toEqual([0.35, true]);
  });

  it("accepts the long-form names too", () => {
    const { scene } = compileEdd(`defaults { node { bowing: 0.5, maxRandomnessOffset: 3, preserveVertices: on, disableMultiStroke: off } }
    scene { rect a "A" }`);
    const n = scene.nodes[0].style;
    expect([n.bowing, n.maxRandomnessOffset, n.preserveVertices, n.disableMultiStroke]).toEqual([0.5, 3, true, false]);
  });

  it("`clean` sits between architect and artist on the roughness keyword scale", () => {
    const r = (kw: string) => compileEdd(`scene { rect a { roughness: ${kw} } }`).scene.nodes[0].style.roughness;
    expect(r("architect")).toBe(0);
    expect(r("clean")).toBe(0.35);
    expect(r("artist")).toBe(1);
    expect(r("cartoonist")).toBe(2);
  });

  it("a `defaults { node { … } }` declaration reaches viz, group frames and annotations", () => {
    const src = `defaults { node { roughness: clean, pinCorners: true, singleStroke: true } }\n${PLAIN}\nviz bar v "R" { item "Q1" 12 }`;
    const { scene } = compileEdd(src);
    // the declaration supplies roughness/pin/single-stroke; bowing and jitter
    // fall through from `classic`, which now declares them
    expect(scene.meta.rough).toEqual({
      roughness: 0.35, bowing: 0.4, maxRandomnessOffset: 1, preserveVertices: true, disableMultiStroke: true,
    });
    expect(scene.nodes.find((n) => n.id.startsWith("v."))!.style.preserveVertices).toBe(true);

    // The frame and the marks visibly simplify — measured against `classic-rough`,
    // not against "undeclared". Since 0.15 the default is already smooth, so
    // declaring `clean` on top of it changes almost nothing; the thing worth
    // proving is that the declaration REACHES group frames and annotations at
    // all, which used to hardcode `roughness: 0.8, seed: 42` and `bowing: 3`.
    const declared = mount(src);
    const rough = mount(`meta { style: classic-rough }\n${PLAIN}\nviz bar v "R" { item "Q1" 12 }`);
    const len = (r: SvgRenderer, sel: string) => (r.world.querySelector(sel)?.getAttribute("d") ?? "").length;
    expect(len(declared.renderer, "[data-group] path")).toBeLessThan(len(rough.renderer, "[data-group] path"));
    expect(len(declared.renderer, "[data-annotation] path")).toBeLessThan(len(rough.renderer, "[data-annotation] path"));
  });

  it("an INLINE attribute stays on its node and never becomes diagram-wide", () => {
    // `preserveVertices` no longer distinguishes anything (the default preset
    // sets it), so assert on a value nothing else supplies.
    const { scene } = compileEdd(`scene { rect a "A" { bowing: 3, jitter: 7 }; rect b "B" }`);
    expect([scene.nodes[0].style.bowing, scene.nodes[0].style.maxRandomnessOffset]).toEqual([3, 7]);
    // b keeps the preset's values, untouched by a's inline attributes
    expect([scene.nodes[1].style.bowing, scene.nodes[1].style.maxRandomnessOffset]).toEqual([0.4, 1]);
    // and nothing was declared diagram-wide, so meta.rough is the preset's own
    expect(scene.meta.rough).toEqual({
      roughness: 0.45, bowing: 0.4, maxRandomnessOffset: 1, preserveVertices: true, disableMultiStroke: true,
    });
  });
});

describe("SvgRenderer.setRoughnessScale", () => {
  const LINE = `scene { rect a "A"; rect b "B"; a --> b }`;

  it("shrinks world-space jitter by k and repaints", () => {
    const { renderer } = mount(LINE);
    const before = paths(renderer);
    renderer.setRoughnessScale(0.25);
    expect(renderer.getRoughnessScale()).toBe(0.25);
    expect(paths(renderer)).not.toBe(before);

    // the drawn stroke hugs its ideal line ~4x more closely
    const spread = (r: SvgRenderer) => {
      const el = r.world.querySelector('[data-node="a"] path')!;
      const node = (r as unknown as { getScene(): Scene }).getScene()!.nodes[0];
      return verticalSpread(el.getAttribute("d")!, node.y);
    };
    const tight = spread(renderer);
    renderer.setRoughnessScale(1);
    const loose = spread(renderer);
    expect(tight).toBeLessThan(loose);
  });

  it("is a no-op for a repeated value, so a quantised host may call it every frame", () => {
    const { renderer } = mount(LINE);
    renderer.setRoughnessScale(0.5);
    const after = paths(renderer);
    renderer.setRoughnessScale(0.5);
    expect(paths(renderer)).toBe(after);
  });

  it("reaches every subsystem — nodes, edges, viz elements, group frames and marks", () => {
    const { renderer } = mount(`${PLAIN}\nviz bar v "R" { item "Q1" 12; item "Q2" 19 }`);
    const sel = ["[data-node]", "[data-edge]", '[data-viz-item] path, [data-node^="v."] path', "[data-group] path", "[data-annotation] path"];
    const snap = () => sel.map((q) => [...renderer.world.querySelectorAll(q)].map((el) => el.getAttribute("d") ?? el.innerHTML).join(""));
    const before = snap();
    renderer.setRoughnessScale(0.25);
    const after = snap();
    sel.forEach((q, i) => {
      expect(before[i].length, `${q} produced nothing to compare`).toBeGreaterThan(0);
      expect(after[i], q).not.toBe(before[i]);
    });
  });

  it("restores the original drawing when scaled back to 1", () => {
    const { renderer } = mount(LINE);
    const original = paths(renderer);
    renderer.setRoughnessScale(0.25);
    renderer.setRoughnessScale(1);
    expect(paths(renderer)).toBe(original);
  });

  it("ignores a nonsensical scale rather than blanking the diagram", () => {
    const { renderer } = mount(LINE);
    const original = paths(renderer);
    renderer.setRoughnessScale(0);
    renderer.setRoughnessScale(Number.NaN);
    renderer.setRoughnessScale(-2);
    expect(renderer.getRoughnessScale()).toBe(1);
    expect(paths(renderer)).toBe(original);
  });
});

describe("SvgRendererOptions.nonScalingStroke", () => {
  it("stamps vector-effect on nodes, edges, group frames and annotation marks", () => {
    const { renderer } = mount(PLAIN, { nonScalingStroke: true });
    expect(renderer.nonScalingStroke).toBe(true);
    for (const sel of ["[data-node]", "[data-edge]", "[data-group]", "[data-annotation]"]) {
      const drawables = renderer.world.querySelectorAll(`${sel} path, ${sel} line, ${sel} polyline, ${sel} polygon, ${sel} ellipse, ${sel} rect`);
      expect(drawables.length, sel).toBeGreaterThan(0);
      drawables.forEach((el) => expect(el.getAttribute("vector-effect"), `${sel} ${el.tagName}`).toBe("non-scaling-stroke"));
    }
  });

  it("changes no geometry — only how the stroke reacts to the camera", () => {
    const plain = mount(PLAIN);
    const pinned = mount(PLAIN, { nonScalingStroke: true });
    expect(paths(pinned.renderer)).toBe(paths(plain.renderer));
  });
});
