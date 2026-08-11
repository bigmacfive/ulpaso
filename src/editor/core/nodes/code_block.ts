// ── Code Block Node ──
//
// Defines the "codeBlock" node for fenced code blocks with language attribute.
// Provides schema spec, toggle/set/insert commands, input rules, and
// the CodeMirror-backed node view that owns code-block editing keys.
//
// Vendored from ProseKit predefined extension with customizations.
// Shiki syntax highlighting is NOT included — will be added separately.

import {
  defineCommands,
  defineNodeSpec,
  insertNode,
  setBlockType,
  setNodeAttrs,
  toggleNode,
  union,
  type Extension,
} from "prosekit/core";
import {
  defineCodeBlockEnterRule as prosekitDefineCodeBlockEnterRule,
  defineCodeBlockInputRule as prosekitDefineCodeBlockInputRule,
} from "prosekit/extensions/code-block";

import { defineCodeMirrorCodeBlockView } from "./code_mirror_node_view";

function defineCodeBlockSpec(): Extension {
  return defineNodeSpec({
    name: "codeBlock",
    content: "text*",
    group: "block",
    code: true,
    defining: true,
    marks: "",
    attrs: {
      language: { default: "" },
    },
    parseDOM: [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (node) => ({
          language:
            extractLanguageFromElement(node) ||
            extractLanguageFromElement(node.querySelector("code")),
        }),
      },
    ],
    toDOM(node) {
      const { language } = node.attrs as { language: string };
      return [
        "pre",
        { "data-language": language || undefined },
        ["code", { class: language ? `language-${language}` : undefined }, 0],
      ];
    },
  });
}

function extractLanguageFromElement(element: Element | null): string {
  if (!element) return "";
  const attr = element.getAttribute("data-language");
  if (attr) return attr;
  const match = /language-(\w+)/.exec(element.className);
  if (match) return match[1];
  return "";
}

function defineCodeBlockCommands(): Extension {
  return defineCommands({
    setCodeBlock: (attrs?: { language?: string }) => setBlockType({ type: "codeBlock", attrs }),
    insertCodeBlock: (attrs?: { language?: string }) => insertNode({ type: "codeBlock", attrs }),
    toggleCodeBlock: (attrs?: { language?: string }) => toggleNode({ type: "codeBlock", attrs }),
    setCodeBlockAttrs: (attrs: { language?: string }) => setNodeAttrs({ type: "codeBlock", attrs }),
  });
}

function defineCodeBlock(): Extension {
  return union(
    defineCodeBlockSpec(),
    defineCodeBlockCommands(),
    prosekitDefineCodeBlockInputRule(),
    prosekitDefineCodeBlockEnterRule(),
    defineCodeMirrorCodeBlockView(),
  );
}

export { defineCodeBlock };
