/**
 * Runtime extension points for package consumers: custom icons, annotation
 * kinds, arrow animations, layouts (all usable straight from DSL text), plus
 * programmatic viz composition (vizToScene) and facade runtime APIs.
 */
import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { AnnotationLayer } from "@engine/annotate/layer.js";
import {
  registerAnnotation,
  registerArrowAnimation,
  registerLayout,
} from "@engine/plugins/registry.js";
import { registerIcon, iconEntry, listIcons } from "@engine/viz/icons.js";
import { vizToScene, vizItem } from "@engine/viz/compose.js";
import "@engine/viz/generators/index.js";

function mount(src: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const { scene, diagnostics } = compileEdd(src);
  const renderer = new SvgRenderer(host);
  renderer.mount();
  renderer.render(scene);
  return { host, renderer, scene, diagnostics };
}

describe("registerIcon", () => {
  it("makes a custom glyph usable from viz items, aliases included", () => {
    registerIcon("zigzag-bolt", "M8 2 L16 12 L10 12 L16 22", { aliases: ["bolt2"] });
    expect(iconEntry("zigzag-bolt")?.d).toContain("M8 2");
    expect(iconEntry("BOLT2")?.d).toContain("M8 2"); // aliases, case-insensitive
    expect(listIcons()).toContain("zigzag-bolt");

    const { scene } = compileEdd(`viz list l { item "Fast" { icon: zigzag-bolt } }`);
    const icon = scene.nodes.find((n) => (n.data as { vizRole?: string })?.vizRole === "icon");
    expect(icon).toBeTruthy();
    expect((icon!.data as { d?: string }).d).toContain("M8 2");
  });

  it("honors a custom design viewBox", () => {
    registerIcon("big-ring", "M50 10 A40 40 0 1 1 49.9 10", { viewBox: 100 });
    expect(iconEntry("big-ring")?.viewBox).toBe(100);
    const { scene } = compileEdd(`viz list l { item "Ring" { icon: big-ring } }`);
    const icon = scene.nodes.find((n) => (n.data as { vizRole?: string })?.vizRole === "icon")!;
    expect((icon.data as { vw?: number }).vw).toBe(100);
  });
});

describe("registerAnnotation", () => {
  it("renders a custom kind from a scripted annotate block", () => {
    registerAnnotation("cross", (an, ctx) => {
      if (!ctx.box) return;
      const opts = { stroke: an.color || "#e03131", strokeWidth: 3, roughness: 1.5, seed: 33 };
      ctx.g.appendChild(ctx.rc.line(ctx.box.minX, ctx.box.minY, ctx.box.maxX, ctx.box.maxY, opts));
      ctx.g.appendChild(ctx.rc.line(ctx.box.minX, ctx.box.maxY, ctx.box.maxX, ctx.box.minY, opts));
      if (an.text) ctx.label(an.text, { x: ctx.box.minX, y: ctx.box.minY - 10 }, opts.stroke, "start");
    });

    const { renderer, scene, diagnostics } = mount(`scene { rect legacy "Old" }\nannotate { cross legacy "kill it" { color: red } }`);
    expect(scene.annotations[0]).toMatchObject({ kind: "cross", target: { ref: "legacy" } });
    expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    new AnnotationLayer(renderer).render(scene, scene.annotations, false);
    const g = renderer.svg.querySelector(".edd-layer-annotations [data-annotation]");
    expect(g).toBeTruthy();
    expect(g!.querySelectorAll("path, line").length).toBeGreaterThanOrEqual(2);
    expect(g!.textContent).toContain("kill it");
  });

  it("works as a bare command inside a timeline beat (parser gate)", () => {
    registerAnnotation("wobble", () => {});
    const { scene, diagnostics } = compileEdd(`scene { rect a }\ntimeline t { beat one "1" { wobble a "hi" } }`);
    expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    expect(scene.steps[0].annotations[0]).toMatchObject({ kind: "wobble", target: { ref: "a" } });
  });
});

describe("registerArrowAnimation", () => {
  it("passes the kind through the DSL and drives the overlay + injected CSS", () => {
    registerArrowAnimation("surge", {
      css: "@keyframes edd-surge { to { stroke-dashoffset: -18; } }\n.edd-anim-surge { animation-name: edd-surge; animation-iteration-count: infinite; }",
      apply(path, _edge, info) {
        path.setAttribute("stroke-dasharray", "4 14");
        path.style.animationDuration = `${0.7 / info.speed}s`;
      },
    });

    const { scene, renderer } = mount(`scene { a[A] -> b[B] { animation: surge { speed: 2 } } }`);
    expect(scene.edges[0].style.animation).toBe("surge"); // not remapped to "flow"
    const overlay = renderer.svg.querySelector(".edd-anim-surge") as SVGPathElement;
    expect(overlay).toBeTruthy();
    expect(overlay.getAttribute("stroke-dasharray")).toBe("4 14");
    expect(overlay.style.animationDuration).toBe("0.35s");
    expect(document.getElementById("edd-plugin-styles")?.textContent).toContain("edd-surge");
  });

  it("is suppressed in static mode like the built-ins", () => {
    registerArrowAnimation("surge2", { apply() {} });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { scene } = compileEdd(`scene { a[A] -> b[B] { animate: surge2 } }`);
    const renderer = new SvgRenderer(host, { static: true });
    renderer.mount();
    renderer.render(scene);
    expect(renderer.svg.querySelector(".edd-anim")).toBeNull();
  });
});

describe("registerLayout", () => {
  it("is reachable from the DSL by name and positions nodes", () => {
    registerLayout("diagonal", (_scene, movable) => {
      movable.forEach((n, i) => {
        n.x = i * 200;
        n.y = i * 120;
      });
    });
    const { scene, diagnostics } = compileEdd(`scene { layout diagonal\n rect a\n rect b\n rect c }`);
    expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    expect(scene.meta.layout).toBe("diagonal");
    const [a, b, c] = ["a", "b", "c"].map((id) => scene.nodes.find((n) => n.id === id)!);
    // relative geometry survives margin normalization
    expect(b.x - a.x).toBe(200);
    expect(c.y - b.y).toBe(120);
  });
});

describe("vizToScene (programmatic viz, no DSL)", () => {
  it("builds a render-ready scene from plain data", () => {
    const { scene, diagnostics } = vizToScene(
      {
        type: "funnel",
        id: "sales",
        title: "Pipeline",
        items: [vizItem("Leads", 1200), vizItem("Demos", 240), vizItem("Won", 36)],
      },
      { style: "chalkboard" },
    );
    expect(diagnostics.items.filter((d) => d.severity === "error")).toEqual([]);
    expect(scene.meta.style).toBe("chalkboard");
    expect(scene.meta.layout).toBe("manual");
    expect(scene.nodes.length).toBeGreaterThan(5);
    expect(scene.nodes.some((n) => n.label.includes("Leads"))).toBe(true);
    // item tagging works exactly like the DSL path
    expect(scene.nodes.some((n) => (n.data as { vizItem?: string })?.vizItem === "sales.won")).toBe(true);
  });

  it("stacks multiple blocks vertically and reports unknown types", () => {
    const two = vizToScene([
      { type: "list", id: "a", items: [vizItem("One"), vizItem("Two")] },
      { type: "not-a-template", id: "b", items: [] },
      { type: "list", id: "c", items: [vizItem("Three")] },
    ]);
    expect(two.diagnostics.items.some((d) => d.code === "E-VIZ-TYPE")).toBe(true);
    const aBottom = Math.max(...two.scene.nodes.filter((n) => n.id.startsWith("a.")).map((n) => n.y + n.h));
    const cTop = Math.min(...two.scene.nodes.filter((n) => n.id.startsWith("c.")).map((n) => n.y));
    expect(cTop).toBeGreaterThan(aBottom);
  });
});
