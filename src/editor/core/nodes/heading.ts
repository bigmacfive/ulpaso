// ── Heading Node ──
//
// Defines the "heading" node for h1–h6 headings using ProseKit core primitives.
// Provides schema spec with level attribute and toggle commands per level.

import {
  defineCommands,
  defineKeymap,
  defineNodeSpec,
  isAtBlockStart,
  toggleNode,
  union,
  unsetBlockType,
  type Extension,
} from "prosekit/core";
import { defineTextBlockInputRule } from "prosekit/extensions/input-rule";

function defineHeadingSpec(): Extension {
  return defineNodeSpec({
    name: "heading",
    content: "inline*",
    group: "block",
    defining: true,
    attrs: {
      level: { default: 1 },
    },
    parseDOM: [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
      { tag: "h4", attrs: { level: 4 } },
      { tag: "h5", attrs: { level: 5 } },
      { tag: "h6", attrs: { level: 6 } },
    ],
    toDOM(node) {
      const tag = `h${node.attrs.level as number}`;
      return [tag, 0];
    },
  });
}

function defineHeadingCommands(): Extension {
  return defineCommands({
    toggleHeading: (attrs?: { level: number }) =>
      toggleNode({ type: "heading", attrs: attrs ?? { level: 1 } }),
  });
}

/**
 * Input rule: typing `# ` at the start of a line creates an h1,
 * `## ` creates h2, up to `###### ` for h6.
 */
function defineHeadingInputRule(): Extension {
  return defineTextBlockInputRule({
    regex: /^(#{1,6})\s$/,
    type: "heading",
    attrs: (match) => ({ level: match[1]?.length ?? 1 }),
  });
}

/**
 * Typora-style escape hatch: Backspace at the very start of any heading turns
 * it back into the default text block while preserving its inline content.
 */
function defineHeadingKeymap(): Extension {
  return defineKeymap({
    Backspace: (state, dispatch, view) => {
      const $pos = isAtBlockStart(state, view);
      if ($pos?.parent.type.name === "heading") {
        return unsetBlockType()(state, dispatch, view);
      }
      return false;
    },
  });
}

function defineHeading(): Extension {
  return union(
    defineHeadingSpec(),
    defineHeadingCommands(),
    defineHeadingInputRule(),
    defineHeadingKeymap(),
  );
}

export { defineHeading, defineHeadingKeymap };
