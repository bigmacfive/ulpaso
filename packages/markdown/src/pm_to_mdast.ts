import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";

import type {
  ConversionRegistry,
  PMNodeJSON,
  PmToMdastBlockHandler,
  PmToMdastContext,
  PmToMdastInlineHandler,
  PmToMdastMarkHandler,
} from "./types.js";
import { warnMissingHandler } from "./diagnostics.js";

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Convert a ProseMirror-compatible JSON document into an mdast Root tree.
 *
 * Uses the provided ConversionRegistry for dispatch.
 */
export function proseMirrorToMdast(json: PMNodeJSON, registry: ConversionRegistry): Root {
  const ctx = createContext(registry);
  return {
    type: "root",
    children: ctx.convertDocChildren(json.content ?? []),
  };
}

// ── Context factory ─────────────────────────────────────────────────────

function createContext(registry: ConversionRegistry): PmToMdastContext {
  const ctx: PmToMdastContext = {
    convertDocChildren(nodes: PMNodeJSON[]): RootContent[] {
      return convertDocChildren(nodes, registry, ctx);
    },
    convertBlockNode(node: PMNodeJSON): RootContent | null {
      return convertBlockNode(node, registry, ctx);
    },
    convertInlineChildren(nodes: PMNodeJSON[]): PhrasingContent[] {
      return convertInlineChildren(nodes, registry, ctx);
    },
    convertInlineNode(node: PMNodeJSON): PhrasingContent | null {
      return convertInlineNode(node, registry, ctx);
    },
    extractTextContent,
  };
  return ctx;
}

// ── Engine (registry dispatch) ──────────────────────────────────────────

function convertDocChildren(
  nodes: PMNodeJSON[],
  registry: ConversionRegistry,
  ctx: PmToMdastContext,
): RootContent[] {
  const result: RootContent[] = [];
  for (const node of nodes) {
    const converted = convertBlockNode(node, registry, ctx);
    if (!converted) continue;

    // Merge consecutive lists of the same type (flat PM list nodes → single mdast list)
    const prev = result[result.length - 1];
    if (converted.type === "list" && prev?.type === "list" && prev.ordered === converted.ordered) {
      prev.children.push(...converted.children);
    } else {
      result.push(converted);
    }
  }
  return result;
}

function convertBlockNode(
  node: PMNodeJSON,
  registry: ConversionRegistry,
  ctx: PmToMdastContext,
): RootContent | null {
  const handler = registry.pmToMdast.block[node.type];
  // [R4] Graceful degradation: fallback instead of silent drop
  return handler ? handler(node, ctx) : fallbackBlockToMdast(node, ctx);
}

function convertInlineChildren(
  nodes: PMNodeJSON[],
  registry: ConversionRegistry,
  ctx: PmToMdastContext,
): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  for (const node of nodes) {
    const converted = convertInlineNode(node, registry, ctx);
    if (converted) result.push(converted);
  }

  // Trim spaces adjacent to \n text nodes to prevent remark &#x20; escaping
  for (let i = 0; i < result.length; i++) {
    if (result[i].type === "text" && (result[i] as { value: string }).value === "\n") {
      if (i > 0) trimTrailingSpace(result[i - 1]);
      if (i + 1 < result.length) trimLeadingSpace(result[i + 1]);
    }
  }

  return result;
}

function convertInlineNode(
  node: PMNodeJSON,
  registry: ConversionRegistry,
  ctx: PmToMdastContext,
): PhrasingContent | null {
  const handler = registry.pmToMdast.inline[node.type];
  if (handler) return handler(node, ctx);
  // [R4] Graceful degradation: fallback instead of silent drop
  return fallbackInlineToMdast(node, ctx);
}

// ── [R4] Fallback functions ─────────────────────────────────────────────

/**
 * Fallback for unregistered PM block nodes → mdast.
 * Extracts text content and wraps in paragraph > text.
 */
function fallbackBlockToMdast(node: PMNodeJSON, ctx: PmToMdastContext): RootContent | null {
  warnMissingHandler(`[Markdown] No PM→mdast block handler for "${node.type}", using fallback`);
  const text = ctx.extractTextContent(node);
  if (text.length > 0) {
    return { type: "paragraph", children: [{ type: "text", value: text }] } as Paragraph;
  }
  return null;
}

/**
 * Fallback for unregistered PM inline nodes → mdast.
 * Searches for text in node.text, node.content, and node.attrs.
 */
function fallbackInlineToMdast(node: PMNodeJSON, ctx: PmToMdastContext): PhrasingContent | null {
  warnMissingHandler(`[Markdown] No PM→mdast inline handler for "${node.type}", using fallback`);
  // 1) text property first (PM text nodes)
  if (node.text && node.text.length > 0) {
    return { type: "text", value: node.text };
  }
  // 2) deep text extraction from content
  const text = ctx.extractTextContent(node);
  if (text.length > 0) {
    return { type: "text", value: text };
  }
  // 3) Last resort: search attrs for text values
  if (node.attrs) {
    const hintKeys = ["label", "alt", "title", "name", "value", "text"];
    for (const key of hintKeys) {
      const val = node.attrs[key];
      if (typeof val === "string" && val.length > 0) {
        return { type: "text", value: val };
      }
    }
    const anyStr = Object.values(node.attrs).find(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (anyStr) {
      return { type: "text", value: anyStr };
    }
  }
  return null;
}

// ── Base block handlers ─────────────────────────────────────────────────

export const paragraphHandler: PmToMdastBlockHandler = (node, ctx): Paragraph => ({
  type: "paragraph",
  children: ctx.convertInlineChildren(node.content ?? []),
});

// ── Base inline handlers ────────────────────────────────────────────────

/**
 * Base text inline handler — returns plain text without mark processing.
 * When mark handlers are registered, `buildMarkdownService()` replaces this
 * with `createTextInlineHandler(allMarks)` via `RegistryBuilder.build()`.
 */
export const textInlineHandler: PmToMdastInlineHandler = (node) => ({
  type: "text",
  value: node.text ?? "",
});

export const hardBreakInlineHandler: PmToMdastInlineHandler = () => ({ type: "break" });

// ── Mark-aware text handler factory ─────────────────────────────────────

/**
 * Create a mark-aware text inline handler that dispatches marks through
 * a custom mark handler map. Use this when extensions add custom marks.
 *
 * @example
 * ```ts
 * const customMarkHandlers = { bold: boldHandler, italic: italicHandler };
 * const customTextHandler = createTextInlineHandler(customMarkHandlers);
 * // register customTextHandler as the 'text' inline handler
 * ```
 */
export function createTextInlineHandler(
  markHandlers: Record<string, PmToMdastMarkHandler>,
): PmToMdastInlineHandler {
  return (node) => {
    let result: PhrasingContent = { type: "text", value: node.text ?? "" };
    for (const mark of node.marks ?? []) {
      const handler = markHandlers[mark.type];
      if (handler) {
        result = handler(mark, result);
      }
    }
    return result;
  };
}

// ── Shared helpers (exported for plugin handler authors) ────────────────

/**
 * Recursively extract plain text from a PM node tree.
 */
export function extractTextContent(node: PMNodeJSON): string {
  if (node.text !== undefined) return node.text;
  if (!node.content) return "";
  return node.content.map(extractTextContent).join("");
}

// ── Internal helpers ────────────────────────────────────────────────────

function trimTrailingSpace(node: PhrasingContent): void {
  if (node.type === "text") {
    node.value = node.value.replace(/ +$/, "");
  } else if ("children" in node && node.children.length > 0) {
    trimTrailingSpace(node.children[node.children.length - 1]);
  }
}

function trimLeadingSpace(node: PhrasingContent): void {
  if (node.type === "text") {
    node.value = node.value.replace(/^ +/, "");
  } else if ("children" in node && node.children.length > 0) {
    trimLeadingSpace(node.children[0]);
  }
}
