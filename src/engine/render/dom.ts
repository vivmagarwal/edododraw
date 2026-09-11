/**
 * The document a rough.js SVG renderer draws into. rough.js keeps its `svg`
 * field private in the typings, but every element it creates comes from that
 * svg's owner document — and so must ours: a server-side render into a jsdom
 * (or linkedom) document must never reach for a global `document`, which a
 * server process usually does not have (and React SSR keys client/server on).
 */
import type rough from "roughjs";

type RoughSVG = ReturnType<(typeof rough)["svg"]>;

export function docOf(rc: RoughSVG): Document {
  return (rc as unknown as { svg: SVGSVGElement }).svg.ownerDocument;
}
