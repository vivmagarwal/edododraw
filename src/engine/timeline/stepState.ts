/**
 * Pure timeline math — the frame-driven counterpart to TimelinePlayer.
 *
 * `timeline { … }` already compiles to plain data (scene.steps); these
 * functions resolve that data into the exact state a renderer needs at any
 * step, with no clock, rAF, or DOM: hosts that own time themselves (video
 * renderers like Remotion, bake pipelines, scrubbers) call stepStateAt() +
 * resolveCameraDirective() per frame and apply the result via
 * SvgRenderer.applyVisibility / AnnotationLayer.render / applyCamera —
 * driving the engine's OWN reveal/magic-move semantics frame-accurately.
 *
 * TimelinePlayer (the interactive rAF player) is built on the same functions,
 * so both paths always agree on what a step shows.
 */

import type { Size } from "../geometry.js";
import { cameraForBBox, type FitOptions } from "../camera/fit.js";
import type { CameraTransform } from "../render/svgRenderer.js";
import { elementsBBox, sceneBBox } from "../scene/query.js";
import type { Annotation, CameraDirective, Scene, Step } from "../scene/types.js";

/** Everything a renderer needs to draw the scene "at step `index`". */
export interface StepState {
  index: number;
  /** The step record itself (null at index -1, the overview). */
  step: Step | null;
  stepName: string;
  caption: string;
  /** Element ids hidden after applying steps 0..index (reveal/hide are sticky). */
  hidden: string[];
  /** Per-element reveal effects declared on THIS step ("fade" | "pop" | "sweep"). */
  revealFx: Record<string, string>;
  /** Annotations visible at this step: always-on scene annotations + the
   *  step's own beat-scoped ones, in render order. */
  annotations: Annotation[];
  /** This step's own camera directive (undefined = camera holds). */
  camera?: CameraDirective;
  /** The directive in force at this step — the nearest camera at or before
   *  `index` (camera is sticky across steps that don't move it). */
  effectiveCamera?: CameraDirective;
  autoAdvanceMs?: number;
}

/** Cumulative sticky visibility through step `index` (-1 = nothing hidden). */
export function computeHiddenAt(steps: Step[], index: number): Set<string> {
  const hidden = new Set<string>();
  for (let s = 0; s <= Math.min(index, steps.length - 1); s++) {
    const step = steps[s];
    for (const id of step.reveal ?? []) hidden.delete(id);
    for (const id of step.hide ?? []) hidden.add(id);
  }
  return hidden;
}

/**
 * Resolve the full render state at step `index` (pure; no DOM, no clock).
 * `index` -1 is the overview: everything visible, always-on annotations only.
 */
export function stepStateAt(scene: Scene, index: number): StepState {
  const steps = scene.steps ?? [];
  const i = Math.min(index, steps.length - 1);
  const step = i >= 0 ? steps[i] : null;
  let effectiveCamera: CameraDirective | undefined;
  for (let s = i; s >= 0; s--) {
    if (steps[s].camera) {
      effectiveCamera = steps[s].camera;
      break;
    }
  }
  return {
    index: i,
    step,
    stepName: step?.name ?? "Overview",
    caption: step?.caption ?? "",
    hidden: [...computeHiddenAt(steps, i)],
    revealFx: step?.revealFx ?? {},
    annotations: [...scene.annotations, ...(step?.annotations ?? [])],
    camera: step?.camera,
    effectiveCamera,
    autoAdvanceMs: step?.autoAdvanceMs,
  };
}

export interface ResolveCameraOptions extends FitOptions {
  /** Camera the zoom/pan ops modify (they keep the unspecified axes). */
  current?: CameraTransform;
}

/**
 * Resolve a step's camera directive to a concrete transform for a viewport
 * (pure math — mirrors what TimelinePlayer animates to). Fit/focus padding
 * defaults match the player (80 / 90 screen px).
 */
export function resolveCameraDirective(scene: Scene, directive: CameraDirective | undefined, viewport: Size, opts: ResolveCameraOptions = {}): CameraTransform {
  const fitAll = () => cameraForBBox(sceneBBox(scene), viewport, { ...opts, padding: directive?.padding ?? opts.padding ?? 80 });
  if (!directive) return fitAll();
  switch (directive.op) {
    case "focus":
    case "focus-group": {
      const box = elementsBBox(scene, directive.targets ?? []);
      if (!Number.isFinite(box.minX)) return fitAll();
      const cam = cameraForBBox(box, viewport, { ...opts, padding: directive.padding ?? opts.padding ?? 90, maxZoom: opts.maxZoom ?? 4 });
      if (directive.zoom != null) cam.zoom = directive.zoom;
      return cam;
    }
    case "zoom": {
      const cur = opts.current ?? fitAll();
      return { ...cur, zoom: directive.zoom ?? cur.zoom };
    }
    case "pan": {
      const cur = opts.current ?? fitAll();
      return { cx: directive.center?.x ?? cur.cx, cy: directive.center?.y ?? cur.cy, zoom: cur.zoom };
    }
    default:
      // fit-all / reset / none
      return fitAll();
  }
}
