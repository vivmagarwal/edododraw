/**
 * CameraController — drives the SvgRenderer's camera with interruptible,
 * retargetable rAF tweens ("magic move"). Zoom is interpolated in log space so
 * fast/slow zooms feel natural; position is eased linearly.
 */

import type { BBox, Point } from "../geometry.js";
import { bboxUnion, emptyBBox } from "../geometry.js";
import { elementBBox, sceneBBox } from "../scene/query.js";
import type { EasingName, Scene } from "../scene/types.js";
import type { CameraTransform, SvgRenderer } from "../render/svgRenderer.js";
import { cameraForBBox } from "./fit.js";
import { easingByName } from "./easing.js";

export interface MoveOptions {
  durationMs?: number;
  easing?: EasingName;
  padding?: number;
}

interface Tween {
  from: CameraTransform;
  to: CameraTransform;
  start: number;
  duration: number;
  easing: EasingName;
  resolve: () => void;
}

export class CameraController {
  private renderer: SvgRenderer;
  private tween: Tween | null = null;
  private raf = 0;
  /** notified every applied frame (for grid/overlay sync). */
  onFrame?: (cam: CameraTransform) => void;

  constructor(renderer: SvgRenderer) {
    this.renderer = renderer;
  }

  get current(): CameraTransform {
    return this.renderer.getCamera();
  }

  /** Snap immediately (used by user pan/zoom). Cancels any tween. */
  setImmediate(cam: CameraTransform): void {
    this.stop();
    this.renderer.applyCamera(cam);
    this.onFrame?.(cam);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.tween) {
      const r = this.tween.resolve;
      this.tween = null;
      r();
    }
  }

  /** Animate to a target camera, retargeting smoothly if already animating. */
  animateTo(to: CameraTransform, opts: MoveOptions = {}): Promise<void> {
    const from = this.current;
    const duration = opts.durationMs ?? this.autoDuration(from, to);
    if (duration <= 0) {
      this.setImmediate(to);
      return Promise.resolve();
    }
    // resolve any in-flight tween's promise (it's being superseded)
    if (this.tween) {
      const prev = this.tween.resolve;
      this.tween = null;
      prev();
    }
    return new Promise<void>((resolve) => {
      this.tween = { from, to, start: performance.now(), duration, easing: opts.easing ?? "spring", resolve };
      if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    });
  }

  private frame = (now: number): void => {
    this.raf = 0;
    const tw = this.tween;
    if (!tw) return;
    const t = Math.min(1, (now - tw.start) / tw.duration);
    const e = easingByName(tw.easing)(t);
    const cam: CameraTransform = {
      cx: lerp(tw.from.cx, tw.to.cx, e),
      cy: lerp(tw.from.cy, tw.to.cy, e),
      zoom: logLerp(tw.from.zoom, tw.to.zoom, e),
    };
    this.renderer.applyCamera(cam);
    this.onFrame?.(cam);
    if (t < 1) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      const done = tw.resolve;
      this.tween = null;
      done();
    }
  };

  /** Duration heuristic: further travel + bigger zoom change => longer. */
  private autoDuration(from: CameraTransform, to: CameraTransform): number {
    const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) * Math.min(from.zoom, to.zoom);
    const zoomRatio = Math.abs(Math.log(to.zoom / from.zoom));
    return clamp(420 + dist * 0.12 + zoomRatio * 320, 420, 1300);
  }

  // ---- high-level ops -----------------------------------------------------
  fitAll(scene: Scene, opts: MoveOptions = {}): Promise<void> {
    const cam = cameraForBBox(sceneBBox(scene), this.renderer.getViewportSize(), { padding: opts.padding ?? 80 });
    return this.animateTo(cam, opts);
  }

  focus(scene: Scene, ids: string[], opts: MoveOptions & { zoom?: number } = {}): Promise<void> {
    let box = emptyBBox();
    for (const id of ids) {
      const b = elementBBox(scene, id);
      if (b) box = bboxUnion(box, b);
    }
    if (!Number.isFinite(box.minX)) return this.fitAll(scene, opts);
    const cam = cameraForBBox(box, this.renderer.getViewportSize(), { padding: opts.padding ?? 90, maxZoom: 4 });
    if (opts.zoom != null) cam.zoom = opts.zoom;
    return this.animateTo(cam, opts);
  }

  focusBBox(box: BBox, opts: MoveOptions & { zoom?: number } = {}): Promise<void> {
    const cam = cameraForBBox(box, this.renderer.getViewportSize(), { padding: opts.padding ?? 90 });
    if (opts.zoom != null) cam.zoom = opts.zoom;
    return this.animateTo(cam, opts);
  }

  /** Zoom by a factor around a screen anchor (default: viewport center). */
  zoomBy(factor: number, anchorScreen?: Point): void {
    const cam = this.current;
    const vp = this.renderer.getViewportSize();
    const anchor = anchorScreen ?? { x: vp.w / 2, y: vp.h / 2 };
    const worldBefore = this.renderer.screenToWorld(anchor);
    const zoom = clamp(cam.zoom * factor, 0.05, 8);
    // keep the anchor world-point under the cursor
    const cx = worldBefore.x - (anchor.x - vp.w / 2) / zoom;
    const cy = worldBefore.y - (anchor.y - vp.h / 2) / zoom;
    this.setImmediate({ cx, cy, zoom });
  }

  /** Pan by a screen-space delta. */
  panByScreen(dx: number, dy: number): void {
    const cam = this.current;
    this.setImmediate({ cx: cam.cx - dx / cam.zoom, cy: cam.cy - dy / cam.zoom, zoom: cam.zoom });
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function logLerp(a: number, b: number, t: number): number {
  return a * Math.pow(b / a, t);
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
