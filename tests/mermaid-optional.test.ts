/**
 * `@excalidraw/mermaid-to-excalidraw` is an OPTIONAL PEER dependency (0.15.0):
 * `npm i edododraw` installs 8 packages / 4.4 MB instead of 122 / 68 MB,
 * because that one package drags in mermaid -> d3 -> cytoscape -> katex.
 *
 * The deal is that `mermaid """ … """` blocks stop working out of the box, so
 * the failure MUST name the fix. These tests pin that contract.
 */

import { describe, expect, it, vi } from "vitest";

// Simulate the package not being installed: the lazy `import()` inside
// loadParser() rejects exactly the way an unresolvable specifier does.
vi.mock("@excalidraw/mermaid-to-excalidraw", () => {
  throw new Error("Failed to resolve module specifier '@excalidraw/mermaid-to-excalidraw'");
});

import { convertMermaid, isMermaidAvailable, MERMAID_INSTALL_HINT, extractMermaidBlocks } from "@engine/import/mermaid.js";

describe("mermaid as an optional peer dependency", () => {
  it("the install hint names the exact command to run", () => {
    expect(MERMAID_INSTALL_HINT).toContain("npm i @excalidraw/mermaid-to-excalidraw");
    expect(MERMAID_INSTALL_HINT).toContain("optional peer dependency");
    // and says the rest of the diagram is fine, so nobody thinks it's fatal
    expect(MERMAID_INSTALL_HINT).toContain("the rest of the diagram renders without it");
  });

  it("converting without the runtime throws the actionable hint, not a module-resolution error", async () => {
    await expect(convertMermaid("flowchart LR\n A --> B")).rejects.toThrow(/npm i @excalidraw\/mermaid-to-excalidraw/);
  });

  it("isMermaidAvailable reports false instead of throwing", async () => {
    await expect(isMermaidAvailable()).resolves.toBe(false);
  });

  it("everything that does NOT need the runtime keeps working", () => {
    // block extraction is pure string work — no dependency at all
    expect(extractMermaidBlocks(`scene {\n mermaid """\nflowchart LR\n A --> B\n"""\n}`)).toEqual(["flowchart LR\n A --> B\n"]);
  });
});
