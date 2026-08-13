import type { Nodes, PhrasingContent, RootContent } from "mdast";

// ── Existing PM JSON types ──────────────────────────────────────────────

export interface PMMarkJSON {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNodeJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNodeJSON[];
  marks?: PMMarkJSON[];
  text?: string;
}

// ── Conversion contexts (provided to handlers for recursive conversion) ──

/**
 * Context available to mdast → PM handlers.
 * Provides recursive conversion helpers so handlers can convert children.
 */
export interface MdastToPmContext {
  /** Convert an array of block-level mdast nodes to PM nodes. */
  convertBlockChildren(nodes: Nodes[]): PMNodeJSON[];
  /** Convert an array of phrasing (inline) mdast nodes to PM nodes. */
  convertInlineChildren(nodes: PhrasingContent[]): PMNodeJSON[];
  /** Convert a single phrasing mdast node to PM nodes, carrying accumulated marks. */
  convertInline(node: PhrasingContent, marks: PMMarkJSON[]): PMNodeJSON[];
}

/**
 * Context available to PM → mdast handlers.
 * Provides recursive conversion helpers so handlers can convert children.
 */
export interface PmToMdastContext {
  /** Convert an array of PM block nodes to mdast root content (with list merging). */
  convertDocChildren(nodes: PMNodeJSON[]): RootContent[];
  /** Convert a single PM block node to a mdast root content node. */
  convertBlockNode(node: PMNodeJSON): RootContent | null;
  /** Convert an array of PM inline nodes to mdast phrasing content. */
  convertInlineChildren(nodes: PMNodeJSON[]): PhrasingContent[];
  /** Convert a single PM inline node to mdast phrasing content. */
  convertInlineNode(node: PMNodeJSON): PhrasingContent | null;
  /** Recursively extract plain text from a PM node tree. */
  extractTextContent(node: PMNodeJSON): string;
}

// ── Handler types ───────────────────────────────────────────────────────

/**
 * Converts an mdast block-level node to PM node(s).
 * Return `null` for unknown/unhandled nodes.
 *
 * Key: mdast `node.type` (e.g. 'paragraph', 'heading', 'table')
 */
export type MdastToPmBlockHandler = (node: Nodes, ctx: MdastToPmContext) => PMNodeJSON[] | null;

/**
 * Converts an mdast phrasing (inline) node to PM node(s).
 * The `marks` array carries accumulated marks from ancestor mark nodes
 * (emphasis, strong, link, etc.).
 *
 * Key: mdast `node.type` (e.g. 'text', 'emphasis', 'image', 'wikilink')
 */
export type MdastToPmInlineHandler = (
  node: PhrasingContent,
  marks: PMMarkJSON[],
  ctx: MdastToPmContext,
) => PMNodeJSON[];

/**
 * Converts a PM block-level node to an mdast content node.
 * Return `null` for unknown/unhandled nodes.
 *
 * Key: PM `node.type` (e.g. 'paragraph', 'heading', 'codeBlock')
 */
export type PmToMdastBlockHandler = (node: PMNodeJSON, ctx: PmToMdastContext) => RootContent | null;

/**
 * Converts a PM inline node to an mdast phrasing content node.
 * Return `null` for unknown/unhandled nodes.
 *
 * Key: PM `node.type` (e.g. 'text', 'hardBreak', 'image', 'wikilink')
 */
export type PmToMdastInlineHandler = (
  node: PMNodeJSON,
  ctx: PmToMdastContext,
) => PhrasingContent | null;

/**
 * Converts a PM mark to an mdast wrapping node.
 * Called sequentially for each mark on a text node — each handler wraps the
 * `inner` content from the previous step.
 *
 * Key: PM `mark.type` (e.g. 'bold', 'italic', 'code', 'link')
 */
export type PmToMdastMarkHandler = (mark: PMMarkJSON, inner: PhrasingContent) => PhrasingContent;

// ── Conversion registry ─────────────────────────────────────────────────

/**
 * A registry of handler functions for bidirectional mdast ↔ PM conversion.
 * Handlers are keyed by node/mark type string for O(1) dispatch.
 *
 * Extensions register their handlers here. The conversion engine looks up
 * the handler by `node.type` or `mark.type` and calls it.
 */
export interface ConversionRegistry {
  /** mdast → PM direction */
  mdastToPm: {
    /** Block-level handlers, keyed by mdast node type */
    block: Record<string, MdastToPmBlockHandler>;
    /** Inline/phrasing handlers, keyed by mdast node type */
    inline: Record<string, MdastToPmInlineHandler>;
  };
  /** PM → mdast direction */
  pmToMdast: {
    /** Block-level handlers, keyed by PM node type */
    block: Record<string, PmToMdastBlockHandler>;
    /** Inline handlers, keyed by PM node type */
    inline: Record<string, PmToMdastInlineHandler>;
    /** Mark handlers, keyed by PM mark type */
    mark: Record<string, PmToMdastMarkHandler>;
  };
}

// ── Registry helpers ────────────────────────────────────────────────────

/** Create an empty ConversionRegistry. */
export function createEmptyRegistry(): ConversionRegistry {
  return {
    mdastToPm: { block: {}, inline: {} },
    pmToMdast: { block: {}, inline: {}, mark: {} },
  };
}

/**
 * Merge multiple registries into one (left to right, last-writer-wins).
 * Returns a new registry without mutating the inputs.
 */
export function mergeRegistries(...registries: ConversionRegistry[]): ConversionRegistry {
  const result = createEmptyRegistry();
  for (const reg of registries) {
    Object.assign(result.mdastToPm.block, reg.mdastToPm.block);
    Object.assign(result.mdastToPm.inline, reg.mdastToPm.inline);
    Object.assign(result.pmToMdast.block, reg.pmToMdast.block);
    Object.assign(result.pmToMdast.inline, reg.pmToMdast.inline);
    Object.assign(result.pmToMdast.mark, reg.pmToMdast.mark);
  }
  return result;
}
