/**
 * EdodoDiagram — an EDodoDraw diagram driven frame by frame from Remotion.
 *
 * The whole design in one sentence: COMPILE ONCE, RENDER ONCE, and per frame
 * call only total functions of `frame`.
 *
 * Remotion does not *play* a composition, it *seeks* it: a render farm splits
 * the frame range across workers, the Studio jumps wherever you click, and the
 * Player may re-mount. So nothing here may accumulate, consult a clock, or
 * assume frame N-1 already ran.
 *
 * See docs/REMOTION_RECIPE.md for the full explanation.
 */

import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  AnnotationLayer,
  FONT_FAMILY,
  SvgRenderer,
  compileEdd,
  easingByName,
  mixCameras,
  resolveCameraDirective,
  stepStateAt,
  whenFontsReady,
  type Scene,
} from 'edododraw';

export type EdodoDiagramProps = {
  /** `.edd` source text (see remotion.config.ts for the `.edd` import rule). */
  readonly source: string;
  /** Frames to spend on each beat, in beat order. */
  readonly beatFrames: readonly number[];
  /** Frames the magic-move camera takes to travel between two beats. */
  readonly moveFrames?: number;
  /** Frames a `with draw-on` element takes to draw itself on. */
  readonly drawFrames?: number;
  /** Render the beat's `narrate:` text as a lower third. */
  readonly showCaption?: boolean;
};

/** Pure: which beat is on screen at `frame`, and how far into it we are. */
function beatAt(frame: number, beatFrames: readonly number[]): {index: number; local: number} {
  if (beatFrames.length === 0) return {index: -1, local: 0};
  let acc = 0;
  for (let i = 0; i < beatFrames.length; i++) {
    const len = Math.max(1, beatFrames[i]);
    if (frame < acc + len) return {index: i, local: frame - acc};
    acc += len;
  }
  // past the end: hold the last beat, fully settled
  const last = beatFrames.length - 1;
  return {index: last, local: Math.max(1, beatFrames[last])};
}

export const EdodoDiagram: React.FC<EdodoDiagramProps> = ({
  source,
  beatFrames,
  moveFrames = 24,
  drawFrames = 18,
  showCaption = true,
}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  // ───────────────────────────────────────────────────────────── 1. PURE, ONCE
  // compileEdd is synchronous and DOM-free, and rough.js seeds are hashed from
  // element ids — so this is identical on every worker and every re-render.
  const scene: Scene = useMemo(() => {
    const {scene: compiled, diagnostics} = compileEdd(source);
    if (diagnostics.hasErrors) {
      throw new Error(
        'edododraw: ' + diagnostics.errors.map((d) => `${d.code}: ${d.message}`).join('\n'),
      );
    }
    return compiled;
  }, [source]);

  // ─────────────────────────────────────────────────────── 2. IMPERATIVE, ONCE
  const hostRef = useRef<HTMLDivElement>(null);
  const gfx = useRef<{renderer: SvgRenderer; annotations: AnnotationLayer} | null>(null);
  const [fontHandle] = useState(() => delayRender('edododraw: hand-drawn font'));

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new SvgRenderer(host, {
      static: true, // no wall-clock CSS anywhere: transitions, arrow keyframes, reveals
      nonScalingStroke: true, // a 2px line stays 2px at 4x instead of becoming 8px
      annotations: false, // the AnnotationLayer below owns that layer
    });
    renderer.mount();
    // STATE the viewport; do NOT measure it. Remotion mounts the composition
    // in a 0x0 off-screen wrapper during the layout pass, so measure() reads
    // 0x0, clamps to 1x1, and every applyCamera translates by half a pixel —
    // the diagram ends up in the top-left corner. useVideoConfig() knows the
    // real size, and it is the same viewport resolveCameraDirective gets.
    renderer.setViewport({w: width, h: height});
    renderer.render(scene); // THE ONLY render() call — 8-30ms, never per frame

    const annotations = new AnnotationLayer(renderer);
    gfx.current = {renderer, annotations};

    // The hand-drawn font is injected as a base64 @font-face. If Remotion
    // screenshots before it decodes, text is laid out with fallback metrics and
    // every label shifts. Hold the render until the face is ready.
    whenFontsReady()
      .then(() => continueRender(fontHandle))
      .catch((err) => cancelRender(err));

    return () => {
      renderer.destroy();
      gfx.current = null;
    };
  }, [scene, fontHandle]);

  // ──────────────────────────────────────────────────────────── 3. EVERY FRAME
  // Total functions of `frame` only. No accumulation, no clock, no render().
  useLayoutEffect(() => {
    const g = gfx.current;
    if (!g) return;
    const viewport = {w: width, h: height};

    const {index, local} = beatAt(frame, beatFrames);
    const state = stepStateAt(scene, index);
    const prev = stepStateAt(scene, Math.max(-1, index - 1));

    // (a) camera — resolve both endpoints, then interpolate. mixCameras mixes
    //     zoom in LOG space, exactly like the interactive controller does.
    const to = resolveCameraDirective(scene, state.effectiveCamera, viewport);
    const from = resolveCameraDirective(scene, prev.effectiveCamera, viewport);
    const t = interpolate(local, [0, moveFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const cam = mixCameras(from, to, easingByName(state.camera?.easing)(t));

    // (b) zoom compensation, so stroke jitter stays constant on screen.
    //     ORDER MATTERS: this REPAINTS when the value changes, which rebuilds the
    //     node/edge layers and would throw away the DOM writes below. Quantised
    //     to octaves and floored at 1, so a composition that never passes 2x
    //     never repaints at all, and a repeated value is a no-op.
    g.renderer.setRoughnessScale(1 / Math.max(1, Math.pow(2, Math.floor(Math.log2(cam.zoom)))));
    g.renderer.applyCamera(cam); // applyCamera alone never repaints

    // (c) visibility — sticky reveal/hide, resolved from scratch at this beat
    g.renderer.applyVisibility(new Set(state.hidden));

    // (d) annotations — always-on + this beat's, in render order.
    //     `false` suppresses the CSS reveal (static mode ignores it anyway).
    g.annotations.render(scene, state.annotations, false);

    // (e) draw-on — pass ONLY the in-progress ids; setRevealProgressAll restores
    //     every other drawable to 1. That is what makes it safe under seeking:
    //     setRevealProgress alone mutates and only restores at p >= 1, so an id
    //     a frame stops mentioning would stay frozen mid-draw forever.
    const drawing: Record<string, number> = {};
    if (drawFrames > 0) {
      const p = interpolate(local, [0, drawFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      for (const [id, fx] of Object.entries(state.revealFx)) {
        if (fx === 'draw-on') drawing[id] = p;
      }
    }
    g.renderer.setRevealProgressAll(drawing);
  }, [frame, scene, beatFrames, moveFrames, drawFrames, width, height]);

  const caption = showCaption ? stepStateAt(scene, beatAt(frame, beatFrames).index).caption : '';

  return (
    <AbsoluteFill style={{backgroundColor: scene.meta.background || scene.theme.background}}>
      <div ref={hostRef} style={{position: 'absolute', left: 0, top: 0, width, height}} />
      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 64,
            textAlign: 'center',
            font: `500 40px ${FONT_FAMILY.hand}`,
            color: scene.theme.defaultText,
            padding: '0 120px',
          }}
        >
          {caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
