/**
 * Paint the "figure" nodes — `character` (sketchnote person) and `icon` (line
 * glyph + caption). Their strokes are drawn INSIDE the node's own
 * <g data-node="…">, so visibility, reveal, annotations, camera focus and
 * setRevealProgress (which sweeps every stroke under the node group in DOM
 * order) all work with no special cases elsewhere in the renderer. The
 * character's strokes come from the character library as ordinary Scene IR
 * primitives; the icon is the library path scaled into the glyph square.
 */

import type rough from "roughjs";
import type { Scene, SceneNode } from "../scene/types.js";
import { effectivePreset } from "../style/presets.js";
import { characterInk } from "../viz/characters/draw.js";
import { emitCharacterNode } from "../viz/characterNode.js";
import { iconNodeGlyph } from "../viz/iconNode.js";
import { renderShapeBody } from "./shapes.js";

type RoughSVG = ReturnType<(typeof rough)["svg"]>;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Text painter supplied by the renderer (its own textBlock helper). */
export type TextPainter = (
  text: string,
  cx: number,
  cy: number,
  fontSize: number,
  color: string,
  family: SceneNode["style"]["fontFamily"],
  align?: SceneNode["style"]["textAlign"],
  weight?: number,
) => SVGTextElement;

export interface FigureRender {
  /** Figure body (+ any text marks the figure emits, e.g. a "?" fx). */
  body: SVGGElement;
  /** Vertical centre for the node label (inside the box, under the figure). */
  labelCy: number;
  /**
   * Ink for that caption. Figure nodes have NO filled body, so the caption sits
   * straight on the canvas — it cannot inherit the "text on top of this fill"
   * colour a filled shape gets (under `mono-accent` that is white, i.e.
   * invisible). Derived from the preset like the figure's own ink.
   */
  labelColor: string;
}

/**
 * Draw the figure for `node` and return the body group. The caller appends
 * the node label at `labelCy` (centred) like any other node.
 */
export function renderCharacterNode(rc: RoughSVG, scene: Scene, node: SceneNode, doc: Document, paintText: TextPainter): FigureRender {
  const preset = effectivePreset(scene.meta.style, scene.theme.mode);
  const emitted = emitCharacterNode(node, preset, scene.theme.mode);
  const body = doc.createElementNS(SVG_NS, "g") as SVGGElement;
  body.setAttribute("class", "edd-character");
  const parts = [...emitted.nodes].sort((a, b) => a.z - b.z);
  for (const part of parts) {
    try {
      if (part.shape === "text") {
        if (!part.label) continue;
        const align = part.style.textAlign;
        const cx = align === "left" ? part.x : align === "right" ? part.x + part.w : part.x + part.w / 2;
        const t = paintText(part.label, cx, part.y + part.h / 2, part.style.fontSize, part.style.textColor, part.style.fontFamily, align, part.style.fontWeight);
        if (part.style.opacity < 100) t.style.opacity = String(part.style.opacity / 100);
        body.appendChild(t);
        continue;
      }
      const g = renderShapeBody(rc, part.shape, { x: part.x, y: part.y, w: part.w, h: part.h }, part.style, part.data);
      body.appendChild(g);
    } catch (err) {
      // one bad stroke must never blank the figure
      console.warn("character part render failed", node.id, part.id, err);
    }
  }
  const labelCy = node.y + node.h - emitted.labelH / 2;
  return { body, labelCy, labelColor: characterInk(node.style.textColor, preset) };
}

/**
 * Draw the glyph for an `icon` node (stroke = node ink, no fill — sketched by
 * rough.js like every icon in the viz templates) and return the body group;
 * the caller appends the caption at `labelCy`.
 */
export function renderIconNode(rc: RoughSVG, scene: Scene, node: SceneNode, doc: Document): FigureRender {
  const preset = effectivePreset(scene.meta.style, scene.theme.mode);
  const body = doc.createElementNS(SVG_NS, "g") as SVGGElement;
  body.setAttribute("class", "edd-icon");
  const glyph = iconNodeGlyph(node);
  if (glyph.d) {
    // same stroke policy as VizContext.icon(): the path group is scaled by
    // size/viewBox, so specify the stroke in design units for ~2px on screen
    const visual = Math.min(3, Math.max(1.8, glyph.size / 18));
    const style = {
      ...node.style,
      // line art on the canvas — same visibility guard as a character's ink
      stroke: characterInk(node.style.stroke, preset),
      fill: null,
      fillStyle: "none" as const,
      strokeWidth: (node.style.strokeWidth > 2 ? Math.min(3.2, node.style.strokeWidth) : visual) * (glyph.viewBox / glyph.size),
      roughness: Math.min(0.8, node.style.roughness),
    };
    body.appendChild(renderShapeBody(rc, "path", { x: glyph.x, y: glyph.y, w: glyph.size, h: glyph.size }, style, { d: glyph.d, vw: glyph.viewBox, vh: glyph.viewBox }));
  }
  return { body, labelCy: node.y + node.h - glyph.labelH / 2, labelColor: characterInk(node.style.textColor, preset) };
}
