/**
 * Pose library — limb polylines in the unit frame (see types.ts). Arms are
 * authored UN-sheared; the renderer shears them forward with the pose's
 * `lean`, so a forward-leaning pose only needs to describe the gesture, not
 * compensate for the tilt. Grounded feet MUST end at y = 1.0 (GROUND_Y);
 * lifted feet stay above and skip the foot tick. Poses that leave the ground
 * set `airborne: true`.
 */

import { registerCharacterPose } from "./registry.js";

// standard grounded legs (slight A-stance)
const LEG_L: [number, number][] = [[-0.05, 0.55], [-0.1, 1.0]];
const LEG_R: [number, number][] = [[0.05, 0.55], [0.1, 1.0]];
// arms hanging at the sides
const ARM_L: [number, number][] = [[-0.1, 0.31], [-0.17, 0.47]];
const ARM_R: [number, number][] = [[0.1, 0.31], [0.17, 0.47]];

// ---- static / standing --------------------------------------------------------

registerCharacterPose("standing", { about: "at rest, arms at sides", armL: ARM_L, armR: ARM_R, legL: LEG_L, legR: LEG_R, propAnchor: [0.27, 0.1], propSize: 0.24 });
registerCharacterPose("confident", { about: "hands on hips, chest out", emotion: "determined", armL: [[-0.1, 0.31], [-0.21, 0.42], [-0.08, 0.52]], armR: [[0.1, 0.31], [0.21, 0.42], [0.08, 0.52]], legL: LEG_L, legR: LEG_R, hands: false, propAnchor: [0.27, 0.1], propSize: 0.24 });
registerCharacterPose("arms-crossed", { about: "arms folded across the chest", emotion: "determined", armL: [[-0.1, 0.31], [-0.02, 0.4], [0.1, 0.37]], armR: [[0.1, 0.31], [0.02, 0.42], [-0.1, 0.39]], legL: LEG_L, legR: LEG_R, hands: false, propAnchor: [0.26, 0.12], propSize: 0.22 });
registerCharacterPose("leaning", { about: "weight on one leg, ankles crossed", emotion: "smug", armL: [[-0.1, 0.31], [-0.18, 0.42], [-0.06, 0.5]], armR: [[0.1, 0.31], [0.24, 0.35]], legL: [[-0.05, 0.55], [-0.02, 1.0]], legR: [[0.05, 0.55], [-0.05, 0.98], [0.05, 1.0]], hands: false });
registerCharacterPose("strolling", { about: "hands in pockets, ambling along", emotion: "content", armL: [[-0.1, 0.31], [-0.12, 0.46], [-0.06, 0.5]], armR: [[0.1, 0.31], [0.12, 0.46], [0.06, 0.5]], legL: [[-0.05, 0.55], [-0.12, 0.78], [-0.15, 1.0]], legR: [[0.05, 0.55], [0.12, 0.78], [0.15, 1.0]], hands: false });

// ---- gesturing ----------------------------------------------------------------

registerCharacterPose("waving", { about: "one arm up, waving hello", emotion: "happy", armL: ARM_L, armR: [[0.1, 0.31], [0.2, 0.17], [0.27, 0.07]], legL: LEG_L, legR: LEG_R, propAnchor: [0.29, 0.04] });
registerCharacterPose("waving-both", { about: "both arms up, waving", emotion: "happy", armL: [[-0.1, 0.31], [-0.2, 0.14], [-0.26, 0.06]], armR: [[0.1, 0.31], [0.2, 0.14], [0.26, 0.06]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("pointing", { about: "pointing off to the side", armL: [[-0.1, 0.31], [-0.15, 0.48]], armR: [[0.1, 0.31], [0.24, 0.29], [0.34, 0.27]], legL: LEG_L, legR: LEG_R, propAnchor: [0.4, 0.24] });
registerCharacterPose("presenting", { about: "gesturing to what's beside them", emotion: "happy", armL: [[-0.1, 0.31], [-0.19, 0.45]], armR: [[0.1, 0.31], [0.24, 0.38], [0.33, 0.36]], legL: LEG_L, legR: LEG_R, propAnchor: [0.36, 0.3] });
registerCharacterPose("offering", { about: "a hand extended, offering or receiving", emotion: "happy", armL: [[-0.1, 0.31], [-0.16, 0.47]], armR: [[0.1, 0.31], [0.22, 0.4], [0.33, 0.42]], legL: LEG_L, legR: LEG_R, propAnchor: [0.37, 0.4], propSize: 0.22 });
registerCharacterPose("halting", { about: 'palm out — "stop"', emotion: "determined", armL: [[-0.1, 0.31], [-0.15, 0.48]], armR: [[0.1, 0.3], [0.31, 0.29]], legL: LEG_L, legR: LEG_R, propAnchor: [0.4, 0.26], propSize: 0.2 });
registerCharacterPose("hands-up", { about: "both palms raised — stop or surrender", emotion: "surprised", armL: [[-0.1, 0.31], [-0.14, 0.3], [-0.14, 0.14]], armR: [[0.1, 0.31], [0.14, 0.3], [0.14, 0.14]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("shrugging", { about: "palms up, shoulders raised", emotion: "confused", armL: [[-0.1, 0.31], [-0.22, 0.36], [-0.3, 0.28]], armR: [[0.1, 0.31], [0.22, 0.36], [0.3, 0.28]], legL: LEG_L, legR: LEG_R, propAnchor: [0, -0.12], propSize: 0.24 });

// ---- head / hands -------------------------------------------------------------

registerCharacterPose("thinking", { about: "finger to temple, an idea forming", emotion: "thinking", armL: [[-0.1, 0.31], [-0.16, 0.48]], armR: [[0.1, 0.31], [0.19, 0.24], [0.09, 0.185]], legL: LEG_L, legR: LEG_R, propAnchor: [0.3, 0.02], propSize: 0.24 });
registerCharacterPose("chin-thinking", { about: "hand on chin, pondering", emotion: "thinking", armL: [[-0.1, 0.31], [-0.04, 0.42], [0.06, 0.4]], armR: [[0.1, 0.31], [0.1, 0.24], [0.02, 0.2]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("listening", { about: "hand cupped to the ear", emotion: "curious", armL: ARM_L, armR: [[0.1, 0.31], [0.17, 0.2], [0.12, 0.12]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("facepalm", { about: "hand to the face, exasperated", lean: 0.02, emotion: "sad", armL: [[-0.1, 0.31], [-0.14, 0.48]], armR: [[0.1, 0.31], [0.17, 0.2], [0.055, 0.125]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("peering", { about: "leaning in for a closer look", lean: 0.07, emotion: "surprised", armL: [[-0.1, 0.31], [-0.13, 0.48]], armR: [[0.1, 0.31], [0.21, 0.4]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("searching", { about: "hand shading the eyes, looking out", lean: 0.06, armL: [[-0.1, 0.31], [-0.2, 0.42]], armR: [[0.1, 0.31], [0.21, 0.15], [0.135, 0.08]], legL: LEG_L, legR: LEG_R, propAnchor: [-0.26, 0.44], propSize: 0.24 });

// ---- celebrating --------------------------------------------------------------

registerCharacterPose("cheering", { about: "both fists up, celebrating", emotion: "excited", armL: [[-0.1, 0.31], [-0.2, 0.16], [-0.25, 0.06]], armR: [[0.1, 0.31], [0.2, 0.16], [0.25, 0.06]], legL: LEG_L, legR: LEG_R, motion: [[[-0.1, 0.02], [-0.14, -0.04]], [[0, -0.02], [0, -0.09]], [[0.1, 0.02], [0.14, -0.04]]], propAnchor: [0, -0.1], propSize: 0.26 });
registerCharacterPose("victory", { about: "one fist raised high", emotion: "excited", armL: ARM_L, armR: [[0.1, 0.31], [0.16, 0.14], [0.18, 0.02]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("holding-overhead", { about: "hoisting something overhead", emotion: "happy", armL: [[-0.1, 0.31], [-0.17, 0.12], [-0.11, -0.05]], armR: [[0.1, 0.31], [0.17, 0.12], [0.11, -0.05]], legL: LEG_L, legR: LEG_R, propAnchor: [0, -0.175], propSize: 0.3, hands: false });
registerCharacterPose("reaching-up", { about: "both arms stretched up to reach", emotion: "determined", armL: [[-0.1, 0.31], [-0.13, 0.1], [-0.14, -0.04]], armR: [[0.1, 0.31], [0.13, 0.1], [0.14, -0.04]], legL: LEG_L, legR: LEG_R, propAnchor: [0, -0.1], propSize: 0.26, hands: false });
registerCharacterPose("dancing", { about: "mid-dance, one arm up", emotion: "happy", fx: "music", armL: [[-0.1, 0.31], [-0.2, 0.16], [-0.24, 0.05]], armR: [[0.1, 0.31], [0.22, 0.4], [0.3, 0.34]], legL: [[-0.05, 0.55], [-0.16, 0.78], [-0.2, 1.0]], legR: [[0.05, 0.55], [0.1, 0.74], [0.06, 1.0]] });
registerCharacterPose("stretching", { about: "arms up and back in a big stretch", lean: -0.05, emotion: "calm", armL: [[-0.1, 0.3], [-0.16, 0.14], [-0.2, 0.06]], armR: [[0.1, 0.3], [0.16, 0.14], [0.2, 0.06]], legL: LEG_L, legR: LEG_R });
registerCharacterPose("star-pose", { about: "star jump — arms and legs spread wide", emotion: "excited", armL: [[-0.1, 0.3], [-0.22, 0.16], [-0.3, 0.06]], armR: [[0.1, 0.3], [0.22, 0.16], [0.3, 0.06]], legL: [[-0.05, 0.55], [-0.2, 1.0]], legR: [[0.05, 0.55], [0.2, 1.0]] });

// ---- locomotion ---------------------------------------------------------------

registerCharacterPose("walking", { about: "mid-stride, walking", lean: 0.03, armL: [[-0.1, 0.31], [-0.19, 0.45]], armR: [[0.1, 0.31], [0.19, 0.44]], legL: [[-0.05, 0.55], [-0.13, 0.78], [-0.16, 1.0]], legR: [[0.05, 0.55], [0.14, 0.78], [0.17, 1.0]] });
registerCharacterPose("marching", { about: "marching, one knee raised high", emotion: "determined", armL: [[-0.1, 0.31], [-0.16, 0.24], [-0.14, 0.16]], armR: [[0.1, 0.31], [0.16, 0.44]], legL: [[-0.05, 0.55], [-0.08, 0.74], [-0.1, 1.0]], legR: [[0.05, 0.55], [0.16, 0.68], [0.13, 0.82]] });
registerCharacterPose("tiptoeing", { about: "sneaking on tiptoe", lean: 0.08, emotion: "smug", armL: [[-0.1, 0.31], [-0.19, 0.28], [-0.26, 0.3]], armR: [[0.1, 0.31], [0.19, 0.28], [0.26, 0.3]], legL: [[-0.05, 0.55], [-0.13, 0.8], [-0.17, 0.98]], legR: [[0.05, 0.55], [0.13, 0.8], [0.17, 0.98]] });
registerCharacterPose("running", { about: "running at full tilt, mid-flight", lean: 0.13, emotion: "determined", airborne: true, armL: [[-0.1, 0.3], [-0.2, 0.36], [-0.26, 0.44]], armR: [[0.1, 0.3], [0.2, 0.26], [0.26, 0.17]], legL: [[-0.05, 0.55], [-0.18, 0.7], [-0.28, 0.74]], legR: [[0.05, 0.55], [0.16, 0.72], [0.22, 0.66]], motion: [[[-0.32, 0.3], [-0.52, 0.3]], [[-0.34, 0.4], [-0.56, 0.4]], [[-0.32, 0.5], [-0.5, 0.5]]] });
registerCharacterPose("jumping", { about: "leaping upward, knees tucked", emotion: "excited", airborne: true, armL: [[-0.1, 0.31], [-0.2, 0.18], [-0.24, 0.08]], armR: [[0.1, 0.31], [0.2, 0.18], [0.24, 0.08]], legL: [[-0.05, 0.55], [-0.15, 0.68], [-0.11, 0.8]], legR: [[0.05, 0.55], [0.15, 0.68], [0.11, 0.8]], motion: [[[-0.1, 0.98], [-0.03, 0.98]], [[0.03, 1.0], [0.1, 1.0]], [[-0.04, 1.03], [0.04, 1.03]]], propAnchor: [0, -0.12], propSize: 0.26 });
registerCharacterPose("kicking", { about: "kicking a leg forward", emotion: "determined", armL: [[-0.1, 0.31], [-0.2, 0.24]], armR: [[0.1, 0.31], [0.2, 0.4]], legL: [[-0.05, 0.55], [-0.1, 1.0]], legR: [[0.05, 0.55], [0.2, 0.6], [0.34, 0.52]] });

// ---- effort -------------------------------------------------------------------

registerCharacterPose("pushing", { about: "shoving something heavy forward", lean: 0.1, emotion: "determined", armL: [[-0.1, 0.31], [0.06, 0.3], [0.3, 0.3]], armR: [[0.1, 0.31], [0.22, 0.33], [0.34, 0.35]], legL: [[-0.05, 0.55], [-0.18, 0.76], [-0.3, 1.0]], legR: [[0.05, 0.55], [0.14, 0.74], [0.16, 1.0]] });
registerCharacterPose("pulling", { about: "hauling something in on a rope", lean: -0.07, emotion: "determined", armL: [[-0.1, 0.31], [0.08, 0.38], [0.24, 0.42]], armR: [[0.1, 0.31], [0.22, 0.4], [0.34, 0.46]], legL: [[-0.05, 0.55], [-0.16, 0.76], [-0.24, 1.0]], legR: [[0.05, 0.55], [0.14, 0.76], [0.2, 1.0]] });
registerCharacterPose("carrying", { about: "carrying something in both arms", armL: [[-0.1, 0.31], [-0.13, 0.42], [-0.04, 0.4]], armR: [[0.1, 0.31], [0.13, 0.42], [0.04, 0.4]], legL: LEG_L, legR: LEG_R, hands: false, propAnchor: [0, 0.36], propSize: 0.24 });
registerCharacterPose("throwing", { about: "winding up to throw", lean: 0.08, emotion: "determined", armL: [[-0.1, 0.31], [-0.2, 0.34]], armR: [[0.1, 0.3], [0.18, 0.16], [0.14, 0.05]], legL: [[-0.05, 0.55], [-0.16, 1.0]], legR: [[0.05, 0.55], [0.14, 1.0]], propAnchor: [0.14, 0.02], propSize: 0.16 });
registerCharacterPose("bending", { about: "bending forward to pick something up", lean: 0.14, armL: [[-0.1, 0.32], [-0.1, 0.5], [-0.06, 0.66]], armR: [[0.1, 0.32], [0.12, 0.5], [0.08, 0.66]], legL: LEG_L, legR: LEG_R, propAnchor: [0.02, 0.66], propSize: 0.2 });
registerCharacterPose("climbing", { about: "climbing up, reaching for the next hold", emotion: "determined", armL: [[-0.1, 0.31], [-0.16, 0.38]], armR: [[0.1, 0.31], [0.14, 0.1], [0.12, -0.02]], legL: [[-0.05, 0.55], [-0.08, 1.0]], legR: [[0.05, 0.55], [0.2, 0.62], [0.16, 0.78]] });

// ---- low / grounded -----------------------------------------------------------

registerCharacterPose("sitting", { about: "seated, hands on the knees", armL: [[-0.1, 0.31], [-0.06, 0.44], [0.06, 0.48]], armR: [[0.1, 0.31], [0.14, 0.44], [0.1, 0.5]], legL: [[-0.05, 0.55], [0.16, 0.7], [0.14, 1.0]], legR: [[0.05, 0.55], [0.22, 0.72], [0.2, 1.0]], propAnchor: [0.16, 0.42], propSize: 0.22 });
registerCharacterPose("kneeling", { about: "down on one knee", armL: [[-0.1, 0.31], [-0.16, 0.47]], armR: [[0.1, 0.31], [0.16, 0.52], [0.14, 0.66]], legL: [[-0.05, 0.55], [-0.14, 0.78], [-0.14, 1.0]], legR: [[0.05, 0.55], [0.12, 0.82], [0.24, 1.0]] });
registerCharacterPose("meditating", { about: "cross-legged, calm and centred", emotion: "calm", armL: [[-0.1, 0.31], [-0.2, 0.48], [-0.15, 0.58]], armR: [[0.1, 0.31], [0.2, 0.48], [0.15, 0.58]], legL: [[-0.05, 0.55], [-0.24, 0.82], [0.08, 0.88]], legR: [[0.05, 0.55], [0.24, 0.82], [-0.08, 0.88]], propAnchor: [0, -0.14], propSize: 0.24 });
registerCharacterPose("bowing", { about: "bowing forward, deferential", lean: 0.18, emotion: "calm", armL: [[-0.1, 0.31], [-0.06, 0.46]], armR: [[0.1, 0.31], [0.06, 0.46]], legL: LEG_L, legR: LEG_R });

// ---- balance / off-balance ----------------------------------------------------

registerCharacterPose("balancing", { about: "arms out, balancing on one foot", emotion: "surprised", armL: [[-0.1, 0.31], [-0.28, 0.28]], armR: [[0.1, 0.31], [0.28, 0.28]], legL: [[-0.05, 0.55], [-0.06, 1.0]], legR: [[0.05, 0.55], [0.16, 0.72], [0.24, 0.66]] });
registerCharacterPose("falling", { about: "off balance, arms flailing", lean: -0.14, emotion: "scared", airborne: true, armL: [[-0.1, 0.31], [-0.22, 0.22], [-0.28, 0.12]], armR: [[0.1, 0.3], [0.2, 0.16], [0.24, 0.04]], legL: [[-0.05, 0.55], [-0.1, 0.74], [-0.04, 0.86]], legR: [[0.05, 0.55], [0.2, 0.62], [0.34, 0.56]], motion: [[[-0.3, 0.32], [-0.46, 0.36]], [[-0.28, 0.44], [-0.44, 0.46]]] });
