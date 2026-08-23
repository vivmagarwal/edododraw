/**
 * Character library types — the unit frame every pose and part is authored in.
 *
 * Unit frame: x is centered on the figure (+right), y runs 0 (top of head)
 * → 1 (ground). The skeleton the whole library agrees on:
 *
 *   head centre  (lean, 0.125)   r = 0.125     ← 25% of total height
 *   NO NECK — the head sits on the body (chin 0.25, body top 0.245)
 *   shoulders    (±BODY edge, 0.30)
 *   body         a BEAN: y ∈ [0.245, 0.55], half-width 0.078 → 0.106 → 0.082
 *   hips         (±0.05, 0.55)
 *   ground       y = 1.0          ← grounded feet MUST end here
 *
 * WHY THESE NUMBERS (v2, 2026-08-23). The v1 figure was a 21%-of-height head
 * on a 0.20-wide rounded-rectangle torso with 0.17-long arms: a small head on
 * a fridge with stubby limbs, and it read — accurately — as weak. Every number
 * here comes from the two references the studio actually draws in:
 *   · the VizThink workbook (pp. 6–8): head ≈ ¼ of height, tapered body,
 *     limbs as single curved strokes ending in a small LOOP, no neck.
 *   · commercial doodle-figure sets: head 30–35%, an OVAL/bean body, a wide
 *     generous smile, loop hands, shoe-loop feet, a soft ground shadow.
 * A bean body is the single highest-leverage change: a rectangle reads as
 * furniture, an oval reads as a person.
 *
 * `lean` tilts the upper body forward: every point above the hips is sheared
 * by `lean * s(y)`, where s runs 1 at head height to 0 at the hips. Legs are
 * never sheared, so a leaning figure still plants its feet where it authored
 * them.
 */

import type { VizContext } from "../context.js";

export type Pt = [number, number];

/**
 * Hip line — the shear pivot, and where legs take over from the body.
 *
 * Poses author their legs against LEGACY_HIP (0.55, the v1 datum); the renderer
 * remaps every leg from that datum onto HIP_Y, keeping grounded feet at y = 1
 * and every knee bend in proportion. That is why the hip can be tuned here
 * without touching fifty hand-authored leg polylines — and why v1's figure,
 * which was 45% bare leg, could be re-proportioned in one line.
 */
export const HIP_Y = 0.6;
/** The hip height poses are AUTHORED against. Never change this. */
export const LEGACY_HIP = 0.55;
/** Map an authored leg y onto the current hip. */
export const legY = (y: number): number =>
  y <= LEGACY_HIP ? (y / LEGACY_HIP) * HIP_Y : HIP_Y + ((y - LEGACY_HIP) * (1 - HIP_Y)) / (1 - LEGACY_HIP);
/**
 * Head centre height and radius. The head is ~29% of the figure — deliberately
 * large. Every reference set this style comes from runs 25–35%, and a small
 * head is what made v1's figures read as spindly. HEAD_R can be tuned freely:
 * poses never hand-place around the skull, because the renderer pushes any
 * hand that lands inside the head back out to the rim (`clearHead`).
 */
export const HEAD_Y = 0.145;
export const HEAD_R = 0.145;
/** Top of the body. The chin (HEAD_Y + HEAD_R) lands here: there is no neck. */
export const BODY_TOP = 0.285;
/**
 * Half-width of the body silhouette at unit height `y` — the BEAN.
 * Narrow at the shoulders, widest just below the chest, tucked at the hem.
 * Every garment, and the point each arm attaches at, is expressed against
 * this, so changing the body's shape moves the clothes and the arms with it.
 */
export function bodyHalfWidth(y: number): number {
  const t = (y - BODY_TOP) / (HIP_Y - BODY_TOP);
  if (t <= 0) return 0.084;
  if (t >= 1) return 0.076;
  // an ELLIPTICAL profile, not a straight taper: a trapezoid reads as a dress on
  // every figure, a curve reads as a torso. Widest a little above the middle.
  const WIDEST_T = 0.42;
  const k = t < WIDEST_T ? (t / WIDEST_T) : (1 - t) / (1 - WIDEST_T);
  const bulge = Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k)));
  const endW = t < WIDEST_T ? 0.084 : 0.076;
  return endW + (0.112 - endW) * bulge;
}
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
  /** A hand is deliberately ON the head (facepalm) — skip the head-clearance push. */
  contact?: boolean;
  /**
   * Skip snapping the arm roots to the body silhouette. Default is to snap:
   * an arm must LEAVE THE BODY, not float beside it or start inside it. Poses
   * whose arms deliberately begin across the chest (folded, pushing) opt out.
   */
  freeArms?: boolean;
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
  /** Torso quad corners in scene units: TL, TR, BR, BL (the bean's bounding box). */
  torso: [Pt, Pt, Pt, Pt];
  /** How much of the figure is drawn — see `CharacterOptions.fidelity`. */
  fidelity: "minimal" | "plain" | "detailed";
  /**
   * A point on the BODY SILHOUETTE: `k` is a fraction of the body's half-width
   * at height `y` (-1 = left edge, 0 = centre, +1 = right edge), sheared with
   * the lean. Garments are authored against this, never against raw unit x, so
   * a collar stays on the collarbone whatever shape the body is.
   */
  B: (k: number, y: number) => Pt;
  /** The bean outline as a closed polyline, in scene units. */
  bodyOutline: (inset?: number) => Pt[];
  /** A small OPEN circle — the loop that ends every hand and foot in this style. */
  loop: (x: number, y: number, r: number, color?: string) => void;
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
  /**
   * How much of the figure is drawn — the workbook's abstract→detailed
   * continuum (pp. 7–8). DETAIL IS ATTENTION: render the protagonist detailed
   * and the bystanders minimal, or a crowd competes with the point.
   *   "minimal"  no face, a single-stroke body, bare limb tips — bystanders
   *   "plain"    face, bean body, loop hands, shoe feet  (default)
   *   "detailed" plain + collar/cuffs + a heavier face — the protagonist
   */
  fidelity?: "minimal" | "plain" | "detailed";
  /** Soft ground shadow under a standing figure (default true when grounded). */
  shadow?: boolean;
  z?: number;
}
