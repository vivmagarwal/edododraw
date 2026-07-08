/**
 * Public DSL entrypoint: source text -> { scene, diagnostics }.
 * This is the "100% code -> diagram" contract.
 */

import { compileProgram } from "./compile.js";
import { DiagnosticBag, formatDiagnostic } from "./diagnostics.js";
import { parse } from "./parser.js";
import type { Scene } from "../scene/types.js";

export interface CompileEddResult {
  scene: Scene;
  diagnostics: DiagnosticBag;
  /** Formatted, human-readable diagnostics (one block each). */
  report: string[];
}

export function compileEdd(source: string): CompileEddResult {
  const { program, diagnostics } = parse(source);
  const { scene } = compileProgram(program, { diagnostics });
  const report = diagnostics.items.map((d) => formatDiagnostic(d, source));
  return { scene, diagnostics, report };
}

export { parse } from "./parser.js";
export { compileProgram } from "./compile.js";
export { lex } from "./lexer.js";
export { DiagnosticBag, formatDiagnostic } from "./diagnostics.js";
export type { Diagnostic } from "./diagnostics.js";
