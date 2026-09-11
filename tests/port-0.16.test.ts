/**
 * 0.16.0 — engine improvements brought back from a downstream fork:
 * `viz … { at: (x, y) }` pins a block, `setNodeAttrs` upserts any attribute,
 * rendering/exporting never touches the global `document`, and the Mermaid
 * parser can be registered instead of dynamically imported.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { setNodeAttrs } from "@engine/dsl/patch.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { renderSceneToSVGString } from "@engine/export.js";
import { convertMermaid, registerMermaidParser } from "@engine/import/mermaid.js";

const errorsOf = (src: string) => compileEdd(src).diagnostics.items.filter((d) => d.severity === "error");

describe("viz block `at: (x, y)`", () => {
  const funnel = (at?: string) => `scene {\n  rect a "A"\n}\n\nviz funnel sales "Sales" {\n${at ? `  at: ${at}\n` : ""}  item "Leads" 100\n  item "Won" 10\n}\n`;
  const bounds = (src: string) => {
    const nodes = compileEdd(src).scene.nodes.filter((n) => n.id.startsWith("sales"));
    return { x: Math.min(...nodes.map((n) => n.x)), y: Math.min(...nodes.map((n) => n.y)) };
  };

  it("pins the block's top-left at (x, y) instead of stacking it below the scene", () => {
    expect(bounds(funnel("(500, -300)"))).toEqual({ x: 500, y: -300 });
    const stacked = bounds(funnel());
    expect(stacked.x).toBe(40);
    expect(stacked.y).toBeGreaterThan(0);
  });

  it("a later unpinned block stacks below the lower of the cursor and the pinned block", () => {
    const src = `viz funnel one "One" {\n  at: (0, 1000)\n  item "A" 10\n  item "B" 5\n}\n\nviz funnel two "Two" {\n  item "C" 10\n  item "D" 5\n}\n`;
    const { scene } = compileEdd(src);
    const oneBottom = Math.max(...scene.nodes.filter((n) => n.id.startsWith("one")).map((n) => n.y + n.h));
    const twoTop = Math.min(...scene.nodes.filter((n) => n.id.startsWith("two")).map((n) => n.y));
    expect(twoTop).toBeGreaterThan(oneBottom);
  });

  it("a malformed `at` warns and falls back to stacking", () => {
    const { diagnostics } = compileEdd(funnel("400"));
    expect(diagnostics.items.map((d) => d.code)).toContain("W-VIZ-AT");
    expect(bounds(funnel("400")).x).toBe(40);
  });
});

describe("dsl/patch setNodeAttrs", () => {
  const SRC = `scene {\n  layout manual\n  character brad "Brad" { pose: thinking, hair: short, at: (0, 0), pin: true }\n  rect idea "The idea" { at: (400, 0), pin: true }\n  brad --> idea\n}\n`;
  const character = (src: string) => (compileEdd(src).scene.nodes.find((n) => n.id === "brad")!.data as { character: Record<string, unknown> }).character;

  it("changes a character's attributes in place and the compiled figure follows", () => {
    const next = setNodeAttrs(SRC, "brad", { pose: "waving", emotion: "happy", height: 260, flip: true });
    expect(next).toContain("pose: waving");
    expect(next).toContain("height: 260");
    expect(errorsOf(next)).toEqual([]);
    const spec = character(next);
    expect(spec.pose).toBe("waving");
    expect(spec.emotion).toBe("happy");
    expect(spec.flip).toBe(true);
  });

  it("adds a block to a node that has none and quotes a value that is not a bare word", () => {
    const next = setNodeAttrs(SRC.replace(' { at: (400, 0), pin: true }', ""), "idea", { fill: "green", label: 'Say "hi"' });
    expect(next).toMatch(/rect idea "The idea" \{[^}]*fill: green/);
    expect(next).toContain('label: "Say \\"hi\\""');
    expect(errorsOf(next)).toEqual([]);
    expect(compileEdd(next).scene.nodes.find((n) => n.id === "idea")!.style.fill).toBeTruthy();
  });

  it("returns the source unchanged when there is nothing to set", () => {
    expect(setNodeAttrs(SRC, "brad", {})).toBe(SRC);
  });
});

describe("rendering never touches the global document", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders nodes, edges, plugins, arrows and annotations into a foreign document, and exports it", () => {
    const src = `scene {\n  layout dag\n  rect a "A"\n  star s "Star"\n  cloud c "Cloud"\n  a -> s { animation: flow }\n  a --> c { head: crow }\n  annotate { highlight a  circle s  note c "hello" }\n}\n\nviz balance "B" {\n  side "Left" { item "One" { icon: star } }\n  side "Right" { item "Two" }\n}\n`;
    const { scene, diagnostics } = compileEdd(src);
    expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);

    // a second, windowless document — as a server-side host would hand the renderer
    const foreign = document.implementation.createHTMLDocument("server");
    const host = foreign.createElement("div");
    foreign.body.appendChild(host);
    const createNS = vi.spyOn(document, "createElementNS");
    const create = vi.spyOn(document, "createElement");

    const renderer = new SvgRenderer(host);
    renderer.mount();
    renderer.render(scene);
    const out = renderSceneToSVGString(renderer, scene, { embedFont: false });

    expect(createNS).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(host.querySelectorAll("[data-node]").length).toBeGreaterThan(3);
    expect(host.querySelector('[data-edge]')).not.toBeNull();
    expect(out.startsWith("<?xml")).toBe(true);
    expect(out).toContain("<svg");
  });
});

describe("registerMermaidParser", () => {
  it("a registered parser is used instead of the optional peer import", async () => {
    const parse = vi.fn(async () => ({
      elements: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 40, label: { text: "Alpha" } },
        { id: "b", type: "rectangle", x: 0, y: 120, width: 100, height: 40, label: { text: "Beta" } },
        { type: "arrow", start: { id: "a" }, end: { id: "b" } },
      ],
    }));
    registerMermaidParser(parse);
    const frag = await convertMermaid("flowchart TD\n  a --> b");
    expect(parse).toHaveBeenCalledOnce();
    expect(frag.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["a", "b"]));
    expect(frag.edges.length).toBe(1);
  });
});

describe("render-time stroke knobs", () => {
  const SRC = `scene {\n  layout dag\n  rect a "A" { fill: blue }\n  ellipse b "B"\n  group g "Group" { rect c "C" }\n  a -> b\n  b --> c\n}\nannotate { circle a  underline b }\n`;
  const mount = (opts: ConstructorParameters<typeof SvgRenderer>[1] = {}) => {
    const { scene } = compileEdd(SRC);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const renderer = new SvgRenderer(host, opts);
    renderer.mount();
    renderer.render(scene);
    return renderer;
  };
  const widths = (r: SvgRenderer) => [...r.world.querySelectorAll("[stroke-width]")].map((el) => Number(el.getAttribute("stroke-width")));

  it("strokeScale multiplies every drawn stroke width — nodes, edges, frames, annotations — and 1 changes nothing", () => {
    const plain = mount();
    const same = mount({ strokeScale: 1 });
    expect(same.world.innerHTML).toBe(plain.world.innerHTML);
    const thick = mount({ strokeScale: 2 });
    const a = widths(plain);
    const b = widths(thick);
    expect(b.length).toBe(a.length);
    expect(a.length).toBeGreaterThan(10);
    b.forEach((w, i) => expect(w).toBeCloseTo(a[i] * 2, 2));
    // the annotation marks are included
    expect(thick.getLayer("annotations").querySelector("[data-edd-sw]")).not.toBeNull();
  });

  it("setStrokeScale repaints without compounding, and returns to the authored widths", () => {
    const r = mount();
    const base = widths(r);
    r.setStrokeScale(1.5);
    r.setStrokeScale(1.5);
    r.applyStrokePolicy(r.world);
    widths(r).forEach((w, i) => expect(w).toBeCloseTo(base[i] * 1.5, 2));
    expect(r.getStrokeScale()).toBe(1.5);
    r.setStrokeScale(1);
    expect(widths(r)).toEqual(base);
  });

  it("a reveal sweep on a non-scaling stroke uses the SCREEN length, so a zoomed dash never repeats", () => {
    const proto = window.SVGElement.prototype as unknown as Record<string, unknown>;
    const had = { len: proto.getTotalLength, ctm: proto.getCTM };
    proto.getTotalLength = () => 100;
    proto.getCTM = () => ({ a: 3, b: 0, c: 0, d: 3, e: 0, f: 0 });
    try {
      const dash = (r: SvgRenderer) => r.world.querySelector('[data-node="a"] path[stroke]:not([stroke="none"])')!.getAttribute("stroke-dasharray");
      const zoomed = mount({ nonScalingStroke: true });
      zoomed.setRevealProgress("a", 0.3);
      expect(dash(zoomed)).toBe("300");
      const scaling = mount();
      scaling.setRevealProgress("a", 0.3);
      expect(dash(scaling)).toBe("100");
      zoomed.setRevealProgress("a", 1);
      expect(zoomed.world.querySelector("[stroke-dashoffset]")).toBeNull();
    } finally {
      proto.getTotalLength = had.len;
      proto.getCTM = had.ctm;
    }
  });
});
