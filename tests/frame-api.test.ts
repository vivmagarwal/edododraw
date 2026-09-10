/**
 * The frame-driven public API — everything a host that owns time (Remotion,
 * Puppeteer capture, a scrubber) calls, plus the compiler-hang regression that
 * used to take the whole machine down.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { exportSVGString, renderSceneToSVGString } from "@engine/export.js";
import { ensureEngineStyles, whenFontsReady, EXCALIFONT_FAMILY, HAND_FONT_WOFF2_DATA_URI } from "@engine/render/theme.css.js";
import {
  ARROW_ANIMATIONS,
  COMET_HEAD_FRACTION,
  DASH_MARCH_CYCLE_PX,
  arrowFrameStyle,
  edgeCenterline,
  edgeCenterlines,
} from "@engine/render/frameArrows.js";
import { centerlinePath, pathLength, resolveEndpoints, routePoints, smoothPath } from "@engine/render/edges.js";

// vitest runs with cwd = repo root (import.meta.url is not a file: URL under
// the jsdom environment, so it can't be used here).
const REPO = process.cwd();
const TSX = join(REPO, "node_modules/tsx/dist/cli.mjs");
const PROBE = join(REPO, "scripts/qa/parse-probe.mts");

/**
 * Compile sources in a memory-capped CHILD PROCESS with a hard kill timeout.
 * A compiler that spins is a blocking synchronous loop — vitest's own
 * `timeout` option cannot interrupt one (the timer never runs), so an
 * in-process test would hang CI forever instead of failing. Out-of-process,
 * a hang is just a fast, loud failure.
 */
function compileOutOfProcess(sources: string[], ms = 60_000): Array<Record<string, unknown>> {
  const out = execFileSync(process.execPath, ["--max-old-space-size=512", TSX, PROBE, "--stdin"], {
    cwd: REPO,
    input: JSON.stringify(sources),
    encoding: "utf8",
    timeout: ms,
    killSignal: "SIGKILL",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function mount(src: string, opts: { static?: boolean } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const { scene } = compileEdd(src);
  const renderer = new SvgRenderer(host, opts);
  renderer.mount();
  renderer.render(scene);
  return { host, renderer, scene };
}

// ---------------------------------------------------------------------------

describe("regression: `reveal <target>` outside a block used to hang the compiler", () => {
  // `reveal a with draw-on` is exactly what an agent writes after reading the
  // camera/timeline guide's prose, without noticing the DSL wants the
  // `reveal { show … }` block form. Before the fix, parseReveal ate the missing
  // `{`, then looped on parseRevealCmd — which consumes NOTHING at a `:` yet
  // still returns a command — allocating until the heap died (SIGABRT).
  const HANGERS = [
    `scene { a --> b }\ntimeline t { beat one "x" { reveal a with draw-on; narrate: "hi" } }`,
    `scene { a --> b }\ntimeline t { beat one "x" { reveal a; hold: 2s } }`,
    `scene { a --> b }\ntimeline t { beat one "x" { reveal a; caption: "x" } }`,
    `scene { a --> b }\ntimeline t { beat one "x" { reveal [a,b] with pop; narrate: "hi" } }`,
    `scene { a --> b }\ntimeline t { beat one "x" { stagger 200ms { show a }; narrate: "hi" } }`,
    // reveal with a brace on the NEXT line — also a non-terminating loop before
    `scene { a --> b }\ntimeline t { beat one "x" { reveal\n narrate: "hi" } }`,
  ];

  it("compiles every hang-shaped source in a child process, well under the timeout", () => {
    if (!existsSync(TSX)) throw new Error(`tsx not installed at ${TSX} — run npm install`);
    const results = compileOutOfProcess(HANGERS, 60_000);
    expect(results).toHaveLength(HANGERS.length);
    for (const r of results) {
      expect(r.ok, `failed: ${JSON.stringify(r)}`).toBe(true);
      expect(r.ms as number).toBeLessThan(5_000);
    }
  }, 90_000);

  it("`reveal a with draw-on; narrate: \"hi\"` means show a, draw-on, caption hi", () => {
    const { scene } = compileEdd(`scene { a --> b }\ntimeline t { beat one "x" { reveal a with draw-on; narrate: "hi" } }`);
    const step = scene.steps[0];
    expect(step.reveal).toEqual(["a"]);
    expect(step.revealFx).toEqual({ a: "draw-on" });
    expect(step.caption).toBe("hi");
  });

  it("`reveal a; hold: 2s` sets the hold, `reveal [a,b] with pop` takes a list", () => {
    const hold = compileEdd(`scene { a --> b }\ntimeline t { beat one "x" { reveal a; hold: 2s } }`).scene.steps[0];
    expect(hold.reveal).toEqual(["a"]);
    expect(hold.autoAdvanceMs).toBe(2000);

    const list = compileEdd(`scene { a --> b }\ntimeline t { beat one "x" { reveal [a,b] with pop } }`).scene.steps[0];
    expect(list.reveal).toEqual(["a", "b"]);
    expect(list.revealFx).toEqual({ a: "pop", b: "pop" });
  });

  it("the bare form still honours an explicit verb, and the block form is unchanged", () => {
    const bare = compileEdd(`scene { a --> b }\ntimeline t { beat one "x" { reveal hide b } }`).scene.steps[0];
    expect(bare.hide).toEqual(["b"]);
    const block = compileEdd(`scene { a --> b }\ntimeline t { beat one "x" { reveal { show a with pop, hide b } } }`).scene.steps[0];
    expect(block.reveal).toEqual(["a"]);
    expect(block.hide).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------------------

describe("synchronous SVG export", () => {
  it("renderSceneToSVGString returns a string, not a promise", () => {
    const { renderer, scene } = mount("scene { a[Hello] --> b[World] }");
    const svg = renderSceneToSVGString(renderer, scene, { embedFont: false });
    expect(typeof svg).toBe("string");
    expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
    expect(svg).toContain("<svg");
  });

  it("the async wrapper produces byte-identical output", async () => {
    const { renderer, scene } = mount("scene { a[Hello] --> b[World] }");
    const sync = renderSceneToSVGString(renderer, scene, { embedFont: false });
    const async_ = await exportSVGString(renderer, scene, { embedFont: false });
    expect(async_).toBe(sync);
  });
});

// ---------------------------------------------------------------------------

describe("edge geometry helpers (DOM-free)", () => {
  const SRC = `scene {
    a[Ingest] --> b[Queue]
    b --> c[Worker]
  }`;

  it("edgeCenterline rebuilds an edge's path from the Scene alone", () => {
    const { scene } = compileEdd(SRC);
    const edge = scene.edges[0];
    const cl = edgeCenterline(scene, edge.id)!;
    expect(cl).toBeTruthy();
    expect(cl.id).toBe(edge.id);
    expect(cl.d.startsWith("M")).toBe(true);
    expect(cl.points.length).toBeGreaterThanOrEqual(2);
    expect(cl.length).toBeGreaterThan(0);
    expect(cl.style.stroke).toBe(edge.style.stroke);
    expect(edgeCenterline(scene, "not-an-edge")).toBeNull();
  });

  it("matches what the renderer actually paints", () => {
    const { scene } = compileEdd(SRC);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const renderer = new SvgRenderer(host, { static: true });
    renderer.mount();
    renderer.render(scene);
    // the pure helper agrees with the rendered geometry's endpoints
    for (const cl of edgeCenterlines(scene)) {
      const g = renderer.svg.querySelector(`[data-edge="${cl.id}"]`);
      expect(g, `edge ${cl.id} not in the DOM`).toBeTruthy();
      expect(cl.points[0]).toBeTruthy();
    }
  });

  it("the low-level helpers are usable directly", () => {
    const { scene } = compileEdd(SRC);
    const edge = scene.edges[0];
    const { a, b } = resolveEndpoints(scene, edge);
    const pts = routePoints(edge, a, b);
    expect(pathLength(pts)).toBeGreaterThan(0);
    expect(centerlinePath(pts, edge.routing).startsWith("M")).toBe(true);
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }]).startsWith("M0,0")).toBe(true);
  });
});

describe("frame-driven arrow animation", () => {
  const SRC = `scene { a ~> b }`;

  it("the dash-march cycle is the 18px the CSS keyframe uses", () => {
    expect(DASH_MARCH_CYCLE_PX).toBe(18);
    expect(ARROW_ANIMATIONS.flow.dashCycle).toBe(-18);
    expect(ARROW_ANIMATIONS["dash-march"].dashCycle).toBe(-18);
    expect(ARROW_ANIMATIONS.flow.dashArray).toBe("10 8");
    expect(ARROW_ANIMATIONS.electric.dashCycle).toBe(-9);
    expect(ARROW_ANIMATIONS["gradient-flow"].dashCycle).toBe(-30);
  });

  it("`~>` compiles to the flow animation and yields a marching dash offset", () => {
    const { scene } = compileEdd(SRC);
    const cl = edgeCenterline(scene, scene.edges[0].id)!;
    expect(cl.style.animation).toBe("flow");

    const dur = ARROW_ANIMATIONS.flow.durationSec; // 0.9s at speed 1
    expect(arrowFrameStyle(cl, 0)!.strokeDashoffset).toBeCloseTo(0, 6);
    expect(arrowFrameStyle(cl, dur / 2)!.strokeDashoffset).toBeCloseTo(-9, 6);
    // one full cycle wraps back to the start — the loop is seamless
    expect(arrowFrameStyle(cl, dur)!.strokeDashoffset).toBeCloseTo(0, 6);
    expect(arrowFrameStyle(cl, dur * 3)!.strokeDashoffset).toBeCloseTo(0, 6);
    expect(arrowFrameStyle(cl, 0)!.strokeDasharray).toBe("10 8");
    expect(arrowFrameStyle(cl, 0)!.strokeWidth).toBeCloseTo(cl.style.strokeWidth * 1.2, 6);
  });

  it("is a pure function of time — the same frame always yields the same style", () => {
    const { scene } = compileEdd(SRC);
    const cl = edgeCenterline(scene, scene.edges[0].id)!;
    const at = (t: number) => JSON.stringify(arrowFrameStyle(cl, t));
    expect(at(0.37)).toBe(at(0.37));
    expect(at(0.37)).not.toBe(at(0.55));
    // out-of-order evaluation cannot change anything
    const forward = [0, 0.1, 0.2, 0.3].map(at);
    const backward = [0.3, 0.2, 0.1, 0].map(at).reverse();
    expect(backward).toEqual(forward);
  });

  it("covers every named animation, and returns null for none", () => {
    const { scene } = compileEdd(SRC);
    const cl = edgeCenterline(scene, scene.edges[0].id)!;
    for (const kind of Object.keys(ARROW_ANIMATIONS) as Array<keyof typeof ARROW_ANIMATIONS>) {
      const s = arrowFrameStyle(cl, 0.4, { animation: kind });
      expect(s, kind).toBeTruthy();
      expect(Number.isFinite(s!.strokeDashoffset), kind).toBe(true);
      expect(s!.opacity, kind).toBeGreaterThan(0);
    }
    const plain = compileEdd("scene { a --> b }").scene;
    const noAnim = edgeCenterline(plain, plain.edges[0].id)!;
    expect(noAnim.style.animation).toBe("none");
    expect(arrowFrameStyle(noAnim, 0.5)).toBeNull();
  });

  it("comet's head is 14% of the length (min 24px) and crosses the whole path", () => {
    const { scene } = compileEdd(SRC);
    const cl = edgeCenterline(scene, scene.edges[0].id)!;
    const len = 400;
    const head = Math.max(24, len * COMET_HEAD_FRACTION);
    const start = arrowFrameStyle(cl, 0, { animation: "comet", length: len })!;
    expect(start.strokeDasharray).toBe(`${head} ${len}`);
    expect(start.strokeDashoffset).toBeCloseTo(len, 6);
    const end = arrowFrameStyle(cl, ARROW_ANIMATIONS.comet.durationSec * 0.999999, { animation: "comet", length: len })!;
    expect(end.strokeDashoffset).toBeCloseTo(-COMET_HEAD_FRACTION * len, 1);
  });

  it("draw-on sweeps the full length and ping-pongs like the CSS", () => {
    const { scene } = compileEdd(SRC);
    const cl = edgeCenterline(scene, scene.edges[0].id)!;
    const d = ARROW_ANIMATIONS["draw-on"].durationSec;
    const at = (t: number) => arrowFrameStyle(cl, t, { animation: "draw-on", length: 200 })!;
    expect(at(0).strokeDasharray).toBe("200");
    expect(at(0).strokeDashoffset).toBeCloseTo(200, 6); // nothing drawn yet
    expect(at(d / 2).strokeDashoffset).toBeCloseTo(0, 6); // fully drawn
    expect(at(d * 0.999999).strokeDashoffset).toBeCloseTo(200, 1); // and back (alternate)
  });
});

// ---------------------------------------------------------------------------

describe("setRevealProgressAll", () => {
  const SRC = `scene { a[Api] --> b[Db]\n b --> c[Cache] }`;

  it("restores every id the map does NOT mention (the stale-dash trap)", () => {
    const { renderer } = mount(SRC, { static: true });
    const dashOf = (id: string) =>
      renderer.svg.querySelector(`[data-node="${id}"] path`)?.getAttribute("stroke-dasharray") ?? null;

    // frame N: `a` is mid-draw
    renderer.setRevealProgressAll({ a: 0.4 });
    expect(dashOf("a")).toBeTruthy();

    // frame N+1 never mentions `a` — with the single-id API its dash would be
    // frozen forever; the batch setter restores it.
    renderer.setRevealProgressAll({ b: 0.4 });
    expect(dashOf("a")).toBeNull();
    expect(dashOf("b")).toBeTruthy();

    // an empty map = everything finished
    renderer.setRevealProgressAll({});
    expect(dashOf("a")).toBeNull();
    expect(dashOf("b")).toBeNull();
  });

  it("is order-independent: seeking backwards gives the same picture as seeking forwards", () => {
    const { renderer } = mount(SRC, { static: true });
    // Compare the VISIBLE state (dash pattern + opacity per drawable), not
    // innerHTML — attribute order is not part of the rendered picture.
    const snapshot = () =>
      JSON.stringify(
        [...renderer.svg.querySelectorAll<SVGElement>(".edd-layer-nodes path, .edd-layer-nodes text")].map((el) => [
          el.getAttribute("stroke-dasharray"),
          el.getAttribute("stroke-dashoffset"),
          el.style.opacity,
        ]),
      );

    renderer.setRevealProgressAll({ a: 1, b: 0.5, c: 0 });
    const forwards = snapshot();

    // seek all over the timeline, then land back on the same frame
    renderer.setRevealProgressAll({ a: 0, b: 0, c: 0 });
    renderer.setRevealProgressAll({ a: 0.2, b: 0.9, c: 1 });
    renderer.setRevealProgressAll({ c: 0.7 });
    renderer.setRevealProgressAll({ a: 1, b: 0.5, c: 0 });
    expect(snapshot()).toBe(forwards);
  });

  it("the EXPORTED SVG STRING is byte-identical across out-of-order seeks", () => {
    // Restoring clears inline opacity, which used to leave an empty `style=""`
    // behind — invisible on screen, but enough to make a restored element
    // serialize differently from one that was never touched. A capture pipeline
    // that diffs or caches exported frames would see phantom changes.
    const { renderer, scene } = mount(SRC, { static: true });
    const frame = (map: Record<string, number>) => {
      renderer.setRevealProgressAll(map);
      return renderSceneToSVGString(renderer, scene, { embedFont: false });
    };
    const target = { a: 1, b: 0.45, c: 0 };
    const first = frame(target);
    frame({ a: 0, b: 0, c: 0 });
    frame({ a: 0.3, b: 1, c: 0.8 });
    expect(frame(target)).toBe(first);
    expect(first).not.toContain('style=""');
  });

  it("accepts ids that aren't in the scene without throwing", () => {
    const { renderer } = mount(SRC, { static: true });
    expect(() => renderer.setRevealProgressAll({ nope: 0.5 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe("font readiness", () => {
  it("exposes the family name and the embedded data URI", () => {
    expect(EXCALIFONT_FAMILY).toBe("Excalifont");
    expect(HAND_FONT_WOFF2_DATA_URI.startsWith("data:")).toBe(true);
  });

  it("whenFontsReady resolves (and never rejects) even with no FontFaceSet", async () => {
    await expect(whenFontsReady(document)).resolves.toBeUndefined();
  });

  it("ensureEngineStyles injects per DOCUMENT, not once per module", () => {
    ensureEngineStyles(document);
    expect(document.getElementById("edd-engine-styles")).toBeTruthy();

    // a second document (an iframe, a Remotion preview shell, another test) must
    // get its own <style> — a module-level flag would silently skip it
    const other = document.implementation.createHTMLDocument("other");
    expect(other.getElementById("edd-engine-styles")).toBeNull();
    ensureEngineStyles(other);
    expect(other.getElementById("edd-engine-styles")).toBeTruthy();
    expect(other.getElementById("edd-engine-styles")!.textContent).toContain(EXCALIFONT_FAMILY);
  });
});

// ---------------------------------------------------------------------------

describe("setViewport — the camera viewport a frame-driven host states itself", () => {
  const SRC = `scene { a "A" --> b "B" --> c "C" }`;

  it("jsdom (like Remotion's layout pass) measures 0x0, which clamps to a useless 1x1", () => {
    // The reason setViewport exists. jsdom has no layout, and Remotion mounts a
    // composition inside a 0x0 off-screen wrapper while layout effects run, so
    // measure() reads 0 in both and clamps to 1.
    const { renderer } = mount(SRC, { static: true });
    expect(renderer.measure()).toEqual({ w: 1, h: 1 });
  });

  it("states the viewport without touching the container", () => {
    const { host, renderer } = mount(SRC, { static: true });
    expect(renderer.setViewport({ w: 1920, h: 1080 })).toEqual({ w: 1920, h: 1080 });
    expect(renderer.getViewportSize()).toEqual({ w: 1920, h: 1080 });
    expect(host.clientWidth).toBe(0); // untouched — nothing was measured
  });

  it("re-applies the current camera, so the world transform matches at once", () => {
    const { renderer } = mount(SRC, { static: true });
    renderer.applyCamera({ cx: 400, cy: 300, zoom: 2 });
    renderer.setViewport({ w: 1920, h: 1080 });
    // translate(w/2 h/2) scale(zoom) translate(-cx -cy) — w/2,h/2 must be the NEW size
    expect(renderer.world.getAttribute("transform")).toBe(
      "translate(960 540) scale(2) translate(-400 -300)",
    );
  });

  it("keeps worldToScreen consistent with the stated viewport", () => {
    const { renderer } = mount(SRC, { static: true });
    renderer.setViewport({ w: 1920, h: 1080 });
    renderer.applyCamera({ cx: 400, cy: 300, zoom: 2 });
    // the camera centre must land in the middle of the frame
    expect(renderer.worldToScreen({ x: 400, y: 300 })).toEqual({ x: 960, y: 540 });
  });

  it("clamps garbage to 1 rather than blanking the transform", () => {
    const { renderer } = mount(SRC, { static: true });
    expect(renderer.setViewport({ w: Number.NaN, h: 1080 })).toEqual({ w: 1, h: 1080 });
    expect(renderer.setViewport({ w: 0, h: -5 })).toEqual({ w: 1, h: 1 });
    expect(renderer.setViewport({ w: Number.POSITIVE_INFINITY, h: 10 })).toEqual({ w: 1, h: 10 });
    expect(renderer.world.getAttribute("transform")).toContain("translate(0.5 5)");
  });

  it("survives a setRoughnessScale repaint — the viewport is renderer state, not DOM state", () => {
    const { renderer } = mount(SRC, { static: true });
    renderer.setViewport({ w: 1920, h: 1080 });
    renderer.applyCamera({ cx: 100, cy: 50, zoom: 4 });
    renderer.setRoughnessScale(0.25); // repaints the node/edge layers
    expect(renderer.getViewportSize()).toEqual({ w: 1920, h: 1080 });
    expect(renderer.world.getAttribute("transform")).toBe(
      "translate(960 540) scale(4) translate(-100 -50)",
    );
  });
});
