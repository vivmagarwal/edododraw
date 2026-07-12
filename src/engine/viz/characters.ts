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

export const CHARACTER_EMOTIONS = ["neutral", "happy", "sad", "surprised", "angry", "excited", "confused", "thinking", "determined"] as const;

export function listCharacterEmotions(): string[] {
  return [...CHARACTER_EMOTIONS];
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
  lean: 0.10,
  emotion: "determined",
  armL: [[-0.08, 0.31], [0.06, 0.36], [0.16, 0.28]],
  armR: [[0.10, 0.31], [-0.02, 0.40], [-0.12, 0.34]],
  legL: [[-0.03, 0.55], [0.14, 0.70], [0.20, 0.90]],
  legR: [[0.05, 0.55], [-0.10, 0.72], [-0.20, 0.88]],
  motion: [
    [[-0.30, 0.40], [-0.42, 0.40]],
    [[-0.28, 0.50], [-0.44, 0.50]],
    [[-0.30, 0.60], [-0.40, 0.60]],
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
  armL: [[-0.10, 0.31], [-0.11, 0.14], [-0.07, 0.015]],
  armR: [[0.10, 0.31], [0.11, 0.14], [0.07, 0.015]],
  legL: [[-0.05, 0.55], [-0.11, 0.97]],
  legR: [[0.05, 0.55], [0.11, 0.97]],
  propAnchor: [0, -0.10],
  propSize: 0.32,
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
  lean: -0.08,
  emotion: "determined",
  armL: [[-0.08, 0.31], [0.10, 0.36], [0.24, 0.40]],
  armR: [[0.10, 0.31], [0.22, 0.37], [0.30, 0.42]],
  legL: [[-0.05, 0.55], [-0.20, 0.75], [-0.26, 0.96]],
  legR: [[0.05, 0.55], [-0.04, 0.78], [-0.06, 0.97]],
  hands: false,
});
registerCharacterPose("peering", {
  lean: 0.07,
  emotion: "surprised",
  armL: [[-0.10, 0.31], [-0.13, 0.48]],
  armR: [[0.10, 0.31], [0.21, 0.40]],
  legL: [[-0.05, 0.55], [-0.09, 0.97]],
  legR: [[0.05, 0.55], [0.07, 0.97]],
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
  const flip = opts.flip ? -1 : 1;
  const y0 = groundY - h;
  const X = (u: number) => cx + u * flip * h;
  const Y = (u: number) => y0 + u * h;
  const P = (p: Pt): Pt => [X(p[0]), Y(p[1])];
  const lw = Math.max(1.7, h * 0.017);
  const z = opts.z;

  // head (kept "white inside" so background lines never cross the face)
  const lean = (pose.lean ?? 0) * flip;
  const hx = X(lean);
  const hr = 0.105 * h;
  const hy = Y(0.105);
  ctx.shape("circle", hx - hr, hy - hr, hr * 2, hr * 2, { stroke: color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: lw, roughness: Math.min(1, ctx.preset.roughness) }, { z, role: "character" });

  // face: two dot eyes + emotion mouth (+ brows/extras per emotion)
  const ex = 0.035 * h;
  const eyeY = hy - 0.015 * h;
  const dotR = Math.max(1.1, h * 0.012);
  const dot = (px: number, py: number, r = dotR) => ctx.shape("circle", px - r, py - r, r * 2, r * 2, { stroke: color, fill: color, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: (z ?? 0) + 1, role: "character" });
  const stroke = (pts: Pt[], w = lw * 0.8) => ctx.line(pts, { color, width: w, z: (z ?? 0) + 1 });
  if (emotion === "surprised") {
    dot(hx - ex, eyeY, dotR * 1.5);
    dot(hx + ex, eyeY, dotR * 1.5);
  } else if (emotion === "thinking") {
    dot(hx - ex, eyeY - 0.01 * h);
    dot(hx + ex, eyeY - 0.01 * h);
  } else {
    dot(hx - ex, eyeY);
    dot(hx + ex, eyeY);
  }
  const my = hy + 0.045 * h;
  const mw = 0.035 * h;
  switch (emotion) {
    case "happy":
    case "excited":
      stroke([[hx - mw, my - 0.008 * h], [hx, my + 0.012 * h], [hx + mw, my - 0.008 * h]]);
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

  // neck + vest torso (outline, not a bare stick)
  ctx.line([P([lean * 0.5, 0.21]), P([0, 0.25])], { color, width: lw, z });
  ctx.shape("round-rectangle", X(-0.10), Y(0.25), 0.20 * h, 0.30 * h, { stroke: color, fill: null, fillStyle: "none", strokeWidth: lw, roughness: Math.min(1.1, ctx.preset.roughness), roundness: Math.max(3, h * 0.03) }, { z, role: "character" });

  // limbs + blobs
  const limb = (pts: Pt[], hand: boolean) => {
    ctx.line(pts.map(P), { color, width: lw, z });
    if (hand) {
      const end = P(pts[pts.length - 1]);
      dot(end[0], end[1], Math.max(1.6, h * 0.02));
    }
  };
  const showHands = pose.hands !== false;
  limb(pose.armL, showHands);
  limb(pose.armR, showHands);
  limb(pose.legL, false);
  limb(pose.legR, false);
  // feet ticks
  for (const leg of [pose.legL, pose.legR]) {
    const f = P(leg[leg.length - 1]);
    ctx.line([[f[0], f[1]], [f[0] + 0.05 * h * flip, f[1]]], { color, width: lw, z });
  }

  // motion lines
  for (const [a, b] of pose.motion ?? []) ctx.line([P(a), P(b)], { color, width: lw * 0.8, z });

  // prop: any registered icon, held at the pose's anchor
  if (opts.prop && iconEntry(opts.prop)) {
    const anchor = pose.propAnchor ?? pose.armR[pose.armR.length - 1];
    const size = (pose.propSize ?? 0.3) * h;
    ctx.icon(opts.prop, X(anchor[0]), Y(anchor[1]) - size * 0.28, size, opts.propColor ?? color, (z ?? 0) + 2);
  }

  // bounds (generous: pose extents + prop overhead)
  const xs: number[] = [];
  const ys: number[] = [0, 1];
  for (const l of [pose.armL, pose.armR, pose.legL, pose.legR]) for (const p of l) { xs.push(p[0]); ys.push(p[1]); }
  const minX = Math.min(-0.14, ...xs) - 0.04;
  const maxX = Math.max(0.14, ...xs) + 0.04;
  const minY = Math.min(-0.14, ...ys);
  return { x: cx + (flip > 0 ? minX : -maxX) * h, y: y0 + minY * h, w: (maxX - minX) * h, h: (1 - minY) * h };
}
