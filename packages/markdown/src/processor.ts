/**
 * Factory for creating remark processors with configurable plugins.
 *
 * Base plugins (remark-gfm) are always included.
 * Additional plugins (e.g. remarkWikilink) are appended via options.
 */

import type { Root } from "mdast";

import { remark } from "remark";
import remarkGfm from "remark-gfm";

// ── Types ───────────────────────────────────────────────────────────────

/**
 * A remark-compatible plugin function.
 *
 * This is a local alias to avoid a direct import from `unified` (which is
 * a transitive dependency of `remark` and may not be resolvable under
 * strict pnpm hoisting). Matches the shape accepted by `processor.use()`.
 */
// oxlint-disable-next-line no-explicit-any -- unified Plugin type has complex generics
export type RemarkPlugin = (...args: any[]) => any;

export interface MarkdownProcessor {
  /** Parse a markdown string into an mdast tree. */
  parse(source: string): Root;
  /** Serialize an mdast tree back to a markdown string. */
  stringify(tree: Root): string;
}

export interface CreateProcessorOptions {
  /**
   * Additional remark plugins to include (beyond the base remark-gfm).
   * These are applied in order after remark-gfm.
   */
  remarkPlugins?: RemarkPlugin[];

  /**
   * remark-stringify settings.
   * @default { bullet: '-', bulletOrdered: '.', rule: '-' }
   */
  stringifySettings?: Record<string, unknown>;
}

// ── Default settings ────────────────────────────────────────────────────

const DEFAULT_STRINGIFY_SETTINGS: Record<string, unknown> = {
  bullet: "-",
  bulletOrdered: ".",
  rule: "-",
};

// ── Factory ─────────────────────────────────────────────────────────────

/**
 * Create a MarkdownProcessor with the given plugins.
 *
 * Base setup always includes `remark-gfm`. Additional plugins (e.g.
 * `remarkWikilink`) are appended in order.
 *
 * The returned processor is frozen on first use (per unified semantics).
 * If you need a different plugin set, create a new processor.
 *
 * @example
 * ```ts
 * const processor = createProcessor({
 *   remarkPlugins: [remarkWikilink],
 * });
 *
 * const tree = processor.parse('# Hello [[World]]');
 * const md = processor.stringify(tree);
 * ```
 */
export function createProcessor(options: CreateProcessorOptions = {}): MarkdownProcessor {
  const { remarkPlugins = [], stringifySettings = DEFAULT_STRINGIFY_SETTINGS } = options;

  // Build the parse processor (no stringify settings needed)
  // oxlint-disable-next-line no-explicit-any -- unified Plugin generics are too strict for dynamic use
  let parseProc: any = remark().use(remarkGfm);
  for (const plugin of remarkPlugins) {
    parseProc = parseProc.use(plugin);
  }

  // Build the stringify processor (with settings)
  // oxlint-disable-next-line no-explicit-any -- unified Plugin generics are too strict for dynamic use
  let stringifyProc: any = remark().use(remarkGfm);
  for (const plugin of remarkPlugins) {
    stringifyProc = stringifyProc.use(plugin);
  }
  stringifyProc = stringifyProc.use({ settings: stringifySettings });

  return {
    parse(source: string): Root {
      return parseProc.parse(source);
    },
    stringify(tree: Root): string {
      return stringifyProc.stringify(tree);
    },
  };
}
