/**
 * Minimal line-icon glyph library for viz templates (`icon: rocket` on an
 * item). Hand-authored 24×24 stroke-only paths, sketched by rough.js like any
 * other shape so they inherit the hand-drawn look. Unknown names render
 * nothing (generators lay out fine without icons).
 */

export const ICON_VIEWBOX = 24;

const ICONS: Record<string, string> = {
  check: "M4 13 L10 19 L20 5",
  x: "M5 5 L19 19 M19 5 L5 19",
  plus: "M12 4 L12 20 M4 12 L20 12",
  minus: "M4 12 L20 12",
  "arrow-up": "M12 20 L12 4 M6 10 L12 4 L18 10",
  "arrow-down": "M12 4 L12 20 M6 14 L12 20 L18 14",
  "arrow-right": "M4 12 L20 12 M14 6 L20 12 L14 18",
  "arrow-left": "M20 12 L4 12 M10 6 L4 12 L10 18",
  "trend-up": "M3 18 L9 12 L13 15 L21 6 M15 6 L21 6 L21 12",
  "trend-down": "M3 6 L9 12 L13 9 L21 18 M15 18 L21 18 L21 12",
  star: "M12 3 L14.6 9 L21 9.6 L16.2 14 L17.6 20.5 L12 17 L6.4 20.5 L7.8 14 L3 9.6 L9.4 9 Z",
  heart: "M12 20 C5 14 3.5 10 5.5 7.5 C7.5 5 10.5 5.5 12 8 C13.5 5.5 16.5 5 18.5 7.5 C20.5 10 19 14 12 20 Z",
  flag: "M6 21 L6 4 M6 4 C9 2.5 12 5.5 15 4 C16.5 3.3 18 3.5 18 3.5 L18 12 C15 13.5 12 10.5 6 13",
  target: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M12 12 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 M12 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
  bulb: "M9 18 L15 18 M10 21 L14 21 M12 3 C8 3 6 6 6 9 C6 12 8 13 9 15 L15 15 C16 13 18 12 18 9 C18 6 16 3 12 3 Z",
  gear: "M12 8 a4 4 0 1 0 0.01 0 Z M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M19.1 4.9 L17 7 M7 17 L4.9 19.1",
  user: "M12 11 a4 4 0 1 0 -0.01 0 Z M4 21 C4 16.5 7.5 14 12 14 C16.5 14 20 16.5 20 21",
  users: "M9 10 a3.2 3.2 0 1 0 -0.01 0 Z M3 20 C3 16 5.5 13.8 9 13.8 C12.5 13.8 15 16 15 20 M16 10.5 a3 3 0 1 0 -0.01 0 Z M15.5 13.5 C19 13.6 21 15.8 21 19",
  clock: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M12 6.5 L12 12 L16 14.5",
  calendar: "M4 6 L20 6 L20 21 L4 21 Z M4 10.5 L20 10.5 M8 3.5 L8 8 M16 3.5 L16 8",
  rocket: "M12 2.5 C15 4.5 16.5 8.5 15.5 13 L8.5 13 C7.5 8.5 9 4.5 12 2.5 Z M8.5 13 L5.5 17 L8.8 16 M15.5 13 L18.5 17 L15.2 16 M10 16.5 L9.5 21 L12 18.8 L14.5 21 L14 16.5 M12 8 a1.6 1.6 0 1 0 0.01 0",
  trophy: "M7 4 L17 4 L17 10 C17 13 15 15 12 15 C9 15 7 13 7 10 Z M7 5.5 L4 5.5 C4 9 5.5 10.7 7 10.7 M17 5.5 L20 5.5 C20 9 18.5 10.7 17 10.7 M12 15 L12 18 M8.5 21 L15.5 21 M10 18 L14 18 L14.7 21 L9.3 21 Z",
  medal: "M12 15 m-5.5 0 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0 M8.5 10.5 L5.5 3 L9.5 3 L12 8 L14.5 3 L18.5 3 L15.5 10.5",
  search: "M10.5 10.5 m-6.5 0 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0 M15.5 15.5 L21 21",
  warning: "M12 3 L22 20 L2 20 Z M12 9.5 L12 14.5 M12 17 L12 17.5",
  dollar: "M12 3 L12 21 M16.5 6.5 C15.5 5.3 14 4.8 12 4.8 C9.5 4.8 8 6 8 8 C8 12.3 16 10 16 15 C16 17.3 14.3 18.7 12 18.7 C9.8 18.7 8.2 17.8 7.3 16.3",
  chart: "M4 3 L4 21 L21 21 M8 17 L8 11 M12.5 17 L12.5 7 M17 17 L17 13",
  pie: "M12 12 L12 3 A9 9 0 1 1 4.5 16.5 Z M12 12 L20.5 9 A9 9 0 0 0 12 3 Z",
  doc: "M6 2.5 L15 2.5 L19 6.5 L19 21.5 L6 21.5 Z M15 2.5 L15 6.5 L19 6.5 M9 11 L16 11 M9 14.5 L16 14.5 M9 18 L13.5 18",
  mail: "M3 6 L21 6 L21 19 L3 19 Z M3 7 L12 13.5 L21 7",
  chat: "M4 4 L20 4 L20 16 L11 16 L6.5 20 L6.5 16 L4 16 Z",
  home: "M3.5 11.5 L12 4 L20.5 11.5 M6 10 L6 20 L18 20 L18 10 M10 20 L10 14.5 L14 14.5 L14 20",
  globe: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M3 12 L21 12 M12 3 C15 6 15.5 17.5 12 21 M12 3 C9 6 8.5 17.5 12 21",
  lock: "M6.5 11 L17.5 11 L17.5 20.5 L6.5 20.5 Z M8.5 11 L8.5 7.5 A3.5 3.5 0 0 1 15.5 7.5 L15.5 11",
  key: "M8 14.5 a4.2 4.2 0 1 0 -0.01 0 Z M11 12 L20.5 12 M17 12 L17 15.5 M20 12 L20 14.5",
  leaf: "M5.5 18.5 C4 11 8.5 5 19.5 4.5 C20 14 14.5 19.5 8 18.2 M5.5 18.5 C8.5 14 12 10.5 16 8",
  fire: "M12 21 C7.5 21 5.5 17.8 5.5 15 C5.5 11 9 9.5 9.5 6 C11.5 7.5 12.2 9.2 12 11.5 C13.5 10.7 14.3 9.3 14.3 7.5 C17 9.5 18.5 12.5 18.5 15 C18.5 17.8 16.5 21 12 21 Z",
  drop: "M12 3 C15.8 8 18 11.2 18 14.4 A6 6 0 0 1 6 14.4 C6 11.2 8.2 8 12 3 Z",
  cloud: "M6.5 18.5 C3.8 18.5 2.5 16.7 2.5 15 C2.5 13.2 3.8 11.8 5.6 11.6 C5.9 8.5 8.3 6.5 11.2 6.5 C13.8 6.5 15.9 8 16.6 10.5 C19.3 10.6 21.5 12.2 21.5 14.7 C21.5 16.8 19.8 18.5 17.5 18.5 Z",
  database: "M12 5.5 C16 5.5 19 4.7 19 3.8 L19 20 C19 21 16 21.8 12 21.8 C8 21.8 5 21 5 20 L5 3.8 C5 4.7 8 5.5 12 5.5 Z M5 3.8 C5 2.9 8 2.2 12 2.2 C16 2.2 19 2.9 19 3.8 M5 9.5 C5 10.4 8 11.2 12 11.2 C16 11.2 19 10.4 19 9.5 M5 15 C5 15.9 8 16.7 12 16.7 C16 16.7 19 15.9 19 15",
  shield: "M12 2.5 L20 5.5 L20 12 C20 16.5 16.7 20 12 21.8 C7.3 20 4 16.5 4 12 L4 5.5 Z",
  eye: "M2.5 12 C5 7.5 8.5 5.5 12 5.5 C15.5 5.5 19 7.5 21.5 12 C19 16.5 15.5 18.5 12 18.5 C8.5 18.5 5 16.5 2.5 12 Z M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0",
  book: "M12 5.5 C10 3.8 7.5 3.4 4 3.5 L4 19 C7.5 18.9 10 19.3 12 21 C14 19.3 16.5 18.9 20 19 L20 3.5 C16.5 3.4 14 3.8 12 5.5 Z M12 5.5 L12 21",
  wrench: "M14.5 6.5 a4.5 4.5 0 0 1 6 -2 L17 8 L16 12 L20 11 L23.5 7.5 M16 12 L5 21 A2.1 2.1 0 0 1 3 19 L14.5 6.5",
  phone: "M5 3 L9 3 L10.5 8 L8 10 C9 12.5 11.5 15 14 16 L16 13.5 L21 15 L21 19 C21 20 20 21 19 21 C10.5 20.5 3.5 13.5 3 5 C3 4 4 3 5 3 Z",
  megaphone: "M3 10 L3 14 L6 14 L13 18.5 L13 5.5 L6 10 Z M13 9 C15.5 9 17 10.3 17 12 C17 13.7 15.5 15 13 15 M6 14 L7.5 20 L10 20 L9 14.5",
  handshake: "M2.5 7 L8 5 L13 7.5 L9.5 10.5 C8.8 11.2 9.5 12.4 10.6 12 L14.5 9 L21.5 7 M21.5 15.5 L17.5 17 L11.5 19.5 L4.5 15 M14.5 9 L18.5 13 M6.5 13.5 L9 16 M9 16 L11 17.8",
  scale: "M12 3.5 L12 20.5 M8 20.5 L16 20.5 M4 6.5 L20 6.5 M6 6.5 L3 12.5 L9 12.5 Z M18 6.5 L15 12.5 L21 12.5 Z",
  puzzle: "M9 4 L9 6 A2 2 0 1 0 13 6 L13 4 L19 4 L19 9 L17.5 9 A2 2 0 1 0 17.5 13 L19 13 L19 19 L14 19 L14 17 A2 2 0 1 0 10 17 L10 19 L4 19 L4 13 L6 13 A2 2 0 1 0 6 9 L4 9 L4 4 Z",
  diamond: "M12 3 L21 12 L12 21 L3 12 Z",
  circle: "M12 12 m-8.5 0 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0",
  // ---- 0.13: accessibility / learning / AI glyphs ---------------------------
  // side-view wheelchair user: head, backrest+seat, shin+footrest, one big wheel
  wheelchair: "M9 3.6 m-2.8 0 a2.8 2.8 0 1 0 5.6 0 a2.8 2.8 0 1 0 -5.6 0 M9 6.4 L9.5 11.5 L15 11.5 L16.8 16 L20 16 M10.5 17 m-4.2 0 a4.2 4.2 0 1 0 8.4 0 a4.2 4.2 0 1 0 -8.4 0",
  // two rails + four rungs
  ladder: "M7 2.5 L7 21.5 M17 2.5 L17 21.5 M7 6 L17 6 M7 10 L17 10 M7 14 L17 14 M7 18 L17 18",
  // two uprights, two overhanging planks, an X brace between them
  scaffold: "M6 3 L6 21 M18 3 L18 21 M3 9 L21 9 M3 16 L21 16 M6 9 L18 16 M18 9 L6 16",
  // one big four-point sparkle + a small companion (AI / magic)
  sparkle: "M11 5 C11.5 9.8 14.2 12.5 19 13 C14.2 13.5 11.5 16.2 11 21 C10.5 16.2 7.8 13.5 3 13 C7.8 12.5 10.5 9.8 11 5 Z M19 2 L19 9 M15.5 5.5 L22.5 5.5",
  // boxy head with antenna, two eyes, a mouth and side "ears"
  robot: "M5 8 L19 8 L19 19.5 L5 19.5 Z M12 8 L12 4.5 M10 3.5 L14 3.5 M9 11 L9 14 M15 11 L15 14 M8.5 17 L15.5 17 M2 11.5 L2 15.5 M2 13.5 L5 13.5 M22 11.5 L22 15.5 M19 13.5 L22 13.5",
  // two lobes, central fissure, a few gyri
  brain: "M12 4 C9.5 2.5 6 3.5 5.5 6.5 C3 7.5 2.5 11 4 12.5 C2.5 14.5 3.5 17.5 6 18 C6.5 20.5 9.5 21.5 12 19.5 M12 4 C14.5 2.5 18 3.5 18.5 6.5 C21 7.5 21.5 11 20 12.5 C21.5 14.5 20.5 17.5 18 18 C17.5 20.5 14.5 21.5 12 19.5 M12 4 L12 19.5 M8 8 C9.5 8 10 9.5 9 10.5 M16 8 C14.5 8 14 9.5 15 10.5 M7 13.5 C8.5 13.2 9.5 14.5 9 15.8 M17 13.5 C15.5 13.2 14.5 14.5 15 15.8",
  // mortarboard + cap body + tassel
  "graduation-cap": "M12 4 L22 9 L12 14 L2 9 Z M6 11.2 L6 16 C6 18.2 9 19.6 12 19.6 C15 19.6 18 18.2 18 16 L18 11.2 M22 9 L22 15.5 M22 16.5 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0",
};

const ALIASES: Record<string, string> = {
  tick: "check",
  cross: "x",
  close: "x",
  up: "arrow-up",
  down: "arrow-down",
  right: "arrow-right",
  left: "arrow-left",
  growth: "trend-up",
  decline: "trend-down",
  idea: "bulb",
  lightbulb: "bulb",
  settings: "gear",
  cog: "gear",
  person: "user",
  people: "users",
  team: "users",
  time: "clock",
  date: "calendar",
  launch: "rocket",
  award: "trophy",
  winner: "trophy",
  magnifier: "search",
  lens: "search",
  alert: "warning",
  money: "dollar",
  revenue: "dollar",
  bar: "chart",
  graph: "chart",
  document: "doc",
  file: "doc",
  email: "mail",
  message: "chat",
  talk: "chat",
  house: "home",
  world: "globe",
  security: "lock",
  water: "drop",
  db: "database",
  view: "eye",
  learn: "book",
  tool: "wrench",
  call: "phone",
  announce: "megaphone",
  deal: "handshake",
  balance: "scale",
  justice: "scale",
  piece: "puzzle",
  gem: "diamond",
  accessibility: "wheelchair",
  ai: "sparkle",
  magic: "sparkle",
  bot: "robot",
  graduate: "graduation-cap",
  school: "graduation-cap",
};

// Runtime-registered icons (package consumers extending the glyph set).
const REGISTERED = new Map<string, { d: string; viewBox: number }>();

/**
 * Register a custom icon usable from any viz item (`icon: mylogo`) — stroke
 * paths only (they're sketched by rough.js like everything else, so filled
 * paths won't look right). `viewBox` is the square design size the path was
 * authored at (default 24, like the built-ins). Re-registering a name
 * replaces it; built-in names can be shadowed.
 */
export function registerIcon(name: string, d: string, opts: { viewBox?: number; aliases?: string[] } = {}): void {
  const entry = { d, viewBox: opts.viewBox ?? ICON_VIEWBOX };
  REGISTERED.set(name.trim().toLowerCase(), entry);
  for (const a of opts.aliases ?? []) REGISTERED.set(a.trim().toLowerCase(), entry);
}

/** Resolve an icon name (or alias) to its path + design viewBox. */
export function iconEntry(name: string | undefined): { d: string; viewBox: number } | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  const reg = REGISTERED.get(key);
  if (reg) return reg;
  const d = ICONS[key] ?? ICONS[ALIASES[key] ?? ""];
  return d ? { d, viewBox: ICON_VIEWBOX } : undefined;
}

export function iconPath(name: string | undefined): string | undefined {
  return iconEntry(name)?.d;
}

export function listIcons(): string[] {
  return [...new Set([...Object.keys(ICONS), ...REGISTERED.keys()])];
}
