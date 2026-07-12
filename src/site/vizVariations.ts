/**
 * Content variations — the second axis of the explorer (the item-count and
 * text-length flexibility from the reference lab's `variations.html` / venn 2–7
 * matrix). For each template, `variationsFor(type)` returns a set of runnable
 * `.edd` snippets that demonstrate the SAME visualization at different item
 * counts and content lengths. Rendered on each template's detail page.
 */

export interface Variation {
  label: string;
  code: string;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

const NAMES = ["Discover", "Define", "Design", "Build", "Validate", "Launch", "Measure", "Learn", "Scale", "Refine", "Adapt", "Sustain"];
const ICONS = ["search", "bulb", "gear", "rocket", "check", "star", "chart", "heart", "shield", "globe", "trophy", "flag"];
const DETAILS = [
  "Set the direction and rally the team.",
  "Turn the plan into working software.",
  "Check it against real usage.",
  "Decide whether to persevere or pivot.",
  "Double down on what's working.",
  "Keep the momentum going.",
];
const LONG = "A deliberately longer description that runs to two full sentences. It shows how the layout wraps and stays balanced when the content gets verbose.";
const detOf = (i: number, long: boolean): string => (long ? LONG : DETAILS[i % DETAILS.length]);

function block(type: string, title: string, lines: string[], options: string[] = []): string {
  return `viz ${type} "${title}" {\n${[...options, ...lines].join("\n")}\n}`;
}

interface ItemOpts {
  kind?: string;
  value?: (i: number) => string | number;
  detail?: boolean;
  icon?: boolean;
  long?: boolean;
  names?: string[];
}

function itemLines(n: number, opts: ItemOpts = {}): string[] {
  const names = opts.names ?? NAMES;
  return range(n).map((i) => {
    let s = `  ${opts.kind ?? "item"} "${names[i % names.length]}"`;
    if (opts.value) s += ` ${opts.value(i)}`;
    if (opts.detail) s += ` "${detOf(i, !!opts.long)}"`;
    if (opts.icon) s += ` { icon: ${ICONS[i % ICONS.length]} }`;
    return s;
  });
}

/** Count-variation helper: render `mk(n, long)` at each count + an optional long-text variant. */
function counts(ns: number[], word: string, mk: (n: number, long: boolean) => string, longAt?: number): Variation[] {
  const out: Variation[] = ns.map((n) => ({ label: `${n} ${word}`, code: mk(n, false) }));
  if (longAt) out.push({ label: "Longer text", code: mk(longAt, true) });
  return out;
}

// Domain name pools for the templates that read better with real labels.
const VENN = ["Skills", "Passion", "Impact", "Market", "Timing", "Craft", "Luck"];
const FUNNEL = ["Awareness", "Interest", "Consideration", "Intent", "Evaluation", "Purchase"];
const FUNNEL_V = [5000, 2400, 1200, 600, 240, 80];
const PYRAMID = ["Essence", "Personality", "Benefits", "Attributes", "Features", "Facts"];
const PIE = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Others"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const BUILDERS: Record<string, () => Variation[]> = {
  // ---- Process --------------------------------------------------------------
  flowchart: () => counts([3, 4, 6], "steps", (n) => block("flowchart", "Process", itemLines(n, { icon: true })), undefined),
  sequence: () => counts([3, 4, 6], "steps", (n, long) => block("sequence", "Sequence", itemLines(n, { detail: true, long })), 4),
  stairs: () => counts([3, 4, 5], "steps", (n) => block("stairs", "Growth", itemLines(n, { icon: true }))),
  journey: () => counts([3, 4, 5, 6], "stages", (n, long) => block("journey", "Journey", itemLines(n, { detail: true, long })), 5),
  cycle: () => counts([3, 4, 5, 6], "phases", (n, long) => block("cycle", "Cycle", itemLines(n, { detail: true, icon: true, long })), 4),
  gantt: () =>
    counts([3, 4, 5], "tasks", (n) => {
      const names = ["Research", "Design", "Build", "QA", "Launch"];
      const lines = range(n).map((i) => `  task "${names[i]}" ${i} ${i + 1.5}`);
      const scale = range(n + 2).map((i) => `"W${i + 1}"`);
      return block("gantt", "Release Plan", lines, [`  scale: [${scale.join(", ")}]`, `  deadline: ${n + 0.5}`]);
    }),

  // ---- Data -----------------------------------------------------------------
  bar: () => counts([3, 5, 8], "bars", (n) => block("bar", "Revenue", itemLines(n, { value: (i) => 40 + ((i * 37) % 200) }), [`  yTitle: "Revenue"`])),
  "bar-horizontal": () => counts([3, 4, 6], "bars", (n) => block("bar-horizontal", "Capacity", itemLines(n, { value: (i) => 12 + ((i * 23) % 40), icon: true }))),
  "stacked-bar": () =>
    counts([2, 3, 4], "series", (k) => {
      const series = range(k).map((i) => `  series "${["People", "Tools", "Travel", "Other"][i]}"`);
      const rows = ["Q1", "Q2", "Q3"].map((q, r) => `  item "${q}" [${range(k).map((i) => 40 + ((r * 20 + i * 15) % 60)).join(", ")}]`);
      return block("stacked-bar", "Budget", [...series, ...rows]);
    }),
  "stacked-bar-horizontal": () =>
    counts([2, 3, 4], "series", (k) => {
      const series = range(k).map((i) => `  series "${["Salaries", "Tools", "Travel", "Other"][i]}"`);
      const rows = ["Eng", "Sales", "Ops"].map((q, r) => `  item "${q}" [${range(k).map((i) => 40000 + ((r * 20000 + i * 15000) % 80000)).join(", ")}]`);
      return block("stacked-bar-horizontal", "Budgets", [...series, ...rows]);
    }),
  line: () => counts([4, 7, 12], "points", (n) => block("line", "Active Users", range(n).map((i) => `  item "${MONTHS[i]}" ${900 + i * 130 + ((i * 61) % 200)}`), [`  yTitle: "Users"`])),
  area: () => counts([4, 7], "points", (n) => block("area", "Storage", range(n).map((i) => `  item "${2019 + i}" ${10 + i * i * 2}`), [`  yTitle: "TB"`])),
  waterfall: () =>
    counts([3, 4, 5], "deltas", (n) => {
      const names = ["Rent", "Payroll", "Marketing", "Misc", "Fees"];
      const lines = [`  item "Opening" 500`, ...range(n).map((i) => `  item "${names[i]}" ${i % 2 === 0 ? -120 - i * 20 : 80 + i * 15}`), `  total "Closing"`];
      return block("waterfall", "Cash Flow", lines);
    }),
  gauge: () => [30, 65, 90].map((v) => ({ label: `${v}%`, code: block("gauge", "Score", [], [`  value: ${v}`, `  label: "At ${v}%"`]) })),
  pie: () => counts([2, 3, 4, 6], "slices", (n) => block("pie", "Share", range(n).map((i) => `  item "${PIE[i]}" ${10 + ((i * 27) % 40)}`))),
  "drop-off": () => counts([2, 3, 4], "stages", (n) => block("drop-off", "Drop-off", range(n).map((i) => `  item "${["Visit", "Sign up", "Activate", "Retain"][i]}" ${100 - i * 30} { icon: ${ICONS[i]} }`))),
  "dumbbell-vertical": () => counts([2, 3, 4], "rows", (n, long) => block("dumbbell-vertical", "Year over Year", range(n).map((i) => `  item "${NAMES[i]}" "+${8 + i * 4}%" { icon: ${ICONS[i]}, detail: "${long ? LONG : "Up on last year."}" }`)), 3),
  "dumbbell-horizontal": () => counts([3, 4, 5], "rows", (n) => block("dumbbell-horizontal", "Progress", range(n).map((i) => `  item "${NAMES[i]}" ${60 + ((i * 17) % 35)} "${60 + ((i * 17) % 35)}%"`))),
  sankey: () =>
    counts([2, 3, 4], "sources", (n) => {
      const src = ["Solar", "Wind", "Coal", "Hydro"];
      const dst = ["Homes", "Industry", "Export"];
      const lines: string[] = [];
      range(n).forEach((i) => range(2).forEach((j) => lines.push(`  flow "${src[i]}" -> "${dst[(i + j) % 3]}" ${20 - i * 3 + j * 6}`)));
      return block("sankey", "Energy", lines);
    }),

  // ---- Timelines ------------------------------------------------------------
  timeline: () => counts([3, 4, 5], "events", (n, long) => block("timeline", "Milestones", range(n).map((i) => `  item "${2019 + i * 2}" "${long ? LONG : "A milestone worth marking."}" { icon: ${ICONS[i]} }`)), 4),

  // ---- Comparison -----------------------------------------------------------
  "pros-and-cons": () =>
    counts([2, 3, 4], "each side", (n) => {
      const pros = ["No commute", "Global talent", "Lower costs", "Flexible hours"];
      const cons = ["Harder onboarding", "Timezones", "Less spontaneity", "Home setup"];
      return block("pros-and-cons", "Remote Work", [...range(n).map((i) => `  pro "${pros[i]}"`), ...range(n).map((i) => `  con "${cons[i]}"`)]);
    }),
  table: () =>
    counts([2, 3, 4], "rows", (n) => {
      const rows = [
        ["Projects", "3", "Unlimited", "Unlimited"],
        ["Members", "5", "50", "Unlimited"],
        ["SSO", "—", "—", "Included"],
        ["Support", "Community", "Email", "Dedicated"],
      ];
      return block("table", "Plans", [`  header "Feature" ["Free", "Pro", "Enterprise"]`, ...range(n).map((i) => `  row "${rows[i][0]}" ["${rows[i][1]}", "${rows[i][2]}", "${rows[i][3]}"]`)]);
    }),
  versus: () =>
    counts([2, 3, 4], "criteria", (n) => {
      const crit = [
        ["Time to value", "clock", "Weeks", "Quarters"],
        ["Total cost", "dollar", "Subscription", "Upfront"],
        ["Fit", "puzzle", "80% ready", "Exact"],
        ["Control", "shield", "Vendor-led", "Full"],
      ];
      return block("versus", "Buy vs Build", [`  left "Buy"`, `  right "Build"`, ...range(n).map((i) => `  criterion "${crit[i][0]}" { icon: ${crit[i][1]}, left: "${crit[i][2]}", right: "${crit[i][3]}" }`)]);
    }),
  balance: () =>
    counts([1, 2, 3], "per side", (n) => {
      const left = ["Promotions", "Learning", "Recognition"];
      const right = ["Family time", "Health", "Hobbies"];
      const li = ["trend-up", "book", "trophy"];
      const ri = ["heart", "leaf", "star"];
      return block("balance", "Work-Life Balance", [
        `  side "Career" {\n${range(n).map((i) => `    item "${left[i]}" { icon: ${li[i]} }`).join("\n")}\n  }`,
        `  side "Wellbeing" {\n${range(n).map((i) => `    item "${right[i]}" { icon: ${ri[i]} }`).join("\n")}\n  }`,
      ]);
    }),
  relationship: () => counts([4, 6, 8], "nodes", (n) => block("relationship", "Ecosystem", [`  center "Platform" { icon: home }`, ...itemLines(n, { icon: true })])),
  podium: () => counts([2, 3], "ranks", (n) => block("podium", "Winners", range(n).map((i) => `  item "${["Team Rocket", "Null Pointers", "Bit Crushers"][i]}" { icon: ${i === 0 ? "trophy" : "medal"} }`))),
  decision: () => counts([2, 3, 4], "options", (n, long) => block("decision", "Where should we deploy?", itemLines(n, { detail: true, icon: true, long })), 3),
  spectrum: () => counts([3, 4, 5], "zones", (n, long) => block("spectrum", "Spectrum", itemLines(n, { detail: true, icon: true, long }))),
  quadrant: () => [
    { label: "Concise", code: quadrant(false) },
    { label: "Detailed", code: quadrant(true) },
  ],
  venn: () => counts([2, 3, 4, 5, 6, 7], "circles", vennCode, 3),

  // ---- Business Frameworks --------------------------------------------------
  swot: () =>
    [2, 4].map((bul) => ({
      label: `${bul} bullets`,
      code: swotCode(bul),
    })),
  pestel: () =>
    counts([4, 5, 6], "cards", (n) => {
      const cards = [
        ["Political", "Trade & policy shifts"],
        ["Economic", "Rates & spending"],
        ["Social", "Demographic trends"],
        ["Technological", "Rapid AI adoption"],
        ["Environmental", "Sustainability rules"],
        ["Legal", "Data protection"],
      ];
      return block("pestel", "Environment", range(n).map((i) => `  item "${cards[i][0]}" "${cards[i][1]}" { item "Signal ${i + 1}" }`));
    }),
  porters: () => counts([4, 5, 6], "forces", (n, long) => block("porters", "Forces", itemLines(n, { detail: true, long }))),
  pyramid: () => counts([3, 4, 5, 6], "levels", (n, long) => block("pyramid", "Hierarchy", range(n).map((i) => `  item "${PYRAMID[i]}"${long ? ` "${LONG}"` : ""}`)), 4),
  bullseye: () => counts([2, 3, 4], "rings", (n, long) => block("bullseye", "Target", range(n).map((i) => `  item "${["Market", "Segment", "Beachhead", "Core"][i]}" "${long ? LONG : "A ring of the target."}" { icon: ${ICONS[i]} }`)), 3),
  funnel: () => counts([3, 4, 5, 6], "stages", (n, long) => block("funnel", "Sales Funnel", range(n).map((i) => `  item "${FUNNEL[i]}" ${FUNNEL_V[i]}${long ? ` "${LONG}"` : ""}`), [`  input: "All prospects"`, `  output: "Customers"`]), 4),

  // ---- Brainstorming / Parts of a whole -------------------------------------
  mindmap: () => counts([3, 4, 5], "branches", (n) => block("mindmap", "Launch", range(n).map((i) => `  item "${["Marketing", "Engineering", "Sales", "Support", "Legal"][i]}" { item "Task A"; item "Task B" }`))),
  "key-ideas": () => counts([2, 3, 4], "ideas", (n, long) => block("key-ideas", "Themes", itemLines(n, { detail: true, long })), 3),
  list: () => counts([3, 5, 7], "items", (n) => block("list", "Values", itemLines(n, { detail: true, icon: true }))),
  diverge: () => counts([3, 4], "options", (n, long) => block("diverge", "How might we grow?", itemLines(n, { detail: true, icon: true, long }))),
  converge: () => counts([3, 4, 5], "inputs", (n) => block("converge", "Inputs", [...itemLines(n, { icon: true }), `  output "Roadmap" { icon: doc }`])),
  iceberg: () => counts([2, 3, 4], "below", (n) => block("iceberg", "Effort", [`  above "The demo" "What people see" { icon: eye }`, ...range(n).map((i) => `  below "${["Testing", "Infra", "Migrations", "Docs"][i]}" "Hidden work below the line."`)])),

  // ---- Problems & Solutions -------------------------------------------------
  "problem-solution": () => [
    { label: "1 support", code: problemSolution(1) },
    { label: "2 supports", code: problemSolution(2) },
  ],
  transformation: () => [
    { label: "Concise", code: transformation(false) },
    { label: "Detailed", code: transformation(true) },
  ],
  challenges: () => counts([2, 3, 4], "steps", (n) => gapSpan("challenges", n)),
  bridge: () => counts([2, 3, 4], "steps", (n) => gapSpan("bridge", n)),

  // ---- Visual Metaphors -----------------------------------------------------
  vision: () => [
    { label: "Concise", code: `viz vision "Where We're Headed" {\n  current "Today" "Regional, 2 products"\n  vision "Global platform" "Open by 2028"\n}` },
    { label: "Detailed", code: `viz vision "Where We're Headed" {\n  current "Today" "${LONG}"\n  vision "Global platform" "${LONG}"\n}` },
  ],
  impact: () => counts([2, 3, 4], "effects", (n, long) => block("impact", "Impact", [`  cause "Weekly ship cadence"`, ...itemLines(n, { detail: true, long })]), 3),
  performance: () => counts([2, 3, 4], "metrics", (n) => block("performance", "KPIs", range(n).map((i) => `  item "${["Uptime", "NPS", "Velocity", "Coverage"][i]}" ${70 + i * 8} "A tracked metric." { icon: ${ICONS[i]} }`), [`  summary: "Trending above target."`])),
  bottleneck: () => [
    { label: "30 in / 8 out", code: `viz bottleneck "Review Bottleneck" {\n  in: "30 PRs/week"\n  out: "8 merged"\n}` },
    { label: "100 in / 12 out", code: `viz bottleneck "Support Queue" {\n  in: "100 tickets/day"\n  out: "12 resolved"\n}` },
  ],
  hole: () => [
    { label: "Tech debt", code: `viz hole "Technical Debt Trap" {\n}` },
    { label: "With caption", code: `viz hole "Scope Creep" {\n  caption: "Every 'small' ask digs it deeper."\n}` },
  ],
  trend: () => counts([3, 4, 5], "levels", (n, long) => block("trend", "Maturity", itemLines(n, { detail: true, icon: true, long }))),
  race: () => counts([2, 3], "racers", (n) => block("race", "Market Race", range(n).map((i) => `  item "${["Us", "Rival X", "Rival Y"][i]}"`))),
  dialogue: () =>
    counts([2, 3, 4], "turns", (turns) => {
      const msgs = ["We spend hours on this.", "What if it was automatic?", "We'd save a day a week.", "Let me show you how.", "Can we start soon?", "Absolutely — next week.", "That would be huge.", "Consider it done."];
      return block("dialogue", "Discovery Call", [`  a: "Customer"`, `  b: "Sales"`, ...range(turns * 2).map((i) => `  msg "${msgs[i % msgs.length]}" { speaker: ${i % 2 === 0 ? "a" : "b"} }`)]);
    }),
  lens: () => counts([2, 3, 4], "inputs", (n) => block("lens", "Focus", [...itemLines(n, { icon: true }), `  output "Insight" { icon: bulb }`])),
  prism: () => counts([3, 4, 5], "outputs", (n) => block("prism", "One Strategy", [`  input "Platform bet" { icon: diamond }`, ...itemLines(n, { icon: true })])),
  pillar: () => counts([3, 4, 5], "pillars", (n, long) => block("pillar", "Pillars", itemLines(n, { detail: true, icon: true, long }))),

  // ---- Cause and Effect -----------------------------------------------------
  "root-causes": () => counts([2, 3, 4], "causes", (n, long) => block("root-causes", "Why Releases Slip", itemLines(n, { detail: true, long })), 3),

  // ---- Strategy & planning (tier 1, 2026-07) ----------------------------------
  flywheel: () => counts([3, 4, 5, 6], "segments", (n, long) => block("flywheel", "Growth Flywheel", itemLines(n, { icon: true, detail: long, long }), ["  center: \"Growth\""]), 4),
  radar: () =>
    counts([4, 5, 6, 8], "axes", (n) => {
      const axes = ["Security", "Performance", "Docs", "Ecosystem", "DX", "Support", "Pricing", "Scale"];
      return block("radar", "Platform Assessment", [
        ...range(n).map((i) => `  axis "${axes[i]}"`),
        `  series "Today" [${range(n).map((i) => 2 + ((i * 2) % 3)).join(", ")}]`,
        `  series "Target" [${range(n).map((i) => 4 + (i % 2)).join(", ")}]`,
      ]);
    }),
  "roadmap-lanes": () =>
    counts([2, 3, 4], "lanes", (n) => {
      const lanes = ["Platform", "Growth", "Mobile", "Data"];
      const rows = range(n).map(
        (i) => `  lane "${lanes[i]}" {\n    task "${NAMES[i * 2]}" ${i * 0.5} ${i * 0.5 + 1.5}\n    ${i % 2 ? `milestone "${NAMES[i * 2 + 1]}" ${2.5 + i * 0.4}` : `task "${NAMES[i * 2 + 1]}" ${2 + i * 0.4} ${3.4}`}\n  }`,
      );
      return block("roadmap-lanes", "Roadmap", rows, ['  scale: ["Q1", "Q2", "Q3", "Q4"]']);
    }),
  "milestone-path": () => counts([3, 4, 5, 6], "milestones", (n, long) => block("milestone-path", "Road to Launch", [...itemLines(n, { detail: true, long }), `  goal "Launch" "Public GA"`]), 4),
  "value-chain": () =>
    counts([3, 4, 5, 6], "stages", (n, long) =>
      block("value-chain", "Value Chain", [`  support "Infrastructure & tooling"`, ...itemLines(n, { icon: true, detail: long, long })]),
    4),
  "pricing-tiers": () =>
    counts([2, 3, 4], "tiers", (n) => {
      const tiers = ["Starter", "Pro", "Team", "Enterprise"];
      const feats = [["3 projects", "Community support"], ["Unlimited projects", "SSO + RBAC", "Priority support"], ["Everything in Pro", "Shared workspaces", "Usage analytics"], ["Dedicated VPC", "SLA + audit log", "Onboarding team"]];
      const rows = range(n).map((i) => `  tier "${tiers[i]}" ${[0, 29, 59, 99][i]} {${i === 1 ? " highlight: true" : ""}\n${feats[i].map((f) => `    item "${f}"`).join("\n")}\n  }`);
      return block("pricing-tiers", "Plans", rows, ['  period: "/mo"']);
    }),

  // ---- Planning & analysis (tier 2, 2026-07) ----------------------------------
  okr: () =>
    counts([2, 3, 4], "key results", (n, long) => {
      const krs = ["NPS above 60", "P95 latency under 200ms", "10k weekly active teams", "Churn below 2%"];
      return block("okr", "Objective: Best-loved dev tool", range(n).map((i) => `  kr "${krs[i]}"${long ? ` "${LONG}"` : ""} ${[0.72, 0.45, 0.31, 0.6][i]}`));
    }, 3),
  kanban: () =>
    counts([2, 3, 4], "columns", (n) => {
      const cols = ["To do", "Doing", "Review", "Done"];
      return block("kanban", "Sprint", range(n).map((i) => `  column "${cols[i]}" {\n${range(2 + (i % 2)).map((j) => `    item "${NAMES[(i * 3 + j) % NAMES.length]}"`).join("\n")}\n  }`));
    }),
  "decision-tree": () =>
    counts([2, 3], "branches", (n) =>
      block("decision-tree", "", [
        `  item "Build or buy?" {\n${range(n).map((i) => `    item "${["Build in-house", "Buy a vendor", "Partner instead"][i]}" { when: "${["build", "buy", "partner"][i]}", icon: ${["wrench", "dollar", "handshake"][i]} }`).join("\n")}\n  }`,
      ]),
    ),
  heatmap: () =>
    counts([2, 4, 6], "rows", (n) => {
      const rows = ["API", "Web", "Billing", "Auth", "Search", "Mobile"];
      return block("heatmap", "Incidents", [
        '  cols: ["Q1", "Q2", "Q3", "Q4"]',
        ...range(n).map((i) => `  row "${rows[i]}" [${range(4).map((c) => (i * 7 + c * 3) % 7).join(", ")}]`),
      ]);
    }),
  "slope-chart": () =>
    counts([2, 4, 6], "series", (n) => {
      const names = ["Billing", "Onboarding", "API", "Other", "Search", "Auth"];
      return block("slope-chart", "Ticket Volume", [
        '  left: "2026"',
        '  right: "2027"',
        ...range(n).map((i) => `  item "${names[i]}" ${340 - i * 45} ${120 + ((i * 67) % 180)}`),
      ]);
    }),
  // ---- Frameworks round 3 (tier 3, 2026-07) -----------------------------------
  "business-model-canvas": () =>
    counts([5, 9], "sections", (n) => {
      const kinds = ["value", "segments", "revenue", "costs", "channels", "partners", "activities", "resources", "relationships"];
      return block("business-model-canvas", "Canvas", range(n).map((i) => `  ${kinds[i]} { item "${NAMES[i]}"; item "${NAMES[(i + 4) % NAMES.length]}" }`));
    }),
  ecosystem: () =>
    counts([2, 3], "rings", (n) => {
      const ringNames = ["Core", "Partners", "Community"];
      const rows = range(n).map((ri) => `  ring "${ringNames[ri]}" {\n${range(3 + ri).map((j) => `    item "${NAMES[(ri * 4 + j) % NAMES.length]}" { icon: ${ICONS[(ri * 4 + j) % ICONS.length]} }`).join("\n")}\n  }`);
      return block("ecosystem", "Ecosystem", [`  center "Core" { icon: gear }`, ...rows]);
    }),
  "swimlane-flow": () =>
    counts([2, 3], "lanes", (n) => {
      const laneNames = ["Product", "Engineering", "QA"];
      const rows = range(n).map((li) => `  lane "${laneNames[li]}" {\n    step "${NAMES[li * 2]}" ${li * 2}\n    step "${NAMES[li * 2 + 1]}" ${li * 2 + 1}\n  }`);
      return block("swimlane-flow", "Process", rows);
    }),
  "bullet-chart": () => counts([2, 4, 6], "KPIs", (n) => block("bullet-chart", "Scorecard", range(n).map((i) => `  kpi "${NAMES[i]}" ${40 + ((i * 23) % 55)} ${60 + ((i * 17) % 40)}`))),
  domino: () => counts([3, 4, 6], "tiles", (n, long) => block("domino", "Chain Reaction", itemLines(n, { detail: long, long })), 4),
  lighthouse: () => counts([2, 3, 4], "rocks", (n, long) => block("lighthouse", "Guidance", [`  ship: "The plan"`, ...itemLines(n, { detail: true, long })]), 3),
  magnet: () => counts([2, 3, 5], "chips", (n) => block("magnet", "Attraction", [`  label: "The pull"`, ...itemLines(n, { icon: true })])),

  // ---- Sketchnote-native (2026-07) ----------------------------------------------
  personas: () =>
    counts([2, 4, 6], "personas", (n) => {
      const poses = ["waving", "confident", "thinking", "cheering", "presenting", "pointing"];
      return block("personas", "The Team", range(n).map((i) => `  item "${NAMES[i]}" "${DETAILS[i % DETAILS.length]}" { pose: ${poses[i]} }`));
    }),
  quote: () => [
    { label: "Short quote", code: block("quote", "Less, but better.", ["  by: \"Dieter Rams\""]) },
    { label: "Long quote", code: block("quote", "The people who are crazy enough to think they can change the world are the ones who do.", ["  by: \"Rob Siltanen\"", "  pose: cheering"]) },
    { label: "No character", code: block("quote", "Make it work, make it right, make it fast.", ["  by: \"Kent Beck\"", "  pose: none"]) },
  ],
  clouds: () => counts([3, 5, 7], "clouds", (n, long) => block("clouds", "Themes", itemLines(n, { icon: true, detail: long, long })), 5),
  fishbone: () =>
    counts([2, 4, 6], "bones", (n) => {
      const cats = ["People", "Process", "Tools", "Environment", "Measures", "Materials"];
      return block("fishbone", "Why It Breaks", range(n).map((i) => `  bone "${cats[i]}" {\n    item "${NAMES[i * 2]}"\n    item "${NAMES[i * 2 + 1]}"\n  }`));
    }),

  "head-thoughts": () =>
    counts([2, 4, 5], "thoughts", (n) => {
      const th = ["Will this save time?", "Can I trust it?", "What does it cost?", "Is it easy to leave?", "Who else uses it?"];
      return block("head-thoughts", "In Their Head", [`  who: "The buyer"`, ...range(n).map((i) => `  item "${th[i]}" { icon: ${ICONS[i]} }`)]);
    }),
  "hex-cluster": () =>
    counts([3, 5, 6], "cells", (n, long) =>
      block("hex-cluster", "Core Values", [`  center "Values" { icon: heart }`, ...itemLines(n, { icon: true, detail: long, long })]),
    6),

  "tug-of-war": () => [
    { label: "Left winning", code: block("tug-of-war", "Ship now vs. polish", [`  side "Ship now" 3 {\n    item "Market window closing"\n    item "Team is burning out"\n  }`, `  side "Keep polishing" 1 {\n    item "Two rough edges left"\n  }`]) },
    { label: "Balanced", code: block("tug-of-war", "Rewrite vs. refactor", ["  tilt: balanced", `  side "Rewrite" {\n    item "Clean slate"\n  }`, `  side "Refactor" {\n    item "Keep shipping"\n  }`]) },
  ],
};

function vennCode(n: number, long: boolean): string {
  const lines = range(n).map((i) => `  set "${VENN[i]}" "${long ? LONG : "What we bring here"}" { icon: ${ICONS[i]} }`);
  if (n <= 3) lines.push(`  overlap all "Sweet spot"`);
  return block("venn", "Sweet Spot", lines);
}

function quadrant(long: boolean): string {
  const q = ["Schedule", "Do now", "Drop", "Delegate"];
  const qi = ["calendar", "fire", "x", "users"];
  const lines = range(4).map((i) => `  item "${q[i]}" "${long ? LONG : "A quadrant of the matrix."}" { icon: ${qi[i]} }`);
  return block("quadrant", "Prioritization", lines, [`  xLabels: ["Not urgent", "Urgent"]`, `  yLabels: ["Not important", "Important"]`]);
}

function swotCode(bul: number): string {
  const secs: Array<[string, string[]]> = [
    ["Strengths", ["Loyal base", "Strong brand", "Cash reserves", "Great talent"]],
    ["Weaknesses", ["One revenue stream", "Aging stack", "Slow releases", "Thin docs"]],
    ["Opportunities", ["New markets", "AI features", "Partnerships", "Upsell"]],
    ["Threats", ["New entrants", "Regulation", "Churn", "Price pressure"]],
  ];
  const lines = secs.map(([t, b]) => `  item "${t}" {\n${range(bul).map((i) => `    item "${b[i]}"`).join("\n")}\n  }`);
  return block("swot", "SWOT", lines);
}

function problemSolution(supports: number): string {
  const lines = [
    `  problem "Ticket backlog" "400 open, 3-day replies"`,
    `  solution "Self-serve help center"`,
    `  outcome "Faster answers" "70% deflection"`,
    ...range(supports).map((i) => `  support "${["Smooth migration for existing users", "Weekly content reviews keep it fresh"][i]}"`),
  ];
  return block("problem-solution", "Support Overload", lines);
}

function transformation(long: boolean): string {
  return `viz transformation "Workflow Cleanup" {\n  before "Manual chaos" "${long ? LONG : "Spreadsheets and email"}"\n  after "Streamlined flow" "${long ? LONG : "One automated pipeline"}"\n}`;
}

function gapSpan(type: string, n: number): string {
  const steps = ["Security review", "Scale testing", "Compliance", "Rollback plan"];
  const lines = [
    `  from "Prototype" "Works on my machine"`,
    `  to "Production" "Reliable for everyone"`,
    ...range(n).map((i) => `  item "${steps[i]}" "A step across the gap."`),
    `  action: "Cross the gap"`,
  ];
  return block(type, type === "bridge" ? "Migration Plan" : "Path to Launch", lines);
}

/** Content variations for a template, or [] if it has none defined. */
export function variationsFor(type: string): Variation[] {
  return BUILDERS[type]?.() ?? [];
}
