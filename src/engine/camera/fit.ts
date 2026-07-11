/**
 * Pure camera math: compute the { cx, cy, zoom } that frames a bbox (or the
 * whole scene) inside a viewport with padding. Shared by fitAll/focus and the
 * animated CameraController (M3).
 */

import type { BBox, Size } from "../geometry.js";
import { bboxCenter, isEmptyBBox } from "../geometry.js";
import type { CameraTransform } from "../render/svgRenderer.js";

export interface FitOptions {
  /** Screen-space padding around the target, in px. */
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

/** Camera that frames `bbox` within `viewport`. */
export function cameraForBBox(bbox: BBox, viewport: Size, opts: FitOptions = {}): CameraTransform {
  const padding = opts.padding ?? 64;
  const minZoom = opts.minZoom ?? 0.05;
  const maxZoom = opts.maxZoom ?? 2.5;
  if (isEmptyBBox(bbox)) return { cx: 0, cy: 0, zoom: 1 };
  const w = Math.max(1, bbox.maxX - bbox.minX);
  const h = Math.max(1, bbox.maxY - bbox.minY);
  const c = bboxCenter(bbox);
  const availW = Math.max(1, viewport.w - padding * 2);
  const availH = Math.max(1, viewport.h - padding * 2);
  let zoom = Math.min(availW / w, availH / h);
  if (!Number.isFinite(zoom) || zoom <= 0) zoom = 1;
  zoom = Math.max(minZoom, Math.min(maxZoom, zoom));
  return { cx: c.x, cy: c.y, zoom };
}

/** Camera that centers a target zoomed to an explicit factor. */
export function cameraForCenter(center: { x: number; y: number }, zoom: number): CameraTransform {
  return { cx: center.x, cy: center.y, zoom };
}

/**
 * Interpolate between two cameras exactly like the animated CameraController
 * does (zoom in log space, position linear). `t` is 0..1, already eased —
 * frame-driven hosts pair this with easingByName() + resolveCameraDirective()
 * to reproduce the magic-move deterministically.
 */
export function mixCameras(a: CameraTransform, b: CameraTransform, t: number): CameraTransform {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    zoom: a.zoom * Math.pow(b.zoom / a.zoom, t),
  };
}
