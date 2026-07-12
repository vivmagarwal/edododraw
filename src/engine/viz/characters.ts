/**
 * Character library — reusable sketchnote-style stick figures for viz
 * templates (and plugin generators). The anatomy follows the classic
 * sketchnoting formula: a bullet head (circle + dot eyes + mouth), a short
 * neck, a small vest-shaped torso OUTLINE (not a bare stick), curved single-
 * line limbs with hand/foot blobs, and motion lines for action poses.
 *
 * Everything is parametric and preset-aware:
 *   ctx.character("cheering", x, y, 120, { color: role.color, emotion: "excited", prop: "trophy" })
 *
 * - `pose` — limb polylines in a unit frame (registerCharacterPose to extend)
 * - `emotion` — eyes + mouth variants (the mouth/eyes grid from the workbook)
 * - `prop` — ANY registered icon name, held at the pose's prop anchor
 * - `flip` — mirror left/right (e.g. two teams pulling a rope)
 *
 * Unit frame: x is centered on the figure (+right), y runs 0 (top of head)
 * → 1 (ground). Shoulders sit at (±0.10, 0.30), hips at (±0.06, 0.55).
 */

import type { VizContext } from "./context.js";
import { iconEntry } from "./icons.js";

type Pt = [number, number];

export interface CharacterPose {
  /** Head-center x offset (lean) in unit space. */
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
  /** Skip hand blobs (e.g. hands gripping something off-figure). */
  hands?: boolean;
}

const POSES = new Map<string, CharacterPose>();

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

export const CHARACTER_EMOTIONS = ["neutral", "happy", "sad", "surprised", "angry", "excited", "confused", "thinking", "determined", "wink", "love", "starstruck", "sleeping", "dizzy"] as const;

export function listCharacterEmotions(): string[] {
  return [...CHARACTER_EMOTIONS];
}

/** Torso/clothing styles (the workbook's figure-style continuum). */
export const CHARACTER_SHIRTS = ["vest", "tee", "striped", "solid", "tie", "dress", "hoodie"] as const;

export function listCharacterShirts(): string[] {
  return [...CHARACTER_SHIRTS];
}

// ---- built-in poses ------------------------------------------------------------

registerCharacterPose("standing", {
  armL: [[-0.10, 0.31], [-0.17, 0.47]],
  armR: [[0.10, 0.31], [0.17, 0.47]],
  legL: [[-0.05, 0.55], [-0.10, 0.97]],
  legR: [[0.05, 0.55], [0.10, 0.97]],
  propAnchor: [0.27, 0.10],
  propSize: 0.24,
});
registerCharacterPose("waving", {
  emotion: "happy",
  armL: [[-0.10, 0.31], [-0.17, 0.47]],
  armR: [[0.10, 0.31], [0.20, 0.17], [0.27, 0.07]],
  legL: [[-0.05, 0.55], [-0.09, 0.97]],
  legR: [[0.05, 0.55], [0.09, 0.97]],
  propAnchor: [0.29, 0.04],
});
registerCharacterPose("pointing", {
  armL: [[-0.10, 0.31], [-0.15, 0.48]],
  armR: [[0.10, 0.31], [0.24, 0.29], [0.34, 0.27]],
  legL: [[-0.05, 0.55], [-0.10, 0.97]],
  legR: [[0.05, 0.55], [0.09, 0.97]],
  propAnchor: [0.40, 0.24],
});
registerCharacterPose("presenting", {
  emotion: "happy",
  armL: [[-0.10, 0.31], [-0.19, 0.45]],
  armR: [[0.10, 0.31], [0.24, 0.38], [0.33, 0.36]],
  legL: [[-0.05, 0.55], [-0.09, 0.97]],
  legR: [[0.05, 0.55], [0.10, 0.97]],
  propAnchor: [0.36, 0.30],
});
registerCharacterPose("cheering", {
  emotion: "excited",
  armL: [[-0.10, 0.31], [-0.20, 0.16], [-0.25, 0.06]],
  armR: [[0.10, 0.31], [0.20, 0.16], [0.25, 0.06]],
  legL: [[-0.05, 0.55], [-0.14, 0.96]],
  legR: [[0.05, 0.55], [0.14, 0.96]],
  motion: [
    [[-0.10, 0.02], [-0.14, -0.04]],
    [[0, -0.02], [0, -0.09]],
    [[0.10, 0.02], [0.14, -0.04]],
  ],
  propAnchor: [0, -0.10],
  propSize: 0.26,
});
registerCharacterPose("running", {
  lean: 0.13,
  emotion: "determined",
  armL: [[0.09, 0.30], [0.24, 0.33], [0.32, 0.24]],
  armR: [[-0.09, 0.32], [-0.24, 0.40], [-0.30, 0.50]],
  legL: [[0.05, 0.55], [0.20, 0.74], [0.24, 0.95]],
  legR: [[-0.05, 0.55], [-0.24, 0.66], [-0.34, 0.58]],
  motion: [
    [[-0.38, 0.28], [-0.52, 0.28]],
    [[-0.40, 0.38], [-0.56, 0.38]],
    [[-0.38, 0.48], [-0.50, 0.48]],
  ],
});
registerCharacterPose("confident", {
  emotion: "determined",
  armL: [[-0.10, 0.31], [-0.21, 0.42], [-0.08, 0.52]],
  armR: [[0.10, 0.31], [0.21, 0.42], [0.08, 0.52]],
  legL: [[-0.05, 0.55], [-0.13, 0.97]],
  legR: [[0.05, 0.55], [0.13, 0.97]],
  hands: false,
  propAnchor: [0.27, 0.10],
  propSize: 0.24,
});
registerCharacterPose("thinking", {
  emotion: "thinking",
  armL: [[-0.10, 0.31], [-0.16, 0.48]],
  armR: [[0.10, 0.31], [0.19, 0.24], [0.09, 0.185]],
  legL: [[-0.05, 0.55], [-0.09, 0.97]],
  legR: [[0.05, 0.55], [0.09, 0.97]],
  propAnchor: [0.30, 0.02],
  propSize: 0.24,
});
registerCharacterPose("holding-overhead", {
  emotion: "happy",
  armL: [[-0.10, 0.31], [-0.17, 0.12], [-0.11, -0.05]],
  armR: [[0.10, 0.31], [0.17, 0.12], [0.11, -0.05]],
  legL: [[-0.05, 0.55], [-0.11, 0.97]],
  legR: [[0.05, 0.55], [0.11, 0.97]],
  propAnchor: [0, -0.175],
  propSize: 0.30,
  hands: false,
});
registerCharacterPose("shrugging", {
  emotion: "confused",
  armL: [[-0.10, 0.31], [-0.22, 0.36], [-0.30, 0.28]],
  armR: [[0.10, 0.31], [0.22, 0.36], [0.30, 0.28]],
  legL: [[-0.05, 0.55], [-0.08, 0.97]],
  legR: [[0.05, 0.55], [0.08, 0.97]],
  propAnchor: [0, -0.12],
  propSize: 0.24,
});
registerCharacterPose("pulling", {
  lean: -0.06,
  emotion: "determined",
  armL: [[0.04, 0.33], [0.18, 0.45], [0.28, 0.545]],
  armR: [[0.10, 0.31], [0.24, 0.46], [0.33, 0.555]],
  legL: [[-0.05, 0.55], [-0.20, 0.75], [-0.26, 0.96]],
  legR: [[0.05, 0.55], [-0.04, 0.78], [-0.06, 0.97]],
});
registerCharacterPose("peering", {
  lean: 0.07,
  emotion: "surprised",
  armL: [[-0.10, 0.31], [-0.13, 0.48]],
  armR: [[0.10, 0.31], [0.21, 0.40]],
  legL: [[-0.05, 0.55], [-0.09, 0.97]],
  legR: [[0.05, 0.55], [0.07, 0.97]],
});
registerCharacterPose("walking", {
  lean: 0.03,
  armL: [[-0.10, 0.31], [-0.19, 0.45]],
  armR: [[0.10, 0.31], [0.19, 0.44]],
  legL: [[-0.05, 0.55], [-0.13, 0.77], [-0.16, 0.96]],
  legR: [[0.05, 0.55], [0.14, 0.76], [0.17, 0.96]],
});
registerCharacterPose("jumping", {
  emotion: "excited",
  armL: [[-0.10, 0.31], [-0.20, 0.18], [-0.24, 0.08]],
  armR: [[0.10, 0.31], [0.20, 0.18], [0.24, 0.08]],
  legL: [[-0.05, 0.55], [-0.15, 0.68], [-0.11, 0.80]],
  legR: [[0.05, 0.55], [0.15, 0.68], [0.11, 0.80]],
  motion: [
    [[-0.10, 0.92], [-0.03, 0.92]],
    [[0.03, 0.95], [0.10, 0.95]],
    [[-0.04, 0.99], [0.04, 0.99]],
  ],
  propAnchor: [0, -0.12],
  propSize: 0.26,
});
registerCharacterPose("pushing", {
  lean: 0.10,
  emotion: "determined",
  armL: [[0.04, 0.32], [0.20, 0.38], [0.33, 0.42]],
  armR: [[0.10, 0.30], [0.26, 0.33], [0.36, 0.37]],
  legL: [[-0.05, 0.55], [-0.22, 0.78], [-0.28, 0.97]],
  legR: [[0.05, 0.55], [0.16, 0.76], [0.14, 0.97]],
});
registerCharacterPose("carrying", {
  armL: [[-0.10, 0.31], [-0.13, 0.42], [-0.04, 0.40]],
  armR: [[0.10, 0.31], [0.13, 0.42], [0.04, 0.40]],
  legL: [[-0.05, 0.55], [-0.09, 0.97]],
  legR: [[0.05, 0.55], [0.09, 0.97]],
  hands: false,
  propAnchor: [0, 0.36],
  propSize: 0.24,
});
registerCharacterPose("sitting", {
  armL: [[-0.10, 0.31], [-0.06, 0.44], [0.06, 0.48]],
  armR: [[0.10, 0.31], [0.14, 0.44], [0.10, 0.50]],
  legL: [[-0.05, 0.55], [0.16, 0.70], [0.14, 0.97]],
  legR: [[0.05, 0.55], [0.22, 0.72], [0.20, 0.97]],
  propAnchor: [0.16, 0.42],
  propSize: 0.22,
});
registerCharacterPose("meditating", {
  emotion: "happy",
  armL: [[-0.10, 0.31], [-0.20, 0.48], [-0.15, 0.58]],
  armR: [[0.10, 0.31], [0.20, 0.48], [0.15, 0.58]],
  legL: [[-0.05, 0.55], [-0.24, 0.82], [0.08, 0.88]],
  legR: [[0.05, 0.55], [0.24, 0.82], [-0.08, 0.88]],
  propAnchor: [0, -0.14],
  propSize: 0.24,
});
registerCharacterPose("facepalm", {
  lean: 0.02,
  emotion: "sad",
  armL: [[-0.10, 0.31], [-0.14, 0.48]],
  armR: [[0.10, 0.31], [0.17, 0.20], [0.055, 0.125]],
  legL: [[-0.05, 0.55], [-0.08, 0.97]],
  legR: [[0.05, 0.55], [0.08, 0.97]],
});
registerCharacterPose("arms-crossed", {
  emotion: "determined",
  armL: [[-0.10, 0.31], [-0.02, 0.40], [0.10, 0.37]],
  armR: [[0.10, 0.31], [0.02, 0.42], [-0.10, 0.39]],
  legL: [[-0.05, 0.55], [-0.09, 0.97]],
  legR: [[0.05, 0.55], [0.09, 0.97]],
  hands: false,
  propAnchor: [0.26, 0.12],
  propSize: 0.22,
});
registerCharacterPose("halting", {
  emotion: "determined",
  armL: [[-0.10, 0.31], [-0.15, 0.48]],
  armR: [[0.10, 0.30], [0.31, 0.29]],
  legL: [[-0.05, 0.55], [-0.10, 0.97]],
  legR: [[0.05, 0.55], [0.08, 0.97]],
  propAnchor: [0.40, 0.26],
  propSize: 0.2,
});
registerCharacterPose("searching", {
  lean: 0.06,
  armL: [[-0.10, 0.31], [-0.20, 0.42]],
  armR: [[0.10, 0.31], [0.21, 0.15], [0.135, 0.08]],
  legL: [[-0.05, 0.55], [-0.08, 0.97]],
  legR: [[0.05, 0.55], [0.10, 0.97]],
  propAnchor: [-0.26, 0.44],
  propSize: 0.24,
});
registerCharacterPose("climbing", {
  emotion: "determined",
  armL: [[-0.10, 0.31], [-0.16, 0.38]],
  armR: [[0.10, 0.31], [0.14, 0.10], [0.12, -0.02]],
  legL: [[-0.05, 0.55], [-0.08, 0.97]],
  legR: [[0.05, 0.55], [0.20, 0.62], [0.16, 0.78]],
});
registerCharacterPose("falling", {
  lean: 0.16,
  emotion: "surprised",
  armL: [[-0.08, 0.31], [0.08, 0.18], [0.16, 0.10]],
  armR: [[0.10, 0.30], [0.26, 0.20], [0.32, 0.12]],
  legL: [[-0.05, 0.55], [-0.18, 0.62], [-0.28, 0.53]],
  legR: [[0.05, 0.55], [0.14, 0.78], [0.10, 0.95]],
  motion: [
    [[-0.34, 0.30], [-0.46, 0.34]],
    [[-0.32, 0.42], [-0.46, 0.44]],
  ],
});

// ---- rendering ------------------------------------------------------------------

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
  /** Mirror the pose left↔right. */
  flip?: boolean;
  z?: number;
}

/**
 * Draw a character with its FEET at `(cx, groundY)` and total height `h`.
 * Emits ordinary scene elements through `ctx` (so item scoping, presets, and
 * deterministic strokes all apply). Returns the drawn bounds.
 */
export function drawCharacter(ctx: VizContext, cx: number, groundY: number, h: number, opts: CharacterOptions = {}): { x: number; y: number; w: number; h: number } {
  const pose = POSES.get(opts.pose ?? "standing") ?? POSES.get("standing")!;
  const emotion = opts.emotion ?? pose.emotion ?? "neutral";
  const color = opts.color ?? ctx.ink;
  const shirt = opts.shirt ?? "vest";
  const shirtColor = opts.shirtColor ?? color;
  const flip = opts.flip ? -1 : 1;
  const y0 = groundY - h;
  const X = (u: number) => cx + u * flip * h;
  const Y = (u: number) => y0 + u * h;
  const P = (p: Pt): Pt => [X(p[0]), Y(p[1])];
  const lw = Math.max(1.7, h * 0.017);
  const z = opts.z;
  const lean = (pose.lean ?? 0) * flip;
  const dot = (px: number, py: number, r: number, c = color) => ctx.shape("circle", px - r, py - r, r * 2, r * 2, { stroke: c, fill: c, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: (z ?? 0) + 1, role: "character" });

  // ---- layer 1: legs (drawn first so clothing can sit over the hip joint)
  const limb = (pts: Pt[], hand: boolean) => {
    ctx.line(pts.map(P), { color, width: lw, z });
    if (hand) {
      const end = P(pts[pts.length - 1]);
      dot(end[0], end[1], Math.max(1.6, h * 0.02));
    }
  };
  limb(pose.legL, false);
  limb(pose.legR, false);
  // feet ticks (grounded feet only — a kicked-up heel keeps its bare end)
  for (const leg of [pose.legL, pose.legR]) {
    const end = leg[leg.length - 1];
    if (end[1] < 0.9) continue;
    const f = P(end);
    ctx.line([[f[0], f[1]], [f[0] + 0.05 * h * flip, f[1]]], { color, width: lw, z });
  }

  // ---- layer 2: the shirt (torso) — style variants from the workbook
  const tL = Math.min(X(-0.10), X(0.10));
  const torso = (fill: string | null, fillStyle: "none" | "solid" = fill ? "solid" : "none") =>
    ctx.shape("round-rectangle", tL, Y(0.25), 0.20 * h, 0.30 * h, { stroke: color, fill, fillStyle, strokeWidth: lw, roughness: Math.min(1.1, ctx.preset.roughness), roundness: Math.max(3, h * 0.03) }, { z, role: "character" });
  const sleeve = (side: -1 | 1) =>
    ctx.line([P([side * 0.10, 0.30]), P([side * 0.155, 0.335]), P([side * 0.145, 0.385])], { color, width: lw, z });
  switch (shirt) {
    case "tee":
      torso(ctx.preset.background);
      sleeve(-1);
      sleeve(1);
      break;
    case "striped":
      torso(ctx.preset.background);
      sleeve(-1);
      sleeve(1);
      for (const sy of [0.35, 0.41, 0.47]) ctx.line([P([-0.095, sy]), P([0.095, sy])], { color: shirtColor, width: lw * 0.7, z: (z ?? 0) + 1 });
      break;
    case "solid":
      torso(shirtColor);
      break;
    case "tie":
      torso(ctx.preset.background);
      // collar V + tie
      ctx.line([P([-0.045, 0.25]), P([0, 0.30]), P([0.045, 0.25])], { color, width: lw * 0.8, z: (z ?? 0) + 1 });
      ctx.poly([P([0, 0.30]), P([0.028, 0.345]), P([0, 0.46]), P([-0.028, 0.345])], { stroke: shirtColor, fill: shirtColor, fillStyle: "solid", strokeWidth: 1, roughness: 0.6 }, { z: (z ?? 0) + 1, role: "character" });
      break;
    case "dress": {
      const pts: Pt[] = [[-0.10, 0.25], [0.10, 0.25], [0.17, 0.62], [-0.17, 0.62]];
      ctx.poly(pts.map(P), { stroke: color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: lw, roughness: Math.min(1.1, ctx.preset.roughness) }, { z, role: "character" });
      break;
    }
    case "hoodie": {
      // hood arc behind the head (the head's background fill covers the inside)
      const hrr = 0.14 * h;
      const hcx = X(lean);
      const hcy = Y(0.105);
      const arc: Pt[] = [];
      for (let a = 200; a <= 340; a += 14) arc.push([hcx + Math.cos((a * Math.PI) / 180) * hrr, hcy + Math.sin((a * Math.PI) / 180) * hrr]);
      ctx.line(arc, { color, width: lw, z });
      torso(ctx.preset.background);
      ctx.line([P([-0.05, 0.47]), P([-0.05, 0.53]), P([0.05, 0.53]), P([0.05, 0.47])], { color, width: lw * 0.7, z: (z ?? 0) + 1 }); // pocket
      dot(X(-0.02), Y(0.29), Math.max(1, h * 0.009));
      dot(X(0.02), Y(0.29), Math.max(1, h * 0.009));
      break;
    }
    default:
      torso(null);
  }

  // ---- layer 3: arms over the shirt
  const showHands = pose.hands !== false;
  limb(pose.armL, showHands);
  limb(pose.armR, showHands);

  // ---- layer 4: neck + head + face (background-filled head keeps faces clean)
  ctx.line([P([lean * 0.9, 0.205]), P([lean * 0.25, 0.25])], { color, width: lw, z });
  const hx = X(lean);
  const hr = 0.105 * h;
  const hy = Y(0.105);
  ctx.shape("circle", hx - hr, hy - hr, hr * 2, hr * 2, { stroke: color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: lw, roughness: Math.min(1, ctx.preset.roughness) }, { z, role: "character" });

  const ex = 0.035 * h;
  const eyeY = hy - 0.015 * h;
  const dotR = Math.max(1.1, h * 0.012);
  const stroke = (pts: Pt[], w = lw * 0.8) => ctx.line(pts, { color, width: w, z: (z ?? 0) + 1 });
  const heartEye = (px: number) => {
    const r = 0.026 * h;
    ctx.poly(
      [[px, eyeY + r * 0.9], [px - r, eyeY - r * 0.25], [px - r * 0.5, eyeY - r * 0.95], [px, eyeY - r * 0.3], [px + r * 0.5, eyeY - r * 0.95], [px + r, eyeY - r * 0.25]],
      { stroke: color, fill: color, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 },
      { z: (z ?? 0) + 1, role: "character" },
    );
  };
  const starEye = (px: number) => {
    const r = 0.03 * h;
    const pts: Pt[] = [];
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([px + Math.cos(a) * rr, eyeY + Math.sin(a) * rr]);
    }
    ctx.poly(pts, { stroke: color, fill: color, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: (z ?? 0) + 1, role: "character" });
  };
  const xEye = (px: number) => {
    const r = 0.02 * h;
    stroke([[px - r, eyeY - r], [px + r, eyeY + r]], lw * 0.7);
    stroke([[px - r, eyeY + r], [px + r, eyeY - r]], lw * 0.7);
  };
  const closedEye = (px: number) => stroke([[px - 0.022 * h, eyeY], [px, eyeY + 0.012 * h], [px + 0.022 * h, eyeY]], lw * 0.7);
  switch (emotion) {
    case "surprised":
      dot(hx - ex, eyeY, dotR * 1.5);
      dot(hx + ex, eyeY, dotR * 1.5);
      break;
    case "thinking":
      dot(hx - ex, eyeY - 0.01 * h, dotR);
      dot(hx + ex, eyeY - 0.01 * h, dotR);
      break;
    case "wink":
      dot(hx - ex, eyeY, dotR);
      closedEye(hx + ex);
      break;
    case "love":
      heartEye(hx - ex);
      heartEye(hx + ex);
      break;
    case "starstruck":
      starEye(hx - ex);
      starEye(hx + ex);
      break;
    case "sleeping":
      closedEye(hx - ex);
      closedEye(hx + ex);
      break;
    case "dizzy":
      xEye(hx - ex);
      xEye(hx + ex);
      break;
    default:
      dot(hx - ex, eyeY, dotR);
      dot(hx + ex, eyeY, dotR);
  }
  const my = hy + 0.045 * h;
  const mw = 0.035 * h;
  switch (emotion) {
    case "happy":
    case "excited":
    case "wink":
    case "love":
      stroke([[hx - mw, my - 0.008 * h], [hx, my + 0.012 * h], [hx + mw, my - 0.008 * h]]);
      break;
    case "starstruck": {
      const r = 0.02 * h;
      ctx.shape("circle", hx - r, my - r * 0.6, r * 2, r * 1.6, { stroke: color, fill: null, fillStyle: "none", strokeWidth: lw * 0.7, roughness: 0.5 }, { z: (z ?? 0) + 1, role: "character" });
      break;
    }
    case "sleeping":
      stroke([[hx - mw * 0.5, my + 0.004 * h], [hx + mw * 0.5, my + 0.004 * h]]);
      ctx.label("z", hx + hr + 0.05 * h, hy - 0.09 * h, { size: Math.max(9, 0.085 * h), color, weight: 700, font: "heading", z: (z ?? 0) + 1, role: "character" });
      ctx.label("Z", hx + hr + 0.11 * h, hy - 0.16 * h, { size: Math.max(11, 0.11 * h), color, weight: 700, font: "heading", z: (z ?? 0) + 1, role: "character" });
      break;
    case "dizzy":
      stroke([[hx - mw, my], [hx - mw * 0.33, my + 0.012 * h], [hx + mw * 0.33, my - 0.006 * h], [hx + mw, my + 0.008 * h]]);
      break;
    case "sad":
    case "confused":
      stroke([[hx - mw, my + 0.012 * h], [hx, my - 0.008 * h], [hx + mw, my + 0.012 * h]]);
      break;
    case "surprised": {
      const r = 0.018 * h;
      ctx.shape("circle", hx - r, my - r, r * 2, r * 2, { stroke: color, fill: null, fillStyle: "none", strokeWidth: lw * 0.7, roughness: 0.5 }, { z: (z ?? 0) + 1, role: "character" });
      break;
    }
    case "angry":
    case "determined":
      stroke([[hx - mw, my + 0.004 * h], [hx + mw, my + 0.004 * h]]);
      stroke([[hx - ex - 0.02 * h, eyeY - 0.032 * h], [hx - ex + 0.012 * h, eyeY - 0.018 * h]]);
      stroke([[hx + ex + 0.02 * h, eyeY - 0.032 * h], [hx + ex - 0.012 * h, eyeY - 0.018 * h]]);
      break;
    case "thinking":
      stroke([[hx - mw * 0.6, my + 0.004 * h], [hx + mw * 0.6, my]]);
      break;
    default:
      stroke([[hx - mw * 0.8, my], [hx + mw * 0.8, my]]);
  }
  if (emotion === "confused") stroke([[hx + hr + 0.015 * h, hy - 0.04 * h], [hx + hr + 0.035 * h, hy + 0.01 * h]]);

  // ---- layer 5: motion lines + prop
  for (const [a, b] of pose.motion ?? []) ctx.line([P(a), P(b)], { color, width: lw * 0.8, z });
  if (opts.prop && iconEntry(opts.prop)) {
    const anchor = pose.propAnchor ?? pose.armR[pose.armR.length - 1];
    const size = (pose.propSize ?? 0.3) * h;
    ctx.icon(opts.prop, X(anchor[0]), Y(anchor[1]) - size * 0.28, size, opts.propColor ?? color, (z ?? 0) + 2);
  }

  // bounds (generous: pose extents + prop overhead)
  const xs: number[] = [];
  const ys: number[] = [0, 1];
  for (const l of [pose.armL, pose.armR, pose.legL, pose.legR]) for (const p of l) { xs.push(p[0]); ys.push(p[1]); }
  const minX = Math.min(-0.18, ...xs) - 0.04; // ±0.18 covers the widest shirts (dress)
  const maxX = Math.max(0.18, ...xs) + 0.04;
  const minY = Math.min(-0.14, ...ys);
  return { x: cx + (flip > 0 ? minX : -maxX) * h, y: y0 + minY * h, w: (maxX - minX) * h, h: (1 - minY) * h };
}
