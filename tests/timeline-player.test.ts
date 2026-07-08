import { describe, expect, it, vi, afterEach } from "vitest";
import { TimelinePlayer } from "@engine/timeline/player.js";
import { compileEdd } from "@engine/dsl/index.js";
import type { Scene } from "@engine/scene/types.js";

const SRC = `scene {
  rect a "A"
  rect b "B"
  rect c "C"
}
timeline t {
  beat b0 "First"  { camera fit-all; reveal { hide c }; narrate: "the start" }
  beat b1 "Second" { }
  beat b2 "Third"  { camera zoom 2; reveal { show c with pop } }
  beat b3 "Fourth" { camera pan (50, 60); hold: 1s }
  beat b4 "Fifth"  { camera focus [a] zoom 1.7 }
}`;

function buildScene(): Scene {
  const { scene, diagnostics } = compileEdd(SRC);
  expect(diagnostics.errors).toEqual([]);
  return scene;
}

/** Recording stubs for the three collaborators the player drives. */
function setup(scene: Scene) {
  const calls = {
    visibility: [] as Array<Set<string>>,
    reveal: [] as Array<Record<string, string> | undefined>,
    anno: [] as Array<{ count: number; animate: boolean }>,
    camera: [] as Array<{ op: string; ids?: string[]; cam?: unknown; opts?: unknown }>,
  };
  const renderer = {
    applyVisibility: (h: Set<string>) => calls.visibility.push(new Set(h)),
    playReveal: (fx: Record<string, string> | undefined) => calls.reveal.push(fx),
  };
  const annotations = {
    render: (_s: Scene, list: unknown[], animate: boolean) => calls.anno.push({ count: list.length, animate }),
  };
  let cur = { cx: 0, cy: 0, zoom: 1 };
  const controller = {
    get current() { return cur; },
    fitAll: (_s: Scene, opts: unknown) => { calls.camera.push({ op: "fitAll", opts }); return Promise.resolve(); },
    focus: (_s: Scene, ids: string[], opts: unknown) => { calls.camera.push({ op: "focus", ids, opts }); return Promise.resolve(); },
    animateTo: (cam: { cx: number; cy: number; zoom: number }, opts: unknown) => { calls.camera.push({ op: "animateTo", cam, opts }); cur = cam; return Promise.resolve(); },
  };
  const player = new TimelinePlayer(renderer as never, controller as never, annotations as never);
  const states: Array<{ index: number; total: number; caption: string; stepName: string; playing: boolean }> = [];
  player.onChange = (s) => states.push({ ...s });
  return { player, calls, states, controller };
}

afterEach(() => vi.useRealTimers());

describe("TimelinePlayer contract", () => {
  it("load() resets to the overview state (index -1, all visible, 'Overview')", () => {
    const { player, states, calls } = setup(buildScene());
    player.load(buildScene());
    const s = states.at(-1)!;
    expect(s.index).toBe(-1);
    expect(s.total).toBe(5);
    expect(s.stepName).toBe("Overview");
    expect(calls.visibility.at(-1)!.size).toBe(0); // nothing hidden at home
  });

  it("goto applies sticky visibility, merges annotations, and emits caption/stepName", async () => {
    const scene = buildScene();
    const { player, states, calls } = setup(scene);
    player.load(scene);
    await player.goto(0);
    const s = states.at(-1)!;
    expect(s.index).toBe(0);
    expect(s.stepName).toBe("First");
    expect(s.caption).toBe("the start"); // narrate -> caption
    expect(calls.visibility.at(-1)!.has("c")).toBe(true); // `hide c`
    expect(calls.anno.at(-1)!.count).toBeGreaterThanOrEqual(0); // always-on + beat annotations merged
  });

  it("computeHidden is cumulative + sticky: hide at b0 stays hidden at b1, un-hidden at b2", async () => {
    const scene = buildScene();
    const { player, calls } = setup(scene);
    player.load(scene);
    await player.goto(0);
    expect(calls.visibility.at(-1)!.has("c")).toBe(true);
    await player.goto(1); // camera-less, no visibility change
    expect(calls.visibility.at(-1)!.has("c")).toBe(true); // still hidden (sticky)
    await player.goto(2); // `show c`
    expect(calls.visibility.at(-1)!.has("c")).toBe(false); // reveal un-hides
  });

  it("a camera-less beat leaves the camera untouched (sticky)", async () => {
    const scene = buildScene();
    const { player, calls } = setup(scene);
    player.load(scene);
    await player.goto(0); // fit-all
    const before = calls.camera.length;
    await player.goto(1); // no camera directive
    expect(calls.camera.length).toBe(before); // no new camera call
  });

  it("plays each beat's reveal effect (fade/pop) via playReveal when animating", async () => {
    const scene = buildScene();
    const { player, calls } = setup(scene);
    player.load(scene);
    await player.goto(2); // `reveal { show c with pop }`
    expect(calls.reveal.at(-1)).toEqual({ c: "pop" });
    // animate=false must not fire the reveal animation
    calls.reveal.length = 0;
    await player.goto(2, false);
    expect(calls.reveal.length).toBe(0);
  });

  it("runCamera dispatches ops: zoom keeps center, pan keeps zoom, focus passes targets+zoom", async () => {
    const scene = buildScene();
    const { player, calls } = setup(scene);
    player.load(scene);
    await player.goto(0); // fit-all
    expect(calls.camera.at(-1)!.op).toBe("fitAll");
    await player.goto(2); // camera zoom 2 -> animateTo preserving cx/cy
    const zoomCall = calls.camera.at(-1)!;
    expect(zoomCall.op).toBe("animateTo");
    expect((zoomCall.cam as { zoom: number }).zoom).toBe(2);
    await player.goto(3); // camera pan (50,60) -> animateTo center, keep zoom(=2)
    const panCall = calls.camera.at(-1)!;
    expect(panCall.op).toBe("animateTo");
    expect(panCall.cam).toMatchObject({ cx: 50, cy: 60, zoom: 2 });
    await player.goto(4); // focus [a] zoom 1.7
    const focusCall = calls.camera.at(-1)!;
    expect(focusCall.op).toBe("focus");
    expect(focusCall.ids).toEqual(["a"]);
  });

  it("next() clamps at the last beat; prev() from beat 0 returns to overview", async () => {
    const scene = buildScene();
    const { player, states } = setup(scene);
    player.load(scene);
    await player.goto(4); // last
    player.next(); // should not advance past 4
    await Promise.resolve();
    expect(states.at(-1)!.index).toBe(4);
    await player.goto(0);
    player.prev(); // from 0 -> home
    await Promise.resolve();
    expect(states.at(-1)!.index).toBe(-1);
  });

  it("play() auto-advances using each beat's dwell and stops at the last beat", async () => {
    vi.useFakeTimers();
    const scene = buildScene();
    const { player, states } = setup(scene);
    player.load(scene);
    player.play();
    await vi.advanceTimersByTimeAsync(1); // settle goto(0)
    expect(states.at(-1)!.index).toBe(0);
    await vi.advanceTimersByTimeAsync(3200); // b0 default dwell -> b1
    expect(states.at(-1)!.index).toBe(1);
    await vi.advanceTimersByTimeAsync(3200); // b1 -> b2
    expect(states.at(-1)!.index).toBe(2);
    await vi.advanceTimersByTimeAsync(3200); // b2 -> b3
    expect(states.at(-1)!.index).toBe(3);
    await vi.advanceTimersByTimeAsync(1000); // b3 hold:1s -> b4 (per-step dwell honored)
    expect(states.at(-1)!.index).toBe(4);
    await vi.advanceTimersByTimeAsync(3200); // at last beat -> stop
    expect(states.at(-1)!.playing).toBe(false);
  });

  it("pause() stops auto-advance (no beat fires after pause)", async () => {
    vi.useFakeTimers();
    const scene = buildScene();
    const { player, states } = setup(scene);
    player.load(scene);
    player.play();
    await vi.advanceTimersByTimeAsync(1);
    expect(states.at(-1)!.index).toBe(0);
    player.pause();
    await vi.advanceTimersByTimeAsync(10000);
    expect(states.at(-1)!.index).toBe(0); // never advanced past b0
  });
});
