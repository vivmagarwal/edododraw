/**
 * Tests for the pure `extractMermaidBlocks` string helper in
 * src/engine/import/mermaid.ts. We deliberately do NOT call `convertMermaid`,
 * which needs the mermaid runtime + a real DOM and would hang under vitest.
 */

import { describe, expect, it } from "vitest";
import { extractMermaidBlocks } from "@engine/import/mermaid.js";

describe("extractMermaidBlocks", () => {
  it("returns an empty array when there is no mermaid block", () => {
    expect(extractMermaidBlocks("scene { a -> b }")).toEqual([]);
    expect(extractMermaidBlocks("")).toEqual([]);
  });

  it("extracts a single block body and trims the leading newline", () => {
    const src = 'mermaid """\ngraph TD\n  A-->B\n"""';
    expect(extractMermaidBlocks(src)).toEqual(["graph TD\n  A-->B\n"]);
  });

  it("extracts multiple blocks in source order", () => {
    const src = [
      'mermaid """\nflowchart LR\n  X-->Y\n"""',
      "scene { rect r }",
      'mermaid """\nsequenceDiagram\n  A->>B: hi\n"""',
    ].join("\n\n");
    const blocks = extractMermaidBlocks(src);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("flowchart LR\n  X-->Y\n");
    expect(blocks[1]).toBe("sequenceDiagram\n  A->>B: hi\n");
  });

  it("tolerates no space between `mermaid` and the opening quotes", () => {
    expect(extractMermaidBlocks('mermaid"""graph TD"""')).toEqual(["graph TD"]);
  });

  it("only strips a single leading newline, keeping subsequent blank lines", () => {
    const src = 'mermaid """\n\ngraph TD"""';
    expect(extractMermaidBlocks(src)).toEqual(["\ngraph TD"]);
  });

  it("captures an empty body as an empty string", () => {
    expect(extractMermaidBlocks('mermaid """"""')).toEqual([""]);
  });
});
