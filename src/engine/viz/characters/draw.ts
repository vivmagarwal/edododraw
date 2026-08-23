/**
 * The character renderer. Builds a CharacterFrame (all coordinates
 * pre-transformed) and drives the per-axis drawers in paint order:
 *
 *   legs → shirt/torso → arms → neck+head → hair → face → accessory
 *        → motion+prop → fx
 *
 * The lean model is the key correctness invariant: the upper body (head,
 * neck, torso, arms, face, hair, accessory) is SHEARED forward by the pose's
 * `lean` — everything above the hips tilts together, so a leaning figure's
 * head never floats off its torso. Legs are never sheared, so the feet stay
 * planted where the pose authored them.
 */

import type { VizContext } from "../context.js";
import type { StylePreset } from "../../style/presets.js";
import { contrastInk, luma, parseHex } from "../../style/color.js";
import { iconEntry } from "../icons.js";
import {
  type CharacterOptions,
  type CharacterFrame,
  type Pt,
  HIP_Y,
  HEAD_Y,
  HEAD_R,
  AIRBORNE_Y,
} from "./types.js";
// note: motion streaks render UN-sheared (they belong to the world, not the body)
import {
  getCharacterPose,
  getCharacterEmotion,
  getCharacterShirt,
  getCharacterHair,
  getCharacterAccessory,
  getCharacterFx,
} from "./registry.js";

/** Smallest luma gap (0..255) between a figure's ink and the canvas that still
 *  reads as a drawn line. Line art has no fill to fall back on, so the bar is
 *  low but non-zero. */
const MIN_INK_CONTRAST = 40;

/**
 * The ink a figure is actually drawn in.
 *
 * A character is LINE ART: if its stroke matches the canvas the whole figure
 * disappears. Some presets legitimately hand shapes a background-coloured
 * outline — `mono-accent`'s `strokeMode: "seam"` makes adjacent solid blocks
 * read as cut-outs — which is right for a filled rectangle and fatal for a
 * stick figure. So the requested ink is checked against the preset background
 * and, when it would vanish, falls back to the preset ink (then to plain
 * contrast ink). Nothing is hardcoded: every candidate comes from the preset.
 * Non-hex colours are trusted as-is (we can't measure them).
 */
export function characterInk(want: string | undefined, preset: StylePreset): string {
  const wanted = want ?? preset.ink;
  const bg = preset.background;
  if (!parseHex(wanted) || !parseHex(bg)) return wanted;
  const reads = (c: string) => Math.abs(luma(c) - luma(bg)) >= MIN_INK_CONTRAST;
  if (reads(wanted)) return wanted;
  if (reads(preset.ink)) return preset.ink;
  return contrastInk(bg);
}

/** Shear weight: 1 at/above head height, 0 at the hips, clamped. */
function shearWeight(y: number): number {
  const t = (HIP_Y - y) / (HIP_Y - HEAD_Y);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Draw a character with its FEET at `(cx, groundY)` and total height `h`.
 * Emits ordinary scene elements through `ctx` (so item scoping, presets, and
 * deterministic strokes all apply). Returns the drawn bounds.
 */
export function drawCharacter(
  ctx: VizContext,
  cx: number,
  groundY: number,
  h: number,
  opts: CharacterOptions = {},
): { x: number; y: number; w: number; h: number } {
  const pose = getCharacterPose(opts.pose ?? "standing") ?? getCharacterPose("standing")!;
  const emotion = opts.emotion ?? pose.emotion ?? "neutral";
  const color = characterInk(opts.color ?? ctx.ink, ctx.preset);
  const flip: 1 | -1 = opts.flip ? -1 : 1;
  const y0 = groundY - h;
  const z = opts.z ?? 0;
  const lw = Math.max(1.7, h * 0.017);
  const lean = pose.lean ?? 0;

  const Y = (u: number): number => y0 + u * h;
  const Xr = (u: number): number => cx + u * flip * h;
  const P = (p: Pt): Pt => [Xr(p[0]), Y(p[1])];
  const T = (p: Pt): Pt => [Xr(p[0] + lean * shearWeight(p[1])), Y(p[1])];

  const dot = (px: number, py: number, r: number, c = color) =>
    ctx.shape("circle", px - r, py - r, r * 2, r * 2, { stroke: c, fill: c, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: z + 1, role: "character" });
  const stroke = (pts: Pt[], w = lw * 0.8, c = color) => ctx.line(pts, { color: c, width: w, z: z + 1 });
  const fill = (pts: Pt[], c = color) => ctx.poly(pts, { stroke: c, fill: c, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: z + 1, role: "character" });
  const arc = (acx: number, acy: number, r: number, from: number, to: number, steps = 12): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
      out.push([acx + Math.cos(a) * r, acy + Math.sin(a) * r]);
    }
    return out;
  };

  // Head / torso / face anchors (all sheared with the upper body).
  const headCenter = T([0, HEAD_Y]);
  const head = { cx: headCenter[0], cy: headCenter[1], r: HEAD_R * h };
  const torso: [Pt, Pt, Pt, Pt] = [T([-0.1, 0.25]), T([0.1, 0.25]), T([0.1, HIP_Y]), T([-0.1, HIP_Y])];
  const ex = 0.035 * h;
  const face = {
    eyeL: head.cx - ex,
    eyeR: head.cx + ex,
    eyeY: head.cy - 0.015 * h,
    mouthY: head.cy + 0.045 * h,
    eyeR2: Math.max(1.1, h * 0.012),
  };

  const frame: CharacterFrame = {
    ctx,
    h,
    color,
    accent: color,
    lw,
    z,
    flip,
    T,
    P,
    head,
    torso,
    face,
    stroke,
    dot,
    fill,
    arc,
  };

  // ---- layer 1: legs (unsheared — planted) + feet ticks
  const limb = (pts: Pt[], tf: (p: Pt) => Pt, hand: boolean) => {
    ctx.line(pts.map(tf), { color, width: lw, z });
    if (hand) {
      const end = tf(pts[pts.length - 1]);
      dot(end[0], end[1], Math.max(1.6, h * 0.02));
    }
  };
  limb(pose.legL, P, false);
  limb(pose.legR, P, false);
  if (!pose.airborne) {
    for (const leg of [pose.legL, pose.legR]) {
      const end = leg[leg.length - 1];
      if (end[1] < AIRBORNE_Y) continue; // a lifted heel keeps its bare end
      const f = P(end);
      ctx.line([[f[0], f[1]], [f[0] + 0.05 * h * flip, f[1]]], { color, width: lw, z });
    }
  }

  // ---- layer 2: shirt / torso
  frame.accent = opts.shirtColor ?? color;
  const shirtDraw = getCharacterShirt(opts.shirt ?? "vest") ?? getCharacterShirt("vest")!;
  shirtDraw(frame);

  // ---- layer 3: arms over the shirt (sheared)
  const showHands = pose.hands !== false;
  limb(pose.armL, T, showHands);
  limb(pose.armR, T, showHands);

  // ---- layer 4: neck + head (background-filled head keeps faces clean)
  ctx.line([[head.cx, head.cy + head.r * 0.86], T([0, 0.25])], { color, width: lw, z });
  ctx.shape("circle", head.cx - head.r, head.cy - head.r, head.r * 2, head.r * 2, { stroke: color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: lw, roughness: Math.min(1, ctx.preset.roughness) }, { z, role: "character" });

  // ---- layer 5: hair (on the head rim, under the face)
  if (opts.hair && opts.hair !== "none") {
    frame.accent = opts.hairColor ?? color;
    getCharacterHair(opts.hair)?.(frame);
  }

  // ---- layer 6: face
  frame.accent = color;
  (getCharacterEmotion(emotion) ?? getCharacterEmotion("neutral")!)(frame);

  // ---- layer 7: worn accessory (over the face — glasses, hat, beard)
  if (opts.accessory && opts.accessory !== "none") {
    frame.accent = opts.accessoryColor ?? color;
    getCharacterAccessory(opts.accessory)?.(frame);
  }

  // ---- layer 8: motion lines + prop
  for (const [a, b] of pose.motion ?? []) ctx.line([P(a), P(b)], { color, width: lw * 0.8, z });
  if (opts.prop && iconEntry(opts.prop)) {
    const anchor = pose.propAnchor ?? pose.armR[pose.armR.length - 1];
    const size = (pose.propSize ?? 0.3) * h;
    const a = T(anchor);
    ctx.icon(opts.prop, a[0], a[1] - size * 0.28, size, opts.propColor ?? color, z + 2);
  }

  // ---- layer 9: floating state mark
  const fx = opts.fx ?? pose.fx;
  if (fx && fx !== "none") {
    frame.accent = opts.fxColor ?? color;
    getCharacterFx(fx)?.(frame);
  }

  // ---- bounds (pose extents + prop overhead + motion streaks)
  const xs: number[] = [];
  const ys: number[] = [0, 1];
  for (const l of [pose.armL, pose.armR]) for (const p of l) { xs.push(p[0] + lean * shearWeight(p[1])); ys.push(p[1]); }
  for (const l of [pose.legL, pose.legR]) for (const p of l) { xs.push(p[0]); ys.push(p[1]); }
  for (const [a, b] of pose.motion ?? []) { xs.push(a[0], b[0]); ys.push(a[1], b[1]); }
  const minX = Math.min(-0.18, ...xs) - 0.05;
  const maxX = Math.max(0.18, ...xs) + 0.05;
  const minY = Math.min(-0.16, ...ys);
  return { x: cx + (flip > 0 ? minX : -maxX) * h, y: y0 + minY * h, w: (maxX - minX) * h, h: (1 - minY) * h };
}
