/**
 * Character library types — the unit frame every pose and part is authored in.
 *
 * Unit frame: x is centered on the figure (+right), y runs 0 (top of head)
 * → 1 (ground). The skeleton the whole library agrees on:
 *
 *   head centre  (lean, 0.105)   r = 0.105
 *   neck         0.205 → 0.25
 *   shoulders    (±0.10, 0.30)
 *   torso        x ∈ [-0.10, 0.10],  y ∈ [0.25, 0.55]
 *   hips         (±0.05, 0.55)
 *   ground       y = 1.0          ← grounded feet MUST end here
 *
 * `lean` tilts the upper body forward: every point above the hips is sheared
 * by `lean * s(y)`, where s runs 1 at head height to 0 at the hips. Legs are
 * never sheared, so a leaning figure still plants its feet where it authored
 * them.
 */

import type { VizContext } from "../context.js";

export type Pt = [number, number];

/** Hip line — the shear pivot, and where legs take over from the torso. */
export const HIP_Y = 0.55;
/** Head centre height; the shear reaches full `lean` here. */
export const HEAD_Y = 0.105;
/** Head radius. */
export const HEAD_R = 0.105;
/** Grounded feet land here. A foot above `AIRBORNE_Y` is off the ground. */
export const GROUND_Y = 1.0;
/** Feet at or below this count as planted (they get a foot tick). */
export const AIRBORNE_Y = 0.93;

export interface CharacterPose {
  /** Forward tilt of the upper body, in unit x at head height. */
  lean?: number;
  /** Limb polylines in unit space (drawn as curved rough lines). */
  armL: Pt[];
  armR: Pt[];
  legL: Pt[];
  legR: Pt[];
  /** Short motion strokes (pairs of points), e.g. behind a runner. */
  motion?: Array<[Pt, Pt]>;
  /** Where a prop is held, unit space (default: end of the right arm). */
  propAnchor?: Pt;
  /** Prop size as a fraction of figure height (default 0.30). */
  propSize?: number;
  /** Default emotion for this pose (overridable per call). */
  emotion?: string;
  /** Default state mark for this pose (e.g. `sweat` on `exhausted`). */
  fx?: string;
  /** Skip hand blobs (e.g. hands gripping something off-figure). */
  hands?: boolean;
  /** Both feet are off the ground — suppresses foot ticks. */
  airborne?: boolean;
  /** One-line description, surfaced in the gallery and llms.txt. */
  about?: string;
}

/**
 * Everything a part-drawer needs to place strokes on a figure. Coordinates
 * come pre-transformed: `T` shears with the lean, `P` does not.
 */
export interface CharacterFrame {
  ctx: VizContext;
  /** Figure height in scene units. */
  h: number;
  /** Ink for the figure's strokes. */
  color: string;
  /** Accent for the layer being drawn (shirt / hair / accessory colour). */
  accent: string;
  /** Base line width. */
  lw: number;
  z: number;
  /** -1 when the figure is mirrored. */
  flip: 1 | -1;
  /** Unit → scene, with the lean shear applied (upper body). */
  T: (p: Pt) => Pt;
  /** Unit → scene, no shear (legs, ground-relative marks). */
  P: (p: Pt) => Pt;
  /** Head circle in scene units. */
  head: { cx: number; cy: number; r: number };
  /** Torso quad corners in scene units: TL, TR, BR, BL. */
  torso: [Pt, Pt, Pt, Pt];
  /** Face anchors in scene units. */
  face: { eyeL: number; eyeR: number; eyeY: number; mouthY: number; eyeR2: number };
  /** A rough polyline in the figure's ink. */
  stroke: (pts: Pt[], w?: number, color?: string) => void;
  /** A filled dot (eyes, hands, buttons). */
  dot: (x: number, y: number, r: number, color?: string) => void;
  /** A filled polygon (hearts, ties, hair masses). */
  fill: (pts: Pt[], color?: string) => void;
  /** An arc through `deg` degrees of a circle, as a polyline. */
  arc: (cx: number, cy: number, r: number, from: number, to: number, steps?: number) => Pt[];
}

/** Draws the eyes + mouth (and any face-local extra) for one emotion. */
export type FaceDrawer = (f: CharacterFrame) => void;
/** Draws the torso/clothing over the shirt slot. */
export type ShirtDrawer = (f: CharacterFrame) => void;
/** Draws hair on and around the head circle. */
export type HairDrawer = (f: CharacterFrame) => void;
/** Draws a worn accessory (glasses, hat, beard…). */
export type AccessoryDrawer = (f: CharacterFrame) => void;
/** Draws a state mark floating near the figure (sweat, "?", idea bulb…). */
export type FxDrawer = (f: CharacterFrame) => void;

export interface CharacterOptions {
  pose?: string;
  emotion?: string;
  /** Ink for the figure's strokes (defaults to the preset ink). */
  color?: string;
  /** Any registered icon name, held at the pose's prop anchor. */
  prop?: string;
  /** Accent color for the prop (defaults to the figure color). */
  propColor?: string;
  /** Torso/clothing style — see listCharacterShirts() (default "vest"). */
  shirt?: string;
  /** Fill/accent for the shirt (solid fill, stripes, tie; default = figure color). */
  shirtColor?: string;
  /** Hair style — see listCharacterHair() (default "none"). */
  hair?: string;
  /** Hair ink (default = figure color). */
  hairColor?: string;
  /** Worn accessory — see listCharacterAccessories() (default none). */
  accessory?: string;
  /** Accessory accent (default = figure color). */
  accessoryColor?: string;
  /** Floating state mark — see listCharacterFx() (default = the pose's own). */
  fx?: string;
  /** State-mark accent (default = figure color). */
  fxColor?: string;
  /** Mirror the pose left↔right. */
  flip?: boolean;
  z?: number;
}
