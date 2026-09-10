import React from 'react';
import {Composition} from 'remotion';
import {EdodoDiagram} from './EdodoDiagram';
import source from './pipeline.edd';

const FPS = 30;

/**
 * One entry per beat in pipeline.edd's `timeline story { … }`, in beat order.
 *
 * You can also read these off the compiled scene — every beat's `hold:` lands
 * on `step.autoAdvanceMs`:
 *
 *   const {scene} = compileEdd(source);
 *   const beatFrames = (scene.steps ?? []).map(
 *     (s) => Math.round(((s.autoAdvanceMs ?? 3200) / 1000) * FPS),
 *   );
 *
 * They are hard-coded here so `durationInFrames` can be computed without
 * compiling at module scope.
 */
const BEAT_FRAMES = [60, 105, 105, 120, 90];
const DURATION = BEAT_FRAMES.reduce((a, b) => a + b, 0); // 480 frames = 16s

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="EdodoDiagram"
      component={EdodoDiagram}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        source,
        beatFrames: BEAT_FRAMES,
        moveFrames: 24,
        drawFrames: 18,
        showCaption: true,
      }}
    />
  </>
);
