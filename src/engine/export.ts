/**
 * Export helpers: turn the live diagram into a self-contained SVG (with the
 * hand-drawn font embedded as base64 so it renders anywhere), a PNG raster, the
 * raw scene JSON, or the source code. All framing uses the scene's content
 * bbox, independent of the current camera.
 */

import { bboxToRect, expandBBox } from "./geometry.js";
import { sceneBBox } from "./scene/query.js";
import type { Scene } from "./scene/types.js";
import { HAND_FONT_WOFF2_DATA_URI } from "./render/fontData.js";
import type { SvgRenderer } from "./render/svgRenderer.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The hand-drawn font as an @font-face rule (embedded, no fetch). */
function embeddedFontCss(): string {
  const src = `url(${HAND_FONT_WOFF2_DATA_URI}) format("woff2")`;
  return `
@font-face { font-family: "Excalifont"; src: ${src}; }
@font-face { font-family: "Virgil"; src: ${src}; }`;
}

export interface ExportOptions {
  padding?: number;
  embedFont?: boolean;
  scale?: number; // PNG only
  background?: string | null;
}

/** Build a standalone SVG string of the whole scene at content coordinates. */
export async function exportSVGString(renderer: SvgRenderer, scene: Scene, opts: ExportOptions = {}): Promise<string> {
  const padding = opts.padding ?? 40;
  const box = expandBBox(sceneBBox(scene), padding);
  const rect = bboxToRect(Number.isFinite(box.minX) ? box : { minX: 0, minY: 0, maxX: 400, maxY: 300 });

  const clone = renderer.svg.cloneNode(true) as SVGSVGElement;
  // reset camera + drop screen-space overlays / live layer selection artifacts
  clone.querySelector(".edd-world")?.removeAttribute("transform");
  clone.querySelector(".edd-layer-screen")?.remove();
  clone.querySelectorAll(".edd-hidden").forEach((el) => el.remove());
  clone.setAttribute("viewBox", `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
  clone.setAttribute("width", String(rect.w));
  clone.setAttribute("height", String(rect.h));
  clone.style.removeProperty("position");
  clone.style.removeProperty("inset");
  clone.style.width = "";
  clone.style.height = "";

  // background rect: cover the viewBox
  const bg = clone.querySelector(".edd-bg") as SVGRectElement | null;
  const bgColor = opts.background === undefined ? scene.meta.background || scene.theme.background : opts.background;
  if (bg) {
    if (bgColor) {
      bg.setAttribute("x", String(rect.x));
      bg.setAttribute("y", String(rect.y));
      bg.setAttribute("width", String(rect.w));
      bg.setAttribute("height", String(rect.h));
      bg.setAttribute("fill", bgColor);
    } else {
      bg.remove();
    }
  }

  // embed font
  if (opts.embedFont !== false) {
    const css = embeddedFontCss();
    if (css) {
      const style = document.createElementNS(SVG_NS, "style");
      style.textContent = css;
      clone.insertBefore(style, clone.firstChild);
    }
  }

  clone.setAttribute("xmlns", SVG_NS);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export async function exportPNGBlob(renderer: SvgRenderer, scene: Scene, opts: ExportOptions = {}): Promise<Blob> {
  const scale = opts.scale ?? 2;
  const svg = await exportSVGString(renderer, scene, { ...opts, background: opts.background === undefined ? scene.theme.background : opts.background });
  const box = expandBBox(sceneBBox(scene), opts.padding ?? 40);
  const rect = bboxToRect(Number.isFinite(box.minX) ? box : { minX: 0, minY: 0, maxX: 400, maxY: 300 });

  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(blobUrl);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.w * scale));
    canvas.height = Math.max(1, Math.round(rect.h * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function download(filename: string, data: Blob | string, type = "text/plain"): void {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSVG(renderer: SvgRenderer, scene: Scene): Promise<void> {
  const svg = await exportSVGString(renderer, scene);
  download(`${slug(scene)}.svg`, svg, "image/svg+xml");
}

export async function downloadPNG(renderer: SvgRenderer, scene: Scene): Promise<void> {
  const blob = await exportPNGBlob(renderer, scene);
  download(`${slug(scene)}.png`, blob);
}

export function downloadJSON(scene: Scene): void {
  download(`${slug(scene)}.json`, JSON.stringify(scene, null, 2), "application/json");
}

function slug(scene: Scene): string {
  return (scene.meta.title ?? "edododraw").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "edododraw";
}
