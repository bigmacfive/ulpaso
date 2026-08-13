import type {
  Delete,
  Emphasis,
  Link,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  Strong,
  Text,
} from "mdast";

import type {
  ConversionRegistry,
  MdastToPmBlockHandler,
  MdastToPmContext,
  MdastToPmInlineHandler,
  PMMarkJSON,
  PMNodeJSON,
} from "./types.js";
import { warnMissingHandler } from "./diagnostics.js";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Convert an mdast Root tree into a ProseMirror-compatible JSON document.
 *
 * Uses the provided ConversionRegistry for dispatch.
 */
export function mdastToProseMirror(tree: Root, registry: ConversionRegistry): PMNodeJSON {
  const ctx = createContext(registry);
  return {
    type: "doc",
    content: ctx.convertBlockChildren(tree.children as Nodes[]),
  };
}

// ── Context factory ─────────────────────────────────────────────────────

function createContext(registry: ConversionRegistry): MdastToPmContext {
  const ctx: MdastToPmContext = {
    convertBlockChildren(nodes: Nodes[]): PMNodeJSON[] {
      return convertBlockChildren(nodes, registry, ctx);
    },
    convertInlineChildren(nodes: PhrasingContent[]): PMNodeJSON[] {
      return convertInlineChildren(nodes, registry, ctx);
    },
    convertInline(node: PhrasingContent, marks: PMMarkJSON[]): PMNodeJSON[] {
      return convertInline(node, marks, registry, ctx);
    },
  };
  return ctx;
}

// ── Engine (registry dispatch) ──────────────────────────────────────────

function convertBlockChildren(
  nodes: Nodes[],
  registry: ConversionRegistry,
  ctx: MdastToPmContext,
): PMNodeJSON[] {
  const result: PMNodeJSON[] = [];
  for (const node of nodes) {
    const handler = registry.mdastToPm.block[node.type];
    // [R4] Graceful degradation: fallback instead of silent drop
    const converted = handler ? handler(node, ctx) : fallbackBlockToPm(node, registry, ctx);
    if (converted) result.push(...converted);
  }
  return result.length > 0 ? result : [{ type: "paragraph" }];
}

function convertInlineChildren(
  nodes: PhrasingContent[],
  registry: ConversionRegistry,
  ctx: MdastToPmContext,
): PMNodeJSON[] {
  const result: PMNodeJSON[] = [];
  for (const node of nodes) {
    result.push(...convertInline(node, [], registry, ctx));
  }
  return mergeAdjacentText(result);
}

function convertInline(
  node: PhrasingContent,
  marks: PMMarkJSON[],
  registry: ConversionRegistry,
  ctx: MdastToPmContext,
): PMNodeJSON[] {
  const handler = registry.mdastToPm.inline[node.type];
  if (handler) return handler(node, marks, ctx);
  // [R4] Graceful degradation: fallback instead of silent drop
  return fallbackInlineToPm(node, marks, ctx);
}

// ── [R4] Fallback functions ─────────────────────────────────────────────

/**
 * Fallback for unregistered mdast block nodes → PM.
 * Preserves text content even when the node type is unknown.
 *
 * Strategy:
 * 1. If node has children → unwrap and recurse (block or inline based on registry lookup)
 * 2. If node has value → wrap in paragraph > text
 * 3. Otherwise → skip (truly empty node)
 */
function fallbackBlockToPm(
  node: Nodes,
  registry: ConversionRegistry,
  ctx: MdastToPmContext,
): PMNodeJSON[] | null {
  warnMissingHandler(`[Markdown] No mdast→PM block handler for "${node.type}", using fallback`);
  // 1) children → unwrap and recurse
  if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
    const children = node.children as (Nodes | PhrasingContent)[];
    const firstChild = children[0] as Nodes;

    // [R4] Registry-based block/inline discrimination instead of hardcoded Set.
    if (firstChild?.type && registry.mdastToPm.block[firstChild.type]) {
      const blocks = ctx.convertBlockChildren(children as Nodes[]);
      if (blocks.length === 1 && blocks[0].type === "paragraph" && !blocks[0].content) {
        return null;
      }
      return blocks;
    }

    // Default: treat as inline → paragraph wrapping (safe fallback)
    const content = ctx.convertInlineChildren(children as PhrasingContent[]);
    return content.length > 0 ? [{ type: "paragraph", content }] : null;
  }
  // 2) value → text preservation
  if ("value" in node && typeof node.value === "string" && node.value.length > 0) {
    return [{ type: "paragraph", content: [{ type: "text", text: node.value }] }];
  }
  // 3) truly empty → skip
  return null;
}

/**
 * Fallback for unregistered mdast inline nodes → PM.
 * Preserves text content with current marks.
 */
function fallbackInlineToPm(
  node: PhrasingContent,
  marks: PMMarkJSON[],
  ctx: MdastToPmContext,
): PMNodeJSON[] {
  warnMissingHandler(`[Markdown] No mdast→PM inline handler for "${node.type}", using fallback`);
  // 1) children → propagate marks and recurse
  if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
    const result: PMNodeJSON[] = [];
    for (const child of node.children) {
      result.push(...ctx.convertInline(child, marks));
    }
    return result;
  }
  // 2) value → text preservation with current marks
  if ("value" in node && typeof node.value === "string" && node.value.length > 0) {
    return [makeText(node.value, marks)];
  }
  return [];
}

// ── Base block handlers ─────────────────────────────────────────────────

export const paragraphHandler: MdastToPmBlockHandler = (node, ctx) => {
  const para = node as Paragraph;
  const hasImage = para.children.some((child) => child.type === "image");
  if (!hasImage) {
    const content = ctx.convertInlineChildren(para.children);
    return [content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }];
  }

  // Lift images out of the paragraph as block-level siblings
  const result: PMNodeJSON[] = [];
  let inlineBuf: PhrasingContent[] = [];

  function flushInline() {
    if (inlineBuf.length === 0) return;
    const content = ctx.convertInlineChildren(inlineBuf);
    if (content.length > 0) result.push({ type: "paragraph", content });
    inlineBuf = [];
  }

  for (const child of para.children) {
    if (child.type === "image") {
      flushInline();
      const imageResult = ctx.convertInline(child as PhrasingContent, []);
      if (imageResult.length > 0) result.push(imageResult[0]);
    } else {
      inlineBuf.push(child);
    }
  }
  flushInline();

  return result.length > 0 ? result : [{ type: "paragraph" }];
};

// ── Base inline handlers ────────────────────────────────────────────────

export const textHandler: MdastToPmInlineHandler = (node, marks) => {
  const text = node as Text;
  const parts = text.value.split("\n");
  if (parts.length === 1) return [makeText(text.value, marks)];

  const result: PMNodeJSON[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) result.push({ type: "hardBreak" });
    if (parts[i]) result.push(makeText(parts[i], marks));
  }
  return result;
};

export const breakHandler: MdastToPmInlineHandler = () => [{ type: "hardBreak" }];

// ── Shared helpers (exported for plugin handler authors) ────────────────

/**
 * Accumulate a mark and recurse into children.
 * Used by mark-wrapping handlers (emphasis, strong, delete, link, etc.).
 */
export function convertMarkChildren(
  node: Emphasis | Strong | Delete | Link,
  parentMarks: PMMarkJSON[],
  mark: PMMarkJSON,
  ctx: MdastToPmContext,
): PMNodeJSON[] {
  const newMarks = [...parentMarks, mark];
  const result: PMNodeJSON[] = [];
  for (const child of node.children) {
    result.push(...ctx.convertInline(child, newMarks));
  }
  return result;
}

/**
 * Create a PM text node with optional marks.
 */
export function makeText(value: string, marks: PMMarkJSON[]): PMNodeJSON {
  const result: PMNodeJSON = { type: "text", text: value };
  const normalizedMarks = normalizeMarks(marks);
  if (normalizedMarks.length > 0) result.marks = normalizedMarks;
  return result;
}

// ── Internal helpers ────────────────────────────────────────────────────

function normalizeMarks(marks: PMMarkJSON[]): PMMarkJSON[] {
  if (marks.length < 2) return marks;

  const seen = new Set<string>();
  const result: PMMarkJSON[] = [];

  for (const mark of marks) {
    const key = `${mark.type}:${JSON.stringify(mark.attrs ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(mark);
  }

  return result;
}

function mergeAdjacentText(nodes: PMNodeJSON[]): PMNodeJSON[] {
  const result: PMNodeJSON[] = [];
  for (const node of nodes) {
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.type === "text" &&
      node.type === "text" &&
      marksEqual(prev.marks, node.marks)
    ) {
      prev.text = (prev.text ?? "") + (node.text ?? "");
    } else {
      result.push(node);
    }
  }
  return result;
}

function marksEqual(a: PMMarkJSON[] | undefined, b: PMMarkJSON[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (m, i) => m.type === b[i].type && JSON.stringify(m.attrs) === JSON.stringify(b[i].attrs),
  );
}
