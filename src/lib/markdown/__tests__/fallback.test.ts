/**
 * Fallback Graceful Degradation Tests (R4)
 *
 * Tests that unregistered node types don't cause data loss.
 * Uses base-only registry (paragraph, text, hardBreak) — no heading, bold, etc.
 *
 * Principle: "Structure may be lost, but text data is never lost."
 */

import { describe, it, expect } from "vitest";

import {
  RegistryBuilder,
  createProcessor,
  mdastToProseMirror,
  proseMirrorToMdast,
} from "@ulpaso/markdown";

// ── Base-only registry (no heading, bold, italic, code handlers) ──

function createBaseOnlyRegistry() {
  return new RegistryBuilder().addBase().build();
}

// ── Tests ──

describe("Fallback: mdast → PM (unregistered block nodes)", () => {
  it("heading falls back to paragraph preserving text", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pm = mdastToProseMirror(proc.parse("# Hello"), registry);
    const json = JSON.stringify(pm);

    // Text must survive even though heading handler is not registered
    expect(json).toContain("Hello");
  });

  it("blockquote falls back preserving text", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pm = mdastToProseMirror(proc.parse("> quoted text"), registry);
    const json = JSON.stringify(pm);

    expect(json).toContain("quoted text");
  });

  it("code block falls back preserving value", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pm = mdastToProseMirror(proc.parse("```\nconst x = 1\n```"), registry);
    const json = JSON.stringify(pm);

    expect(json).toContain("const x = 1");
  });

  it("thematic break (no text) is safely skipped", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    // Should not throw
    const pm = mdastToProseMirror(proc.parse("---"), registry);
    expect(pm.type).toBe("doc");
  });
});

describe("Fallback: mdast → PM (unregistered inline nodes)", () => {
  it("emphasis falls back preserving text", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pm = mdastToProseMirror(proc.parse("*italic text*"), registry);
    const json = JSON.stringify(pm);

    // italic mark is lost, but text survives
    expect(json).toContain("italic text");
  });

  it("strong falls back preserving text", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pm = mdastToProseMirror(proc.parse("**bold text**"), registry);
    const json = JSON.stringify(pm);

    expect(json).toContain("bold text");
  });

  it("inline code falls back preserving value", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pm = mdastToProseMirror(proc.parse("`some code`"), registry);
    const json = JSON.stringify(pm);

    expect(json).toContain("some code");
  });
});

describe("Fallback: PM → mdast (unregistered PM nodes)", () => {
  it("unknown block node with text content is preserved", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pmJson = {
      type: "doc",
      content: [
        {
          type: "unknownBlock",
          content: [{ type: "text", text: "preserved text" }],
        },
      ],
    };

    const mdast = proseMirrorToMdast(pmJson, registry);
    const md = proc.stringify(mdast);

    expect(md).toContain("preserved text");
  });

  it("unknown inline node with text property is preserved", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pmJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "unknownInline", text: "inline data" }],
        },
      ],
    };

    const mdast = proseMirrorToMdast(pmJson, registry);
    const md = proc.stringify(mdast);

    expect(md).toContain("inline data");
  });

  it("unknown inline node with attrs label is preserved", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pmJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { label: "@john" } }],
        },
      ],
    };

    const mdast = proseMirrorToMdast(pmJson, registry);
    const md = proc.stringify(mdast);

    expect(md).toContain("@john");
  });

  it("unknown block with no content is safely skipped", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const pmJson = {
      type: "doc",
      content: [
        { type: "unknownEmpty" },
        { type: "paragraph", content: [{ type: "text", text: "after" }] },
      ],
    };

    const mdast = proseMirrorToMdast(pmJson, registry);
    const md = proc.stringify(mdast);

    expect(md).toContain("after");
  });
});

describe("Fallback: end-to-end with mixed content", () => {
  it("document with unsupported syntax preserves all text", () => {
    const proc = createProcessor();
    const registry = createBaseOnlyRegistry();

    const md = "# Title\n\nParagraph text\n\n> Quoted\n\n`code`";
    const pm = mdastToProseMirror(proc.parse(md), registry);
    const back = proc.stringify(proseMirrorToMdast(pm, registry));

    // All text content must survive (structure may differ)
    expect(back).toContain("Title");
    expect(back).toContain("Paragraph text");
    expect(back).toContain("Quoted");
    expect(back).toContain("code");
  });
});
