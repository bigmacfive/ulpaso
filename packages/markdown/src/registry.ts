/**
 * ConversionRegistry factories and builder.
 *
 * Provides:
 * - `createBaseRegistry()` — minimal registry for base schema (paragraph, text, hardBreak)
 * - `RegistryBuilder` — fluent builder for incremental construction
 *
 * Only base handlers are included. All other handlers come from plugins.
 */

import {
  paragraphHandler as mdastParagraphHandler,
  textHandler,
  breakHandler,
} from "./mdast_to_pm.js";
import {
  paragraphHandler as pmParagraphHandler,
  textInlineHandler,
  hardBreakInlineHandler,
  createTextInlineHandler,
} from "./pm_to_mdast.js";
import {
  type ConversionRegistry,
  type MdastToPmBlockHandler,
  type MdastToPmInlineHandler,
  type PmToMdastBlockHandler,
  type PmToMdastInlineHandler,
  type PmToMdastMarkHandler,
  createEmptyRegistry,
  mergeRegistries,
} from "./types.js";

// ── Base registry (paragraph, text, hardBreak only) ─────────────────────

/**
 * Create a minimal ConversionRegistry for the base PM schema.
 *
 * Only includes handlers for:
 * - mdastToPm.block: { paragraph }
 * - mdastToPm.inline: { text, break }
 * - pmToMdast.block: { paragraph }
 * - pmToMdast.inline: { text, hardBreak }
 * - pmToMdast.mark: {} (none)
 *
 * All other handlers (heading, bold, italic, etc.) come from plugins.
 */
export function createBaseRegistry(): ConversionRegistry {
  return {
    mdastToPm: {
      block: {
        paragraph: mdastParagraphHandler,
      },
      inline: {
        text: textHandler,
        break: breakHandler,
      },
    },
    pmToMdast: {
      block: {
        paragraph: pmParagraphHandler,
      },
      inline: {
        text: textInlineHandler,
        hardBreak: hardBreakInlineHandler,
      },
      mark: {},
    },
  };
}

// ── Registry builder ────────────────────────────────────────────────────

/**
 * Fluent builder for constructing a ConversionRegistry incrementally.
 *
 * Usage:
 * ```ts
 * const registry = new RegistryBuilder()
 *   .addBase()
 *   .addMdastBlockHandler('heading', headingHandler)
 *   .addPmMarkHandler('bold', boldMarkHandler)
 *   .build();
 * ```
 */
export class RegistryBuilder {
  private registry: ConversionRegistry;

  constructor() {
    this.registry = createEmptyRegistry();
  }

  /** Merge only the base schema handlers (paragraph, text, hardBreak). */
  addBase(): this {
    this.registry = mergeRegistries(this.registry, createBaseRegistry());
    return this;
  }

  /** Merge an entire registry on top of the current state. */
  merge(other: ConversionRegistry): this {
    this.registry = mergeRegistries(this.registry, other);
    return this;
  }

  // ── mdast → PM handlers ─────────────────────────────────────────────

  addMdastBlockHandler(type: string, handler: MdastToPmBlockHandler): this {
    this.registry.mdastToPm.block[type] = handler;
    return this;
  }

  addMdastInlineHandler(type: string, handler: MdastToPmInlineHandler): this {
    this.registry.mdastToPm.inline[type] = handler;
    return this;
  }

  // ── PM → mdast handlers ─────────────────────────────────────────────

  addPmBlockHandler(type: string, handler: PmToMdastBlockHandler): this {
    this.registry.pmToMdast.block[type] = handler;
    return this;
  }

  addPmInlineHandler(type: string, handler: PmToMdastInlineHandler): this {
    this.registry.pmToMdast.inline[type] = handler;
    return this;
  }

  addPmMarkHandler(type: string, handler: PmToMdastMarkHandler): this {
    this.registry.pmToMdast.mark[type] = handler;
    return this;
  }

  // ── Build ───────────────────────────────────────────────────────────

  /**
   * Finalize the registry.
   *
   * [R1] If any mark handlers exist, the 'text' inline handler is
   * unconditionally rebuilt to dispatch through the full mark handler map.
   * In kuku, base registry has 0 mark handlers, so all marks come from plugins.
   * No diff logic needed — just check if mark count > 0.
   */
  build(): ConversionRegistry {
    const markKeys = Object.keys(this.registry.pmToMdast.mark);
    if (markKeys.length > 0) {
      this.registry.pmToMdast.inline.text = createTextInlineHandler(this.registry.pmToMdast.mark);
    }

    // Return a shallow copy so the builder's internal state is detached
    return {
      mdastToPm: {
        block: { ...this.registry.mdastToPm.block },
        inline: { ...this.registry.mdastToPm.inline },
      },
      pmToMdast: {
        block: { ...this.registry.pmToMdast.block },
        inline: { ...this.registry.pmToMdast.inline },
        mark: { ...this.registry.pmToMdast.mark },
      },
    };
  }
}
