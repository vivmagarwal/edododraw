import { describe, expect, it } from "vitest";
import { compileEdd } from "@engine/dsl/index.js";

describe("EDodoDraw DSL compiler", () => {
  it("compiles the simple-flow example (spec example 1)", () => {
    const src = `
edd 1.0
meta { title: "Signup Flow" }

scene {
  layout dag { direction: down, gap: 60 }

  start([Start])
  form[Signup Form]
  valid{Valid?}
  ok(Create Account):::good
  err(Show Errors):::bad

  start --> form
  form  --> valid
  valid -->|yes| ok
  valid -->|no|  err
  err   --> form
}

style .good { stroke: #16a34a }
style .bad  { stroke: #ef4444 }
`;
    const { scene, diagnostics } = compileEdd(src);
    expect(diagnostics.hasErrors).toBe(false);
    expect(scene.meta.title).toBe("Signup Flow");
    const ids = scene.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["err", "form", "ok", "start", "valid"]);
    // shapes from sugar
    expect(scene.nodes.find((n) => n.id === "start")!.shape).toBe("pill");
    expect(scene.nodes.find((n) => n.id === "valid")!.shape).toBe("diamond");
    expect(scene.nodes.find((n) => n.id === "form")!.shape).toBe("rectangle");
    // labels from sugar
    expect(scene.nodes.find((n) => n.id === "form")!.label).toBe("Signup Form");
    expect(scene.nodes.find((n) => n.id === "valid")!.label).toBe("Valid?");
    // class-applied stroke
    expect(scene.nodes.find((n) => n.id === "ok")!.style.stroke).toBe("#16a34a");
    expect(scene.nodes.find((n) => n.id === "err")!.style.stroke).toBe("#ef4444");
    // edges + mid labels
    expect(scene.edges.length).toBe(5);
    const yes = scene.edges.find((e) => e.label === "yes");
    expect(yes).toBeTruthy();
    // all nodes laid out (non-zero, finite)
    for (const n of scene.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("compiles shapes, colors, animations, groups, timeline + annotations", () => {
    const src = `
meta { title: "Arch" }
theme light {
  tokens { $accent: #2563eb, $muted: #9ca3af }
}
style .card { shape: round-rect, fill: blue }
defaults { edge { endArrow: arrow } }

scene {
  use theme light
  layout dag { direction: down, gap: 70 }

  actor user "User"
  cloud cdn "CDN"
  hexagon gw "Gateway" { fill: violet }

  group services "Services" {
    round-rect api "API" :::card
    subroutine worker "Worker"
  }

  cylinder db "Postgres" { fill: teal }

  user -> cdn "https"
  cdn ==> gw "miss" { color: $accent }
  gw -> api "rest" { animate: dash-march }
  api ~> worker "enqueue"
  api -> db "write" { endArrow: triangle, animate: draw-on }
  worker -.-> db "persist"
}

annotate "persistent" {
  callout db "source of truth" { placement: bottom }
}

timeline story {
  beat overview "All" {
    camera fit-all over 800ms
    reveal { show all with fade-in }
    narrate: "the whole system"
  }
  beat data "State" {
    camera focus [db, worker] zoom 1.6 ease spring
    annotate {
      spotlight db { dim: 0.7 }
      point-at db "primary" { from: ne, color: $accent }
    }
    reveal { draw-on [ "write", "persist" ] }
    hold: 2s
  }
}
`;
    const { scene, diagnostics } = compileEdd(src);
    const errs = diagnostics.errors.map((d) => `${d.code}: ${d.message}`);
    expect(errs).toEqual([]);
    // shapes mapped
    expect(scene.nodes.find((n) => n.id === "user")!.shape).toBe("actor");
    expect(scene.nodes.find((n) => n.id === "gw")!.shape).toBe("hexagon");
    expect(scene.nodes.find((n) => n.id === "db")!.shape).toBe("cylinder");
    // class shape applied to api
    expect(scene.nodes.find((n) => n.id === "api")!.shape).toBe("round-rectangle");
    // group formed
    expect(scene.groups.length).toBe(1);
    expect(scene.groups[0].members.sort()).toEqual(["api", "worker"]);
    // edge glyph lowering: ==> thick, ~> flow animation
    const miss = scene.edges.find((e) => e.label === "miss")!;
    expect(miss.style.strokeWidth).toBeGreaterThan(2);
    const enqueue = scene.edges.find((e) => e.label === "enqueue")!;
    expect(enqueue.style.animation).toBe("flow");
    const rest = scene.edges.find((e) => e.label === "rest")!;
    expect(rest.style.animation).toBe("dash-march");
    // annotations (script) present
    expect(scene.annotations.length).toBe(1);
    expect(scene.annotations[0].kind).toBe("callout");
    // timeline steps
    expect(scene.steps.length).toBe(2);
    expect(scene.steps[0].camera!.op).toBe("fit-all");
    expect(scene.steps[1].camera!.op).toBe("focus");
    expect(scene.steps[1].camera!.zoom).toBe(1.6);
    expect(scene.steps[1].camera!.targets).toContain("db");
    expect(scene.steps[1].annotations.length).toBe(2);
    expect(scene.steps[1].autoAdvanceMs).toBe(2000);
  });

  it("recovers from errors and reports them (multi-error)", () => {
    const src = `
scene {
  a -> b
  @@@ garbage @@@
  b -> c
}
`;
    const { scene, diagnostics } = compileEdd(src);
    // still produced a scene with the good edges
    expect(scene.edges.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics.items.length).toBeGreaterThan(0);
  });
});
