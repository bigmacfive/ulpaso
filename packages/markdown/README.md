# @ulpaso/markdown

Small, framework-independent conversion primitives for Markdown, mdast, and
ProseMirror-compatible JSON. Ulpaso uses the registry to add editor nodes and
marks without coupling the converter to ProseKit, SolidJS, Tauri, or the
meeting-transcription pipeline.

```ts
import {
  RegistryBuilder,
  createProcessor,
  mdastToProseMirror,
  proseMirrorToMdast,
} from "@ulpaso/markdown";

const registry = new RegistryBuilder().addBase().build();
const markdown = createProcessor();
const document = mdastToProseMirror(markdown.parse("Hello"), registry);
const output = markdown.stringify(proseMirrorToMdast(document, registry));
```

The base registry intentionally handles only paragraphs, text, and hard
breaks. Consumers can add block, inline, and mark handlers through
`RegistryBuilder`; unregistered nodes degrade to text-preserving paragraphs.

Build with `pnpm --filter @ulpaso/markdown build`. The package is MIT licensed.
