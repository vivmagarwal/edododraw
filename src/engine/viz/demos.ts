/**
 * The visualization demo catalog — one runnable `.edd` demo per registered viz
 * template, grouped by category, plus the animated (`animate:` / `hold:` /
 * `animateCamera:`) form of each.
 *
 * This is the single source of truth for the site's Visualizations gallery, the
 * docs examples, the visual QA sweep, and any consumer of the package (a
 * Remotion gallery, an LLM prompt builder, a screenshot farm). It ships inside
 * the published package — `import { VIZ_DEMOS } from "edododraw"`, or
 * `from "edododraw/demos"` for the catalog alone.
 *
 * Deliberately dependency-free: this module imports nothing, so `edododraw/demos`
 * costs a consumer a few KB of strings and pulls in no renderer, no dagre and no
 * rough.js. `tests/viz-demos.test.ts` is what keeps it honest — it asserts the
 * catalog covers every name in `listVizTemplates()`, that every demo compiles
 * with zero error diagnostics, and that each one produces the viz type it claims.
 */

export interface VizDemo {
  /** viz type name — matches a `listVizTemplates()` entry exactly. */
  type: string;
  /** Catalog grouping (a presentation category, not the registry category). */
  category: string;
  /** Human title for a card or heading. */
  title: string;
  /** One line on what the template is for and which options matter. */
  description: string;
  /** Runnable `.edd` source. Compiles with zero error diagnostics. */
  code: string;
}

const d = (type: string, category: string, title: string, description: string, code: string): VizDemo => ({
  type,
  category,
  title,
  description,
  code: code.trim(),
});

export const VIZ_DEMOS: VizDemo[] = [
  // ---- Process ---------------------------------------------------------------
  d("flowchart", "Process", "Flowchart", "Sequential steps with arrows; set `direction: right` for a horizontal chain.", `
viz flowchart "Content Publishing" {
  direction: right
  item "Draft" "Outline, then a first pass" { icon: doc }
  item "Review" "Editor and one peer" { icon: search }
  item "Approve" "Sign-off in the tracker" { icon: check }
  item "Publish" "Ships with the newsletter" { icon: rocket }
}`),
  d("sequence", "Process", "Sequence", "Numbered step panels flowing in reading order (boustrophedon).", `
viz sequence "Customer Onboarding" {
  item "Sign up" "Create an account with email or SSO."
  item "Verify" "Confirm the email address."
  item "Profile" "Add team and workspace details."
  item "Invite" "Bring in the first teammates."
  item "Import" "Load existing project data."
  item "Launch" "Go live with the first project."
}`),
  d("stairs", "Process", "Stairs", "Ascending steps toward a goal.", `
viz stairs "Growth Ladder" {
  item "Learn" { icon: book }
  item "Build" { icon: gear }
  item "Ship" { icon: rocket }
  item "Scale" { icon: trend-up }
}`),
  d("journey", "Process", "Journey", "A winding road with numbered stops.", `
viz journey "User Journey" {
  item "Discover" "Finds us via search or a friend"
  item "Try" "Signs up for the free tier"
  item "Adopt" "Invites the team, builds a habit"
  item "Upgrade" "Converts to a paid plan"
  item "Advocate" "Recommends us to others"
}`),
  d("cycle", "Process", "Cycle", "Phases on a ring with sweeping arrows; adapts from 3 to 6+ phases.", `
viz cycle "Build-Measure-Learn" {
  item "Build" "Ship the smallest useful slice" { icon: gear }
  item "Measure" "Watch real usage, not opinions" { icon: chart }
  item "Learn" "Decide: persevere or pivot" { icon: bulb }
}`),
  d("gantt", "Process", "Gantt", "Cascading task bars over a time grid, with an optional deadline.", `
viz gantt "Release Plan" {
  scale: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5", "Wk 6"]
  deadline: 5
  task "Design" 0 1.5
  task "Build" 1 3.5
  task "QA" 3 4.5
  task "Rollout" 4.5 5
}`),

  d("kanban", "Process", "Kanban", "Named columns of cards — the task board.", `
viz kanban "Sprint 12" {
  column "To do" {
    item "Rate limiting"
    item "Billing webhooks"
    item "Dark mode"
  }
  column "Doing" {
    item "Checkout flow" { icon: fire }
    item "SSO login"
  }
  column "Done" {
    item "Search rework" { icon: check }
    item "Onboarding tour" { icon: check }
  }
}`),

  d("swimlane-flow", "Process", "Swimlane flow", "A flowchart over responsibility lanes — who does what, in order.", `
viz swimlane-flow "Release Process" {
  lane "Product" {
    step "Spec" 0 { icon: doc }
    step "Sign-off" 3 { icon: check }
  }
  lane "Engineering" {
    step "Build" 1 { icon: wrench }
    step "Deploy" 4 { icon: rocket }
  }
  lane "QA" {
    step "Test" 2 { icon: search }
  }
}`),

  // ---- Data ------------------------------------------------------------------
  d("bar", "Data", "Bar chart", "Columns with per-category colors and value labels.", `
viz bar "Revenue by Quarter" {
  yTitle: "Revenue ($k)"
  item "Q1" 120
  item "Q2" 180
  item "Q3" 150
  item "Q4" 240
}`),
  d("bar-horizontal", "Data", "Bar — horizontal", "Horizontal bars with circular category badges.", `
viz bar-horizontal "Team Capacity" {
  item "Engineering" 34 { icon: gear }
  item "Design" 12 { icon: heart }
  item "Marketing" 18 { icon: megaphone }
  item "Support" 22 { icon: chat }
}`),
  d("stacked-bar", "Data", "Stacked bar", "Stacked columns; legend via `series` entries.", `
viz stacked-bar "Budget by Quarter" {
  series "People"
  series "Tools"
  series "Marketing"
  item "Q1" [80, 20, 30]
  item "Q2" [90, 25, 45]
  item "Q3" [95, 22, 38]
}`),
  d("stacked-bar-horizontal", "Data", "Stacked bar — horizontal", "Horizontal stacked rows with a value axis.", `
viz stacked-bar-horizontal "Department Budgets" {
  series "Salaries"
  series "Equipment"
  series "Travel"
  item "Engineering" [120000, 30000, 12000]
  item "Sales" [90000, 15000, 40000]
  item "Operations" [70000, 25000, 8000]
}`),
  d("line", "Data", "Line chart", "A single series with point markers and value labels.", `
viz line "Active Users" {
  yTitle: "Users"
  xTitle: "Month"
  item "Jan" 1200
  item "Feb" 1350
  item "Mar" 1600
  item "Apr" 1580
  item "May" 1900
  item "Jun" 2400
}`),
  d("area", "Data", "Area chart", "A line chart with a soft filled area underneath.", `
viz area "Storage Used" {
  yTitle: "TB"
  item "2021" 14
  item "2022" 22
  item "2023" 31
  item "2024" 52
  item "2025" 78
}`),
  d("waterfall", "Data", "Waterfall", "Start value, floating signed deltas, computed net.", `
viz waterfall "Cash Flow" {
  item "Opening" 500
  item "Rent" -200
  item "Payroll" -120
  item "Marketing" -40
  total "Closing"
}`),
  d("gauge", "Data", "Gauge", "A 270° dial for one value out of 100.", `
viz gauge "System Health" {
  value: 87
  label: "Uptime score"
}`),
  d("pie", "Data", "Pie chart", "Slices with percentage callouts; alias `donut` for a hole.", `
viz pie "Market Share" {
  item "Alpha" 45
  item "Beta" 30
  item "Gamma" 15
  item "Others" 10
}`),
  d("drop-off", "Data", "Drop-off", "Cascading stages, each smaller than the last.", `
viz drop-off "Signup Funnel Loss" {
  item "Visit" 100 { icon: eye }
  item "Sign up" 42 { icon: user }
  item "Activate" 18 { icon: check }
}`),
  d("dumbbell-vertical", "Data", "Dumbbell — vertical", "Alternating capsules with a delta badge and connected notes.", `
viz dumbbell-vertical "Year over Year" {
  item "Speed Score" "+15%" { icon: rocket, detail: "Increased from 70 to 85." }
  item "Retention" "+8%" { icon: heart, detail: "Now at 92% after onboarding fixes." }
  item "Cost per Lead" "−22%" { icon: dollar, detail: "Down from $18 to $14." }
}`),
  d("dumbbell-horizontal", "Data", "Dumbbell — horizontal", "Progress tracks with a hanging value tag.", `
viz dumbbell-horizontal "Goal Progress" {
  item "Docs coverage" 80 "80%"
  item "Test coverage" 65 "65%"
  item "Accessibility" 90 "90%"
  item "Performance" 72 "72%"
}`),
  d("sankey", "Data", "Sankey", "Sources flowing to targets with value-thick ribbons.", `
viz sankey "Energy Mix" {
  flow "Coal" -> "Industry" 25
  flow "Coal" -> "Homes" 10
  flow "Solar" -> "Homes" 30
  flow "Solar" -> "Industry" 12
  flow "Wind" -> "Industry" 18
  flow "Wind" -> "Homes" 15
}`),

  d("radar", "Data", "Radar", "A spider chart — series polygons over labeled axes.", `
viz radar "Platform Assessment" {
  axis "Security"
  axis "Performance"
  axis "Docs"
  axis "Ecosystem"
  axis "DX"
  series "Today" [3, 4, 2, 3, 2]
  series "Target" [5, 4, 4, 4, 5]
}`),

  d("heatmap", "Data", "Heatmap", "Intensity-shaded matrix cells — risk matrices, skills grids.", `
viz heatmap "Incidents per Service" {
  cols: ["Q1", "Q2", "Q3", "Q4"]
  row "API" [3, 5, 2, 1]
  row "Web" [1, 2, 1, 0]
  row "Billing" [4, 6, 5, 2]
  row "Auth" [0, 1, 3, 1]
}`),
  d("slope-chart", "Data", "Slope chart", "Before → after lines, one per series.", `
viz slope-chart "Ticket Volume" {
  left: "2026"
  right: "2027"
  item "Billing" 340 120
  item "Onboarding" 210 190
  item "API" 90 160
  item "Other" 150 60
}`),

  d("bullet-chart", "Data", "Bullet chart", "KPI rows — the actual bar vs a target tick.", `
viz bullet-chart "Q3 Scorecard" {
  kpi "Revenue" 74 90
  kpi "NPS" 61 55
  kpi "Uptime" 99.5 99.9
  kpi "Hiring" 6 10
}`),

  // ---- Timelines --------------------------------------------------------------
  d("timeline", "Timelines", "Timeline", "Events along a dashed baseline, alternating up/down.", `
viz timeline "Company Milestones" {
  item "2019" "Founded in a garage" { icon: home }
  item "2021" "First 1,000 customers" { icon: users }
  item "2023" "Series A raised" { icon: dollar }
  item "2025" "Global expansion" { icon: globe }
}`),

  d("roadmap-lanes", "Timelines", "Roadmap lanes", "Workstream swimlanes across quarters — the product-roadmap slide.", `
viz roadmap-lanes "2027 Roadmap" {
  scale: ["Q1", "Q2", "Q3", "Q4"]
  lane "Platform" {
    task "SSO + RBAC" 0 1.5
    task "Audit log" 2 3
    icon: gear
  }
  lane "Growth" {
    task "Referrals" 0.5 2
    milestone "Self-serve GA" 3
    icon: trend-up
  }
  lane "Mobile" {
    task "iOS beta" 1 2.5
    task "Android" 2.5 4
    icon: phone
  }
}`),
  d("milestone-path", "Timelines", "Milestone path", "A winding trail to the summit flag, milestones along the way.", `
viz milestone-path "Road to Launch" {
  item "Prototype" "Q1 — clickable demo"
  item "Private beta" "Q2 — 20 design partners"
  item "Pricing" "Q3 — packaging locked"
  goal "Launch" "Public GA"
}`),

  // ---- Comparison ----------------------------------------------------------------
  d("pros-and-cons", "Comparison", "Pros and cons", "Two panels weighing a decision.", `
viz pros-and-cons "Remote Work" {
  pro "No commute time"
  pro "Global talent pool"
  pro "Lower office costs"
  pro "Flexible schedules"
  con "Harder to onboard juniors"
  con "Timezone coordination"
  con "Less spontaneous collaboration"
}`),
  d("table", "Comparison", "Table", "A comparison table with per-column accent colors.", `
viz table "Plan Comparison" {
  header "Feature" ["Free", "Pro", "Enterprise"]
  row "Projects" ["3", "Unlimited", "Unlimited"]
  row "Members" ["5", "50", "Unlimited"]
  row "SSO" ["—", "—", "Included"]
  row "Support" ["Community", "Email", "Dedicated"]
}`),
  d("versus", "Comparison", "Versus", "Head-to-head comparison across criteria.", `
viz versus "Buy vs Build" {
  left "Buy"
  right "Build"
  criterion "Time to value" { icon: clock, left: "Weeks", right: "Quarters" }
  criterion "Total cost" { icon: dollar, left: "Predictable subscription", right: "High upfront, low marginal" }
  criterion "Fit" { icon: puzzle, left: "80% out of the box", right: "Exactly your workflow" }
}`),
  d("balance", "Comparison", "Balance", "A balance scale weighing two sides.", `
viz balance "Work-Life Balance" {
  side "Career Growth" {
    item "Promotions" { icon: trend-up }
    item "Learning" { icon: book }
  }
  side "Personal Wellbeing" {
    item "Family time" { icon: heart }
    item "Health" { icon: leaf }
  }
}`),
  d("relationship", "Comparison", "Relationship", "A hub with satellites on a dashed orbit.", `
viz relationship "Product Ecosystem" {
  center "Platform" { icon: home }
  item "Mobile app" { icon: phone }
  item "API" { icon: gear }
  item "Marketplace" { icon: dollar }
  item "Analytics" { icon: chart }
  item "Community" { icon: users }
  item "Docs" { icon: book }
}`),
  d("podium", "Comparison", "Podium", "1-2-3 ranking blocks.", `
viz podium "Hackathon Winners" {
  item "Team Rocket" { icon: trophy }
  item "Null Pointers" { icon: medal }
  item "Bit Crushers" { icon: medal }
}`),
  d("decision", "Comparison", "Decision", "A question fanning out to options.", `
viz decision "Where should we deploy?" {
  item "Cloud" "Fastest to start, elastic scale" { icon: cloud }
  item "On-prem" "Full control, higher ops load" { icon: database }
  item "Hybrid" "Sensitive data stays home" { icon: shield }
}`),
  d("spectrum", "Comparison", "Spectrum", "A range between two poles with zones.", `
viz spectrum "Working Styles" {
  item "Introvert" "Recharges alone, deep focus" { icon: book }
  item "Ambivert" "Adapts to the situation" { icon: scale }
  item "Extrovert" "Energized by people" { icon: users }
}`),
  d("quadrant", "Comparison", "Quadrant", "A 2×2 with axis labels; items in reading order TL, TR, BL, BR.", `
viz quadrant "Prioritization" {
  xLabels: ["Not urgent", "Urgent"]
  yLabels: ["Not important", "Important"]
  item "Schedule" "Plan deliberately" { icon: calendar }
  item "Do now" "Crises and deadlines" { icon: fire }
  item "Drop" "Time sinks" { icon: x }
  item "Delegate" "Interruptions, some email" { icon: users }
}`),
  d("venn", "Comparison", "Venn", "Overlapping sets (2–7 circles) in a symmetric rosette, with region labels.", `
viz venn "Product Sweet Spot" {
  set "Desirable" "What users want" { icon: heart }
  set "Feasible" "What we can build" { icon: gear }
  set "Viable" "What sustains us" { icon: dollar }
  overlap all "Great products"
}`),

  d("pricing-tiers", "Comparison", "Pricing tiers", "Plan cards with prices and feature lists; highlight one tier.", `
viz pricing-tiers "Plans" {
  period: "/mo"
  tier "Starter" 0 {
    item "3 projects"
    item "Community support"
  }
  tier "Pro" 29 { highlight: true
    item "Unlimited projects"
    item "SSO + RBAC"
    item "Priority support"
  }
  tier "Enterprise" 99 {
    item "Dedicated VPC"
    item "SLA + audit log"
    item "Onboarding team"
  }
}`),

  d("decision-tree", "Comparison", "Decision tree", "Questions branching through labeled edges to outcomes.", `
viz decision-tree "Should we build it?" {
  item "Build or buy?" {
    item "Core to product?" { when: "build" } {
      item "Build in-house" { when: "yes", icon: wrench }
      item "Adopt open source" { when: "no", icon: globe }
    }
    item "Buy a vendor" { when: "buy", icon: dollar }
  }
}`),

  // ---- Business Frameworks ------------------------------------------------------
  d("swot", "Business Frameworks", "SWOT", "Strengths, weaknesses, opportunities, threats.", `
viz swot "SWOT — Acme Corp" {
  item "Strengths" {
    item "Loyal customer base"
    item "Strong brand recognition"
  }
  item "Weaknesses" {
    item "Single revenue stream"
    item "Aging infrastructure"
  }
  item "Opportunities" {
    item "Emerging markets"
    item "AI-assisted workflows"
  }
  item "Threats" {
    item "New low-cost entrants"
    item "Tightening regulation"
  }
}`),
  d("pestel", "Business Frameworks", "PESTEL", "Six external-factor cards.", `
viz pestel "Market Environment" {
  item "Political" "Trade policy shifts" { item "Tariff changes" }
  item "Economic" "Rate environment" { item "Consumer spending" }
  item "Social" "Demographic trends" { item "Remote-first work" }
  item "Technological" "Rapid AI adoption" { item "Automation pressure" }
  item "Environmental" "Sustainability rules" { item "Carbon reporting" }
  item "Legal" "Data protection" { item "Privacy regulation" }
}`),
  d("porters", "Business Frameworks", "Porter's Five Forces", "Competitive forces around a market.", `
viz porters "Industry Forces" {
  item "Rivalry" "Many similar competitors" { icon: users }
  item "New entrants" "Low barriers to entry" { icon: rocket }
  item "Supplier power" "Few key suppliers" { icon: key }
  item "Buyer power" "Easy to switch" { icon: dollar }
  item "Substitutes" "DIY alternatives exist" { icon: wrench }
}`),
  d("pyramid", "Business Frameworks", "Pyramid", "Stacked hierarchy levels.", `
viz pyramid "Brand Pyramid" {
  item "Essence" "One promise"
  item "Personality" "How we sound and feel"
  item "Benefits" "What customers get"
  item "Attributes" "Features and facts"
}`),
  d("bullseye", "Business Frameworks", "Bullseye", "Concentric priority rings, outermost first.", `
viz bullseye "Target Market" {
  item "Addressable market" "Everyone who could buy" { icon: globe }
  item "Serviceable market" "Who we can reach today" { icon: target }
  item "Beachhead" "Design-led B2B startups" { icon: flag }
}`),
  d("funnel", "Business Frameworks", "Funnel", "Narrowing stages with side labels.", `
viz funnel "Sales Funnel" {
  input: "Potential customers"
  output: "Closed deals"
  item "Awareness" 5000
  item "Interest" 1800
  item "Evaluation" 420
  item "Negotiation" 120
  item "Won" 38
}`),

  d("hex-cluster", "Business Frameworks", "Hex cluster", "A honeycomb — one core hexagon ringed by themed cells.", `
viz hex-cluster "What makes a healthy team" {
  center "Team Health" { icon: heart }
  item "Clarity" { icon: target }
  item "Trust" { icon: handshake }
  item "Pace" { icon: rocket }
  item "Craft" { icon: gear }
  item "Growth" { icon: trend-up }
}`),
  d("flywheel", "Business Frameworks", "Flywheel", "A self-reinforcing momentum loop of ring segments.", `
viz flywheel "Marketplace Flywheel" {
  center: "Growth"
  item "More sellers" { icon: users }
  item "More selection" { icon: star }
  item "More buyers" { icon: heart }
  item "Lower prices" { icon: dollar }
}`),
  d("value-chain", "Business Frameworks", "Value chain", "A Porter-style chevron band with optional support bars.", `
viz value-chain "How We Deliver" {
  support "Infrastructure & tooling"
  support "People & culture"
  item "Source" { icon: search }
  item "Build" { icon: wrench }
  item "Ship" { icon: rocket }
  item "Support" { icon: heart }
}`),

  d("okr", "Business Frameworks", "OKR", "One objective branching into key results with progress bars.", `
viz okr "Objective: Best-loved dev tool" {
  kr "NPS above 60" 0.72
  kr "P95 latency under 200ms" 0.45
  kr "10k weekly active teams" 0.31
}`),

  d("business-model-canvas", "Business Frameworks", "Business Model Canvas", "The classic 9-box BMC grid with bullet sections.", `
viz business-model-canvas "EDodo, Inc." {
  partners { item "Cloud provider"; item "Design agencies" }
  activities { item "Engine development"; item "Community" }
  resources { item "Rendering engine"; item "Template library" }
  value { item "Diagrams from plain text"; item "Hand-drawn warmth" }
  relationships { item "Self-serve"; item "Discord community" }
  channels { item "npm + docs site"; item "Conference talks" }
  segments { item "Dev-tool teams"; item "Educators" }
  costs { item "R&D"; item "Infrastructure" }
  revenue { item "Pro licenses"; item "Support plans" }
}`),
  d("ecosystem", "Business Frameworks", "Ecosystem", "Concentric stakeholder orbits around one center.", `
viz ecosystem "Platform" {
  center "EDodo Core" { icon: gear }
  ring "Builders" {
    item "Plugin devs" { icon: wrench }
    item "Template authors" { icon: doc }
    item "Integrators" { icon: puzzle }
  }
  ring "Ecosystem" {
    item "npm" { icon: cloud }
    item "GitHub" { icon: globe }
    item "Educators" { icon: book }
    item "Agencies" { icon: users }
  }
}`),

  // ---- Brainstorming ---------------------------------------------------------------
  d("mindmap", "Brainstorming", "Mindmap", "A central topic branching in both directions; variants: -left, -right, -horizontal, -vertical.", `
viz mindmap "Product Launch" {
  item "Marketing" { item "Landing page"; item "Email campaign"; item "Social posts" }
  item "Engineering" { item "Feature freeze"; item "Load testing" }
  item "Sales" { item "Demo script"; item "Pricing sheet" }
  item "Support" { item "Help articles"; item "Escalation plan" }
  item "Legal" { item "Terms update" }
}`),
  d("mindmap-right", "Brainstorming", "Mindmap — right", "Every branch fans to the right of the root; reads as a plan unrolling.", `
viz mindmap-right "Onboarding Plan" {
  item "Week 1" { item "Laptop + accounts"; item "Meet the team"; item "Ship a typo fix" }
  item "Month 1" { item "Own a small feature"; item "Shadow on-call" }
  item "Quarter 1" { item "Lead a project"; item "Mentor the next hire" }
}`),
  d("mindmap-left", "Brainstorming", "Mindmap — left", "Every branch fans to the left of the root; reads as inputs feeding in.", `
viz mindmap-left "Where Bugs Come From" {
  item "Unclear specs" { item "Unwritten assumptions"; item "Late scope changes" }
  item "Thin tests" { item "Untested edge cases"; item "Flaky CI" }
  item "Rushed reviews" { item "Diffs too big"; item "No context" }
}`),
  d("mindmap-horizontal", "Brainstorming", "Mindmap — horizontal", "Root at the left, branches one column right, children a column beyond — a site map or tree.", `
viz mindmap-horizontal "Docs Site Map" {
  item "Getting started" { item "Install"; item "First diagram" }
  item "Language" { item "Nodes & edges"; item "Styles"; item "Visualizations" }
  item "Guides" { item "Camera & timeline"; item "Annotations" }
  item "Reference" { item "API"; item "Style presets" }
}`),
  d("mindmap-vertical", "Brainstorming", "Mindmap — vertical", "Org-chart mindmap: root centered, branch cards above and below on elbow trunks.", `
viz mindmap-vertical "Engineering Org" {
  item "Platform" { item "Runtime"; item "Data" }
  item "Product" { item "Web"; item "Mobile" }
  item "Quality" { item "Test infra"; item "Release" }
}`),
  d("key-ideas", "Brainstorming", "Key ideas", "A row of lightbulbs, one per idea.", `
viz key-ideas "Retreat Themes" {
  item "Focus" "Fewer projects, finished properly"
  item "Craft" "Raise the quality bar everywhere"
  item "Speed" "Ship weekly, learn faster"
}`),
  d("list", "Brainstorming", "List", "A styled list; vertical up to 5 items, horizontal from 6.", `
viz list "Core Values" {
  item "Ship it" "Progress over polish theater" { icon: rocket }
  item "Own it" "No one else is coming" { icon: user }
  item "Say it" "Direct, kind feedback" { icon: chat }
  item "Learn it" "Curiosity as default" { icon: book }
}`),

  d("personas", "Brainstorming", "Personas", "A cast of sketchnote characters — poses, emotions, and props per role.", `
viz personas "The Launch Team" {
  item "The Builder" "Ships fast, hates meetings" { pose: confident, prop: wrench }
  item "The Skeptic" "Asks the hard questions" { pose: thinking, emotion: thinking }
  item "The Champion" "Sells the vision" { pose: cheering, prop: star }
  item "The Guide" "Points the way" { pose: pointing, emotion: happy }
}`),
  d("head-thoughts", "Brainstorming", "Head thoughts", "A profile-head container — what's going on in someone's mind.", `
viz head-thoughts "Inside the Customer's Head" {
  who: "Your customer"
  item "Will this save me time?" { icon: clock }
  item "Can I trust it?" { icon: shield }
  item "What does it cost?" { icon: dollar }
  item "Is it easy to leave?" { icon: key }
}`),
  d("quote", "Brainstorming", "Quote", "A big hand-lettered quote with attribution and a presenting character.", `
viz quote "The best way to predict the future is to invent it." {
  by: "Alan Kay"
  pose: presenting
}`),
  d("clouds", "Brainstorming", "Clouds", "Scattered thought-cloud islands — a loose collection of ideas.", `
viz clouds "What We Heard" {
  item "Onboarding is confusing" { icon: warning }
  item "Docs are loved" { icon: heart }
  item "Pricing feels fair" { icon: dollar }
  item "Mobile is missed" { icon: phone }
  item "Support is fast" { icon: rocket }
}`),

  // ---- Parts of a whole ---------------------------------------------------------------
  d("diverge", "Parts of a whole", "Diverge", "One question radiating to options.", `
viz diverge "How might we grow?" {
  item "New markets" "Expand geographically" { icon: globe }
  item "New products" "Adjacent use cases" { icon: bulb }
  item "Partnerships" "Distribution through allies" { icon: handshake }
  item "Pricing" "Capture more value" { icon: dollar }
}`),
  d("converge", "Parts of a whole", "Converge", "Many inputs focused into one output.", `
viz converge "Strategy Inputs" {
  item "Customer interviews" { icon: chat }
  item "Usage analytics" { icon: chart }
  item "Market research" { icon: search }
  item "Team retros" { icon: users }
  output "2026 Roadmap" { icon: doc }
}`),
  d("iceberg", "Parts of a whole", "Iceberg", "What's visible vs what lies beneath.", `
viz iceberg "Project Effort" {
  above "The demo" "What stakeholders see" { icon: eye }
  below "Testing & hardening" "Edge cases, monitoring, rollback"
  below "Infrastructure" "CI, environments, data migrations"
}`),

  // ---- Problems and Solutions -----------------------------------------------------------
  d("problem-solution", "Problems and Solutions", "Problem / solution", "A problem transformed through a central solution.", `
viz problem-solution "Support Overload" {
  problem "Ticket backlog" "400 open tickets, 3-day replies"
  solution "Self-serve help center"
  outcome "Faster answers" "70% deflection, same-day replies"
  support "Smooth migration for existing users"
  support "Weekly content reviews keep articles fresh"
}`),
  d("transformation", "Problems and Solutions", "Transformation", "Before → after, chaos settling into order.", `
viz transformation "Workflow Cleanup" {
  before "Manual chaos" "Spreadsheets and email threads"
  after "Streamlined flow" "One automated pipeline"
}`),
  d("challenges", "Problems and Solutions", "Challenges", "Hurdles spanning the gap between now and the goal.", `
viz challenges "Path to Launch" {
  from "Prototype" "Works on my machine"
  to "Production" "Reliable for everyone"
  item "Security review" "Close the audit findings"
  item "Scale testing" "Survive 10x load"
  item "Compliance" "SOC 2 evidence complete"
  action: "Clear every hurdle"
}`),
  d("bridge", "Problems and Solutions", "Bridge", "Planks carrying you across the gap.", `
viz bridge "Migration Plan" {
  from "Legacy stack" "Monolith on VMs"
  to "New platform" "Services on Kubernetes"
  item "Extract auth"
  item "Move billing"
  item "Split reporting"
  item "Retire monolith"
  action: "One service at a time"
}`),

  // ---- Visual Metaphors --------------------------------------------------------------------
  d("vision", "Visual Metaphors", "Vision", "Stairs rising to an open door.", `
viz vision "Where We're Headed" {
  current "Today" "Regional player, 2 products"
  vision "Global platform" "The door is open by 2028"
}`),
  d("impact", "Visual Metaphors", "Impact", "One cause radiating to effects.", `
viz impact "Faster Releases" {
  cause "Weekly ship cadence" { icon: rocket }
  item "Happier customers" "Fixes land in days, not months" { icon: heart }
  item "Tighter feedback" "Real usage guides the roadmap" { icon: chat }
  item "Team momentum" "Small wins compound" { icon: trend-up }
}`),
  d("performance", "Visual Metaphors", "Performance", "Side-by-side donut gauges.", `
viz performance "Quarterly KPIs" {
  summary: "All three programs are trending above target."
  item "Uptime" 99 "Rolling 90-day availability" { icon: shield }
  item "NPS" 62 "Promoters minus detractors" { icon: heart }
  item "Velocity" 85 "Committed vs delivered" { icon: rocket }
}`),
  d("bottleneck", "Visual Metaphors", "Bottleneck", "Flow crowding into a narrow neck.", `
viz bottleneck "Review Bottleneck" {
  in: "30 PRs/week"
  out: "8 merged"
  neck: "Two reviewers"
}`),
  d("hole", "Visual Metaphors", "Hole", "The pit — and the ladder out of it.", `
viz hole "Technical Debt Trap" {
  pit: "Shortcuts"
  ladder: "Refactor sprints"
  caption: "Every shortcut digs it deeper"
}`),
  d("trend", "Visual Metaphors", "Trend", "A staircase climbing up and to the right.", `
viz trend "Maturity Curve" {
  item "Ad hoc" "Heroics and hotfixes" { icon: fire }
  item "Repeatable" "Checklists and runbooks" { icon: doc }
  item "Automated" "CI/CD end to end" { icon: gear }
  item "Self-healing" "Systems fix themselves" { icon: star }
}`),
  d("race", "Visual Metaphors", "Race", "Contestants approaching the finish line.", `
viz race "Market Race" {
  item "Us" "38% share, up 6 pts" 78
  item "Competitor X" "31% share, flat" 61
}`),
  d("dialogue", "Visual Metaphors", "Dialogue", "A conversation in speech bubbles.", `
viz dialogue "Discovery Call" {
  a: "Customer"
  b: "Sales"
  msg "We spend hours copying data between tools." { speaker: a }
  msg "What would change if that sync was automatic?" { speaker: b }
  msg "We'd save a day a week, easily." { speaker: a }
  msg "Let me show you how the integration works." { speaker: b }
}`),
  d("lens", "Visual Metaphors", "Lens", "Inputs focused through a lens into one outcome.", `
viz lens "Research Focus" {
  item "Interviews" { icon: chat }
  item "Surveys" { icon: doc }
  item "Analytics" { icon: chart }
  output "Insight report" { icon: bulb }
}`),
  d("prism", "Visual Metaphors", "Prism", "One input refracted into many outputs.", `
viz prism "One Strategy, Many Wins" {
  input "Platform bet" { icon: diamond }
  item "Faster features" { icon: rocket }
  item "Lower costs" { icon: dollar }
  item "New integrations" { icon: puzzle }
  item "Happier devs" { icon: heart }
}`),
  d("pillar", "Visual Metaphors", "Pillar", "Classical columns holding up the mission.", `
viz pillar "Company Pillars" {
  mission: "A product people trust"
  item "Trust" "Security and reliability first" { icon: shield }
  item "Craft" "Quality in every detail" { icon: star }
  item "Pace" "Ship and learn weekly" { icon: rocket }
  item "Care" "Customers and each other" { icon: heart }
}`),

  d("tug-of-war", "Visual Metaphors", "Tug of war", "Two teams pulling — the marker drifts toward the stronger side.", `
viz tug-of-war "Ship now vs. polish" {
  side "Ship now" 3 {
    item "Market window closing"
    item "Competitor launched"
    item "Team is burning out"
  }
  side "Keep polishing" 1 {
    item "Two rough edges left"
  }
}`),

  d("lighthouse", "Visual Metaphors", "Lighthouse", "A beam sweeping over labeled rocks — guidance past the risks.", `
viz lighthouse "Compliance Guidance" {
  ship: "Launch plan"
  item "Data residency" "EU hosting required"
  item "Audit gaps" "SOC 2 evidence missing"
  item "Access sprawl" "Stale admin accounts"
}`),
  d("magnet", "Visual Metaphors", "Magnet", "A horseshoe magnet pulling item chips in — attraction and retention.", `
viz magnet "Why Devs Stay" {
  label: "Developer experience"
  item "Fast CI" { icon: rocket }
  item "Clear docs" { icon: book }
  item "Small PRs" { icon: check }
  item "Owned services" { icon: shield }
}`),

  // ---- Cause and Effect ------------------------------------------------------------------------
  d("fishbone", "Cause and Effect", "Fishbone", "Ishikawa diagram — cause categories on angled bones along a spine.", `
viz fishbone "Why Releases Slip" {
  bone "People" { item "Training gaps"; item "Turnover" }
  bone "Process" { item "No code review"; item "Manual QA" }
  bone "Tools" { item "Flaky CI"; item "Slow builds" }
  bone "Environment" { item "Noisy office"; item "Constant interrupts" }
}`),
  d("domino", "Cause and Effect", "Domino", "A chain reaction toppling left to right into the outcome.", `
viz domino "How the Outage Spread" {
  item "Config typo" "Deployed on Friday"
  item "Cache stampede"
  item "API brownout"
  item "Checkout down" "43 minutes"
}`),
  d("root-causes", "Cause and Effect", "Root causes", "A tree whose roots carry the causes.", `
viz root-causes "Why Releases Slip" {
  item "Unclear scope" "Requirements change mid-sprint"
  item "Hidden dependencies" "Teams discover coupling late"
  item "Manual testing" "QA becomes the bottleneck"
}`),
];

// ---- lookup ----------------------------------------------------------------

const BY_TYPE = new Map<string, VizDemo>(VIZ_DEMOS.map((demo) => [demo.type, demo]));

/** Every demo, in catalog order (one per registered template). */
export function listVizDemos(): VizDemo[] {
  return [...VIZ_DEMOS];
}

/** The demo for one viz template name (exact, then case-insensitive). */
export function getVizDemo(type: string): VizDemo | undefined {
  return BY_TYPE.get(type) ?? BY_TYPE.get(type.toLowerCase());
}

/** Catalog categories in presentation order (a gallery's section headings). */
export function listVizDemoCategories(): string[] {
  return [...new Set(VIZ_DEMOS.map((demo) => demo.category))];
}

/** The demos in one category, in catalog order. */
export function listVizDemosInCategory(category: string): VizDemo[] {
  return VIZ_DEMOS.filter((demo) => demo.category === category);
}

// ---- the animated form -----------------------------------------------------

/** Options for `animatedVizDemo` / `animateVizSource`. */
export interface VizAnimationOptions {
  /**
   * Reveal effect per beat: `"draw-on"` (default), `"fade"`, `"pop"`, `"sweep"`,
   * or `true` for the compiler default. `false` omits the option entirely —
   * which, since `animate:` is what switches auto-choreography on, means no
   * timeline at all.
   */
  animate?: "draw-on" | "fade" | "pop" | "sweep" | true | false;
  /** Auto-advance dwell per beat, in seconds (default 1.5). `false` omits it. */
  hold?: number | false;
  /** Focus each item with a magic-move camera (default true). */
  animateCamera?: boolean;
}

/** What `animatedVizDemo(type)` injects when you pass no options. */
export const VIZ_ANIMATION_DEFAULTS = { animate: "draw-on", hold: 1.5, animateCamera: true } as const;

function animationOptionLines(opts: VizAnimationOptions): string[] {
  const animate = opts.animate === undefined ? VIZ_ANIMATION_DEFAULTS.animate : opts.animate;
  const hold = opts.hold === undefined ? VIZ_ANIMATION_DEFAULTS.hold : opts.hold;
  const camera = opts.animateCamera === undefined ? VIZ_ANIMATION_DEFAULTS.animateCamera : opts.animateCamera;
  const lines: string[] = [];
  if (animate !== false) lines.push(`animate: ${animate === true ? "true" : animate}`);
  if (hold !== false) lines.push(`hold: ${hold}`);
  if (camera) lines.push("animateCamera: true");
  return lines;
}

/** Indentation of the first non-blank line after `{` at `braceEnd` (default 2 spaces). */
function bodyIndent(code: string, braceEnd: number): string {
  const rest = code.slice(braceEnd);
  const m = /\n([ \t]+)\S/.exec(rest);
  return m ? m[1] : "  ";
}

/**
 * Inject block-level options into every top-level `viz … { … }` block of an
 * `.edd` source, skipping any option the source already sets. Pure text
 * surgery — it never reformats the rest of the file — and quote-, comment- and
 * brace-aware so a `"""…"""` mermaid block or a nested `{ … }` can't fool it.
 */
export function injectVizOptions(code: string, lines: string[]): string {
  if (!lines.length) return code;
  let out = "";
  let i = 0;
  let depth = 0;
  let sawVizKeyword = false;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    // strings (including the """ … """ raw block form)
    if (code.startsWith('"""', i)) {
      const close = code.indexOf('"""', i + 3);
      const end = close < 0 ? len : close + 3;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < len && code[j] !== ch) j += code[j] === "\\" ? 2 : 1;
      out += code.slice(i, Math.min(j + 1, len));
      i = j + 1;
      continue;
    }
    // comments
    if ((ch === "/" && code[i + 1] === "/") || (ch === "%" && code[i + 1] === "%")) {
      const nl = code.indexOf("\n", i);
      const end = nl < 0 ? len : nl;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      const end = close < 0 ? len : close + 2;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "{") {
      out += ch;
      i++;
      if (depth === 0 && sawVizKeyword) {
        const indent = bodyIndent(code, i);
        const body = vizBlockBody(code, i);
        const wanted = lines.filter((l) => !new RegExp(`^\\s*${l.split(":")[0].trim()}\\s*:`, "m").test(body));
        if (wanted.length) out += "\n" + wanted.map((l) => indent + l).join("\n");
      }
      if (depth === 0) sawVizKeyword = false;
      depth++;
      continue;
    }
    if (ch === "}") {
      out += ch;
      i++;
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && /[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < len && /[\w-]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (word === "viz") sawVizKeyword = true;
      out += word;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Source text of the block opened by the `{` that ends at `braceEnd`. */
function vizBlockBody(code: string, braceEnd: number): string {
  let depth = 1;
  let i = braceEnd;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      i++;
      while (i < code.length && code[i] !== ch) i += code[i] === "\\" ? 2 : 1;
    } else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return code.slice(braceEnd, i - 1);
}

/**
 * The animated form of an `.edd` source: the same diagram with
 * `animate: draw-on`, `hold: 1.5` and `animateCamera: true` added to each
 * top-level `viz` block, which is what makes the compiler synthesize a
 * multi-beat storyboard — an overview beat, one captioned beat per data item
 * (with `autoAdvanceMs` from `hold`), and a closing fit-all — in `scene.steps`.
 */
export function animateVizSource(code: string, opts: VizAnimationOptions = {}): string {
  return injectVizOptions(code, animationOptionLines(opts));
}

/**
 * The animated form of a catalog demo, ready for a frame-driven host:
 *
 * ```ts
 * const { scene } = compileEdd(animatedVizDemo("flowchart"));
 * scene.steps; // overview + one captioned beat per item + fit-all
 * ```
 *
 * Throws on an unknown template name — pass a `listVizDemos()` type.
 */
export function animatedVizDemo(type: string, opts: VizAnimationOptions = {}): string {
  const demo = getVizDemo(type);
  if (!demo) throw new Error(`no viz demo for '${type}' — see listVizDemos()`);
  return animateVizSource(demo.code, opts);
}
