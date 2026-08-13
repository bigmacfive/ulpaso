// ── Core conversion ──
export { mdastToProseMirror } from "./mdast_to_pm.js";
export { proseMirrorToMdast, createTextInlineHandler, extractTextContent } from "./pm_to_mdast.js";

// ── Types ──
export type {
  PMMarkJSON,
  PMNodeJSON,
  ConversionRegistry,
  MdastToPmContext,
  PmToMdastContext,
  MdastToPmBlockHandler,
  MdastToPmInlineHandler,
  PmToMdastBlockHandler,
  PmToMdastInlineHandler,
  PmToMdastMarkHandler,
} from "./types.js";
export { createEmptyRegistry, mergeRegistries } from "./types.js";

// ── Registry ──
export { RegistryBuilder, createBaseRegistry } from "./registry.js";

// ── Processor ──
export { createProcessor } from "./processor.js";
export type { CreateProcessorOptions, MarkdownProcessor, RemarkPlugin } from "./processor.js";
export { setMarkdownDiagnostics } from "./diagnostics.js";

// ── Base handlers ──
export {
  paragraphHandler as mdastParagraphHandler,
  textHandler as mdastTextHandler,
  breakHandler as mdastBreakHandler,
  // Helpers for plugin handler authors
  convertMarkChildren,
  makeText,
} from "./mdast_to_pm.js";

export {
  paragraphHandler as pmParagraphHandler,
  textInlineHandler as pmTextInlineHandler,
  hardBreakInlineHandler as pmHardBreakInlineHandler,
} from "./pm_to_mdast.js";
