/**
 * Character library — reusable sketchnote-style figures for viz templates and
 * plugin generators. Everything is parametric and preset-aware:
 *
 *   ctx.character("cheering", cx, groundY, 120, {
 *     color: role.color, emotion: "starstruck", prop: "trophy",
 *     shirt: "striped", hair: "spiky", accessory: "glasses", fx: "stars",
 *   })
 *
 * Six independent axes, each a runtime registry (register/list/get helpers):
 *   pose · emotion · shirt · hair · accessory · fx  (+ any icon as a prop)
 *
 * Anatomy follows the classic sketchnoting formula: a bullet head (circle +
 * dot eyes + mouth), a short neck, a small torso outline, curved single-line
 * limbs with hand blobs, and motion lines for action. The upper body shears
 * with the pose's `lean` so leaning figures stay whole; feet stay planted.
 * Strokes are deterministic (id-hash rough.js seeds) like everything else.
 */

// Register the built-ins (side effects — order sets the listing order).
import "./poses.js";
import "./faces.js";
import "./shirts.js";
import "./hair.js";
import "./accessories.js";
import "./fx.js";

export type {
  CharacterPose,
  CharacterOptions,
  CharacterFrame,
  FaceDrawer,
  ShirtDrawer,
  HairDrawer,
  AccessoryDrawer,
  FxDrawer,
  Pt,
} from "./types.js";

export {
  registerCharacterPose,
  getCharacterPose,
  listCharacterPoses,
  registerCharacterEmotion,
  getCharacterEmotion,
  listCharacterEmotions,
  registerCharacterShirt,
  getCharacterShirt,
  listCharacterShirts,
  registerCharacterHair,
  getCharacterHair,
  listCharacterHair,
  registerCharacterAccessory,
  getCharacterAccessory,
  listCharacterAccessories,
  registerCharacterFx,
  getCharacterFx,
  listCharacterFx,
} from "./registry.js";

export { drawCharacter, characterInk } from "./draw.js";

import type { CharacterOptions } from "./types.js";

/**
 * Pull every character axis out of a DSL options bag (an `item {…}` or a viz
 * `meta` block) into CharacterOptions. Keeps templates from having to know the
 * full axis list — one call forwards pose/emotion/shirt/hair/accessory/fx and
 * their colours. `pose`/`color`/`propColor` stay the caller's concern.
 */
export function characterOptsFrom(opts: Record<string, unknown>): Omit<CharacterOptions, "pose" | "color"> {
  const out: Record<string, string> = {};
  for (const k of ["emotion", "prop", "shirt", "shirtColor", "hair", "hairColor", "accessory", "accessoryColor", "fx", "fxColor"]) {
    if (typeof opts[k] === "string") out[k] = opts[k] as string;
  }
  return out; // only the keys actually set — safe to spread over caller defaults
}
