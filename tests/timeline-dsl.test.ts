import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";

function steps(src: string) {
  const { scene, diagnostics } = compileEdd(src);
  expect(diagnostics.errors).toEqual([]);
  return scene.steps;
}
const wrap = (beats: string) => `scene { rect a "A"\n rect b "B"\n rect c "C" }\ntimeline t {\n${beats}\n}`;

describe("DSL camera directive mapping", () => {
  it("maps over/duration (s->ms), ease, pad -> durationMs/easing/padding", () => {
    const s = steps(
      wrap(`
      beat one "1" { camera focus [a] zoom 1.5 over 800ms ease spring pad 40 }
      beat two "2" { camera fit-all duration 2s ease linear }
    `),
    );
    expect(s[0].camera).toMatchObject({ op: "focus", zoom: 1.5, durationMs: 800, easing: "spring", padding: 40 });
    expect(s[1].camera).toMatchObject({ op: "fit-all", durationMs: 2000, easing: "linear" });
  });

  it("timeline-level defaultEase supplies easing for beats that omit ease", () => {
    const s = steps(`scene { rect a "A" }\ntimeline t { defaultEase: spring\n beat one "1" { camera focus [a] } }`);
    expect(s[0].camera!.easing).toBe("spring");
  });

  it("op aliases normalize: reset->fit-all, fit/center <target>->focus", () => {
    const s = steps(
      wrap(`
      beat r "r" { camera reset }
      beat f "f" { camera fit [a] }
      beat c "c" { camera center [b] }
    `),
    );
    expect(s[0].camera!.op).toBe("fit-all");
    expect(s[1].camera!.op).toBe("focus");
    expect(s[2].camera!.op).toBe("focus");
  });

  it("pan accepts bare / to / by tuple forms", () => {
    const s = steps(
      wrap(`
      beat p1 "1" { camera pan (10, 20) }
      beat p2 "2" { camera pan to (30, 40) }
      beat p3 "3" { camera pan by (5, 6) }
    `),
    );
    expect(s[0].camera).toMatchObject({ op: "pan", center: { x: 10, y: 20 } });
    expect(s[1].camera).toMatchObject({ op: "pan", center: { x: 30, y: 40 } });
    expect(s[2].camera).toMatchObject({ op: "pan", center: { x: 5, y: 6 } });
  });

  it("narrate -> caption; hold: and wait: both -> autoAdvanceMs (s->ms)", () => {
    const s = steps(
      wrap(`
      beat one "1" { narrate: "hello"; hold: 2s }
      beat two "2" { wait: 1500 }
    `),
    );
    expect(s[0].caption).toBe("hello");
    expect(s[0].autoAdvanceMs).toBe(2000);
    expect(s[1].autoAdvanceMs).toBe(1500);
  });
});

describe("DSL reveal effects -> Step.revealFx", () => {
  it("`with <effect>` and effect-verbs populate revealFx; plain show/hide do not", () => {
    const s = steps(
      wrap(`
      beat one   "1" { reveal { show all with fade-in } }
      beat two   "2" { reveal { show b with pop } }
      beat three "3" { reveal { draw-on [a] } }
      beat four  "4" { reveal { show c } }
      beat five  "5" { reveal { hide c } }
    `),
    );
    expect(s[0].revealFx).toMatchObject({ a: "fade", b: "fade", c: "fade" });
    expect(s[1].revealFx).toEqual({ b: "pop" });
    expect(s[2].revealFx).toEqual({ a: "sweep" });
    expect(s[3].revealFx).toBeUndefined(); // plain show = instant
    expect(s[4].hide).toContain("c");
    expect(s[4].revealFx).toBeUndefined(); // hide carries no reveal effect
  });
});
