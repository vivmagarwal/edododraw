/**
 * Runtime registries for every character axis. Each axis is a Map keyed by
 * name, preserving insertion order (so listings are stable and the built-ins
 * come first). Consumers extend any axis at runtime:
 *
 *   registerCharacterPose("dabbing", { armL, armR, legL, legR });
 *   registerCharacterEmotion("smirk", (f) => { … });
 *   registerCharacterHair("mohawk", (f) => { … });
 *
 * The gallery and llms.txt enumerate these lists, so a registered variant is
 * discoverable everywhere the built-ins are.
 */

import type { CharacterPose, FaceDrawer, ShirtDrawer, HairDrawer, AccessoryDrawer, FxDrawer } from "./types.js";

const POSES = new Map<string, CharacterPose>();
const EMOTIONS = new Map<string, FaceDrawer>();
const SHIRTS = new Map<string, ShirtDrawer>();
const HAIR = new Map<string, HairDrawer>();
const ACCESSORIES = new Map<string, AccessoryDrawer>();
const FX = new Map<string, FxDrawer>();

// ---- poses --------------------------------------------------------------------

/** Register a pose (consumers may add their own or shadow built-ins). */
export function registerCharacterPose(name: string, pose: CharacterPose): void {
  POSES.set(name, pose);
}
export function getCharacterPose(name: string): CharacterPose | undefined {
  return POSES.get(name);
}
export function listCharacterPoses(): string[] {
  return [...POSES.keys()];
}

// ---- emotions -----------------------------------------------------------------

export function registerCharacterEmotion(name: string, draw: FaceDrawer): void {
  EMOTIONS.set(name, draw);
}
export function getCharacterEmotion(name: string): FaceDrawer | undefined {
  return EMOTIONS.get(name);
}
export function listCharacterEmotions(): string[] {
  return [...EMOTIONS.keys()];
}

// ---- shirts -------------------------------------------------------------------

export function registerCharacterShirt(name: string, draw: ShirtDrawer): void {
  SHIRTS.set(name, draw);
}
export function getCharacterShirt(name: string): ShirtDrawer | undefined {
  return SHIRTS.get(name);
}
export function listCharacterShirts(): string[] {
  return [...SHIRTS.keys()];
}

// ---- hair ---------------------------------------------------------------------

export function registerCharacterHair(name: string, draw: HairDrawer): void {
  HAIR.set(name, draw);
}
export function getCharacterHair(name: string): HairDrawer | undefined {
  return HAIR.get(name);
}
export function listCharacterHair(): string[] {
  return [...HAIR.keys()];
}

// ---- accessories --------------------------------------------------------------

export function registerCharacterAccessory(name: string, draw: AccessoryDrawer): void {
  ACCESSORIES.set(name, draw);
}
export function getCharacterAccessory(name: string): AccessoryDrawer | undefined {
  return ACCESSORIES.get(name);
}
export function listCharacterAccessories(): string[] {
  return [...ACCESSORIES.keys()];
}

// ---- fx (floating state marks) ------------------------------------------------

export function registerCharacterFx(name: string, draw: FxDrawer): void {
  FX.set(name, draw);
}
export function getCharacterFx(name: string): FxDrawer | undefined {
  return FX.get(name);
}
export function listCharacterFx(): string[] {
  return [...FX.keys()];
}
