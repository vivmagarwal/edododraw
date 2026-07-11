/**
 * TimelinePlayer — plays a scene's steps as a magic-move presentation.
 * Each step diffs against the running state: camera (sticky), visibility
 * (sticky), and beat-scoped annotations (replaced each step). Always-on
 * scene.annotations render underneath every step.
 */

import type { AnnotationLayer } from "../annotate/layer.js";
import type { CameraController } from "../camera/controller.js";
import type { SvgRenderer } from "../render/svgRenderer.js";
import type { Scene, Step } from "../scene/types.js";
import { computeHiddenAt } from "./stepState.js";

export interface PlayerState {
  index: number; // -1 = home/overview (no step)
  total: number;
  caption: string;
  playing: boolean;
  stepName: string;
}

export class TimelinePlayer {
  private renderer: SvgRenderer;
  private controller: CameraController;
  private annotations: AnnotationLayer;
  private scene: Scene | null = null;
  private steps: Step[] = [];
  private idx = -1;
  private playing = false;
  private timer: number | undefined;

  onChange?: (state: PlayerState) => void;

  constructor(renderer: SvgRenderer, controller: CameraController, annotations: AnnotationLayer) {
    this.renderer = renderer;
    this.controller = controller;
    this.annotations = annotations;
  }

  get hasTimeline(): boolean {
    return this.steps.length > 0;
  }

  load(scene: Scene): void {
    this.pause();
    this.scene = scene;
    this.steps = scene.steps ?? [];
    this.idx = -1;
    // baseline: everything visible, always-on annotations shown
    this.renderer.applyVisibility(new Set());
    this.annotations.render(scene, scene.annotations, false);
    this.emit();
  }

  private emit(): void {
    const step = this.idx >= 0 ? this.steps[this.idx] : undefined;
    this.onChange?.({
      index: this.idx,
      total: this.steps.length,
      caption: step?.caption ?? "",
      stepName: step?.name ?? "Overview",
      playing: this.playing,
    });
  }

  async goto(i: number, animate = true): Promise<void> {
    if (!this.scene || i < 0 || i >= this.steps.length) return;
    this.idx = i;
    const step = this.steps[i];
    const scene = this.scene;

    // visibility (sticky) — shared with the pure stepStateAt() math
    this.renderer.applyVisibility(computeHiddenAt(this.steps, i));

    // reveal animation (fade / pop / draw-on) for this beat's targets
    if (animate) this.renderer.playReveal(step.revealFx);

    // annotations: always-on + this step's (beat-scoped)
    this.annotations.render(scene, [...scene.annotations, ...step.annotations], animate);

    this.emit();

    // camera (sticky if none)
    if (step.camera) {
      await this.runCamera(step, animate);
    }
  }

  private async runCamera(step: Step, animate: boolean): Promise<void> {
    const scene = this.scene!;
    const cam = step.camera!;
    const opts = { durationMs: animate ? cam.durationMs : 0, easing: cam.easing, padding: cam.padding };
    switch (cam.op) {
      case "fit-all":
        await this.controller.fitAll(scene, opts);
        break;
      case "focus":
        await this.controller.focus(scene, cam.targets ?? [], { ...opts, zoom: cam.zoom });
        break;
      case "zoom": {
        const cur = this.controller.current;
        await this.controller.animateTo({ ...cur, zoom: cam.zoom ?? cur.zoom }, opts);
        break;
      }
      case "pan": {
        const cur = this.controller.current;
        await this.controller.animateTo({ cx: cam.center?.x ?? cur.cx, cy: cam.center?.y ?? cur.cy, zoom: cur.zoom }, opts);
        break;
      }
      default:
        await this.controller.fitAll(scene, opts);
    }
  }

  next(): void {
    if (this.idx < this.steps.length - 1) void this.goto(this.idx + 1);
  }
  prev(): void {
    if (this.idx > 0) void this.goto(this.idx - 1);
    else if (this.idx === 0) {
      this.idx = -1;
      this.load(this.scene!);
      void this.controller.fitAll(this.scene!);
    }
  }
  restart(): void {
    this.pause();
    void this.goto(0);
  }

  play(): void {
    if (!this.hasTimeline) return;
    this.playing = true;
    if (this.idx < 0) void this.goto(0).then(() => this.scheduleNext());
    else this.scheduleNext();
    this.emit();
  }

  private scheduleNext(): void {
    window.clearTimeout(this.timer);
    if (!this.playing) return;
    if (this.idx >= this.steps.length - 1) {
      this.playing = false;
      this.emit();
      return;
    }
    const dwell = this.steps[this.idx]?.autoAdvanceMs ?? 3200;
    this.timer = window.setTimeout(async () => {
      if (!this.playing) return;
      await this.goto(this.idx + 1);
      this.scheduleNext();
    }, dwell);
  }

  pause(): void {
    this.playing = false;
    window.clearTimeout(this.timer);
    this.emit();
  }

  dispose(): void {
    this.pause();
  }
}
