import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";
import { SvgRenderer } from "@engine/render/svgRenderer.js";
import { exportSVGString } from "@engine/export.js";

function mount(src: string, mode?: "light" | "dark") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const { scene } = compileEdd(src, mode ? { mode } : undefined);
  const renderer = new SvgRenderer(host);
  renderer.mount();
  renderer.render(scene);
  return { host, renderer, scene };
}

describe("on-screen background vs. export", () => {
  it("keeps the on-screen bg rect transparent and paints the container instead (so the grid shows)", () => {
    const { host, renderer } = mount("scene { rect a }");
    const bg = renderer.svg.querySelector(".edd-bg")!;
    expect(bg.getAttribute("fill")).toBe("transparent");
    // container carries the real background color so the dotted grid layers over it
    expect(host.style.backgroundColor).toBeTruthy();
  });

  it("dark mode paints a dark container background", () => {
    const { host } = mount("scene { rect a }", "dark");
    // #121212 -> jsdom normalizes to rgb(18, 18, 18)
    expect(host.style.backgroundColor.replace(/\s/g, "")).toBe("rgb(18,18,18)");
  });

  it("exported SVG re-fills a SOLID background (not the transparent on-screen rect)", async () => {
    const { renderer, scene } = mount("scene { rect a }");
    const svg = await exportSVGString(renderer, scene, { embedFont: false });
    // the export must carry a solid background matching the scene theme, never transparent
    expect(svg).toContain(scene.theme.background);
    const bgTag = svg.match(/<rect[^>]*class="edd-bg"[^>]*>/)?.[0] ?? "";
    expect(bgTag).not.toContain('fill="transparent"');
  });

  it("exported dark SVG carries the dark background", async () => {
    const { renderer, scene } = mount("scene { rect a }", "dark");
    const svg = await exportSVGString(renderer, scene, { embedFont: false });
    expect(svg).toContain("#121212");
  });
});
