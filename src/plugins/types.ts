import type { Root } from "mdast";
import type {
  MdastToPmBlockHandler,
  MdastToPmInlineHandler,
  PmToMdastBlockHandler,
  PmToMdastInlineHandler,
  PmToMdastMarkHandler,
  RemarkPlugin,
} from "@ulpaso/markdown";

type Disposer = () => void;

interface MarkdownContribution {
  remarkPlugins?: RemarkPlugin[];
  mdastTransform?: {
    afterParse?: (tree: Root) => Root;
    beforeStringify?: (tree: Root) => Root;
  };
  mdastToPm?: {
    block?: Record<string, MdastToPmBlockHandler>;
    inline?: Record<string, MdastToPmInlineHandler>;
  };
  pmToMdast?: {
    block?: Record<string, PmToMdastBlockHandler>;
    inline?: Record<string, PmToMdastInlineHandler>;
    mark?: Record<string, PmToMdastMarkHandler>;
  };
}

export type { Disposer, MarkdownContribution };
