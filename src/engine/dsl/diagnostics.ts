/**
 * Diagnostics — structured, multi-error, with source spans and fix hints
 * (language spec §12.8). The parser and resolver accumulate these; none of them
 * abort the pipeline (except a total lexer failure, which can't happen since the
 * lexer is permissive).
 */

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  code: string; // stable machine code, e.g. "E-EDGE-NOOP"
  message: string;
  line: number; // 1-based
  col: number; // 1-based
  start: number; // source offset
  end: number;
  expected?: string;
  found?: string;
  hint?: string;
}

export class DiagnosticBag {
  readonly items: Diagnostic[] = [];

  add(d: Diagnostic): void {
    this.items.push(d);
  }

  error(code: string, message: string, at: { line: number; col: number; start: number; end: number }, extra?: Partial<Diagnostic>): void {
    this.items.push({ severity: "error", code, message, ...at, ...extra });
  }

  warn(code: string, message: string, at: { line: number; col: number; start: number; end: number }, extra?: Partial<Diagnostic>): void {
    this.items.push({ severity: "warning", code, message, ...at, ...extra });
  }

  get hasErrors(): boolean {
    return this.items.some((d) => d.severity === "error");
  }

  get errors(): Diagnostic[] {
    return this.items.filter((d) => d.severity === "error");
  }
}

/** Nearest match from a closed menu (Levenshtein) — for "did you mean" hints. */
export function nearest(word: string, menu: Iterable<string>): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const m of menu) {
    const d = levenshtein(word.toLowerCase(), m.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  // only suggest if reasonably close
  return best !== null && bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Human-readable formatting of a diagnostic against the source (spec §12.8). */
export function formatDiagnostic(d: Diagnostic, source: string, file = "input.edd"): string {
  const lines = source.split("\n");
  const srcLine = lines[d.line - 1] ?? "";
  const caret = " ".repeat(Math.max(0, d.col - 1)) + "^".repeat(Math.max(1, d.end - d.start));
  let out = `${d.severity} [${d.code}] ${file}:${d.line}:${d.col}: ${d.message}\n  ${srcLine}\n  ${caret}`;
  if (d.expected || d.found) out += `\n  expected: ${d.expected ?? "?"} ; found: ${d.found ?? "?"}`;
  if (d.hint) out += `\n  hint: ${d.hint}`;
  return out;
}
