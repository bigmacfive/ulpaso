import {
  createEditor,
  defineBaseKeymap,
  defineHistory,
  definePlugin,
  union,
  type Editor,
  type Extension,
} from "prosekit/core";
import { defineDoc } from "prosekit/extensions/doc";
import { defineHardBreak } from "prosekit/extensions/hard-break";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineText } from "prosekit/extensions/text";
import { Plugin } from "prosekit/pm/state";
import type { EditorView } from "prosekit/pm/view";
import { defineBlurSelection } from "~/components/editor/system/blur_selection";
import { defineBold } from "./core/marks/bold";
import { defineCode } from "./core/marks/code";
import { defineItalic } from "./core/marks/italic";
import { defineLink } from "./core/marks/link";
import { defineStrike } from "./core/marks/strike";
import { defineBlockquote } from "./core/nodes/blockquote";
import { defineCodeBlock } from "./core/nodes/code_block";
import { defineHeading } from "./core/nodes/heading";
import { defineHorizontalRule } from "./core/nodes/horizontal_rule";
import { defineImage } from "./core/nodes/image";
import { defineList } from "./core/nodes/list";
import { defineTable } from "./core/nodes/table";
import { defineMeetingTranscriptPlugin } from "./meeting_transcript_plugin";

const SCROLL_MARGIN = 80;
const SCROLL_THRESHOLD = 80;
const CARET_OPTICAL_OFFSET_Y = -1;

function findScrollContainer(view: EditorView): HTMLElement | null {
  for (let current = view.dom.parentElement; current; current = current.parentElement) {
    if (current.hasAttribute("data-scroll-area-viewport")) return current;
    const style = getComputedStyle(current);
    const scrollableY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight;
    const scrollableX =
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      current.scrollWidth > current.clientWidth;
    if (scrollableX || scrollableY) return current;
  }
  return null;
}

function getSelectionRect(view: EditorView): DOMRect | null {
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.focusNode) return null;

  const focusHost =
    selection.focusNode.nodeType === Node.TEXT_NODE
      ? selection.focusNode.parentElement
      : (selection.focusNode as HTMLElement | null);
  if (!focusHost || !view.dom.contains(focusHost)) return null;

  const range = selection.getRangeAt(0).cloneRange();
  for (const rect of range.getClientRects()) {
    if (rect.width > 0 || rect.height > 0) return rect;
  }

  const rangeRect = range.getBoundingClientRect();
  if (rangeRect.width > 0 || rangeRect.height > 0) return rangeRect;
  return focusHost.getBoundingClientRect();
}

function adjustScrollAxis(params: {
  rectStart: number;
  rectEnd: number;
  boxStart: number;
  boxEnd: number;
  threshold: number;
  margin: number;
}): number {
  const { rectStart, rectEnd, boxStart, boxEnd, threshold, margin } = params;
  if (rectStart < boxStart + threshold) return rectStart - boxStart - margin;
  if (rectEnd > boxEnd - threshold) return rectEnd - boxEnd + margin;
  return 0;
}

function handleScrollToSelection(view: EditorView): boolean {
  const container = findScrollContainer(view);
  const rect = getSelectionRect(view);
  if (!container || !rect) return false;

  const bounds = container.getBoundingClientRect();
  const moveY = adjustScrollAxis({
    rectStart: rect.top,
    rectEnd: rect.bottom,
    boxStart: bounds.top,
    boxEnd: bounds.bottom,
    threshold: SCROLL_THRESHOLD,
    margin: SCROLL_MARGIN,
  });
  const moveX = adjustScrollAxis({
    rectStart: rect.left,
    rectEnd: rect.right,
    boxStart: bounds.left,
    boxEnd: bounds.right,
    threshold: SCROLL_THRESHOLD,
    margin: SCROLL_MARGIN,
  });

  if (moveY !== 0) container.scrollTop += moveY;
  if (moveX !== 0) container.scrollLeft += moveX;
  return true;
}

function defineScrollProps(): Extension {
  return definePlugin(new Plugin({
    props: {
      scrollMargin: SCROLL_MARGIN,
      scrollThreshold: SCROLL_THRESHOLD,
      handleScrollToSelection,
      handleTextInput(view, from, to, text) {
        view.dispatch(view.state.tr.insertText(text, from, to));
        requestAnimationFrame(() => { if (view.hasFocus()) handleScrollToSelection(view); });
        return true;
      },
    },
  }));
}

function defineCustomCaret(): Extension {
  return definePlugin(new Plugin({
    view(view) {
      const container = view.dom.closest<HTMLElement>(".kuku-editor-container");
      const scrollHost = view.dom.closest<HTMLElement>(".kuku-editor-scroll");
      const ownerWindow = view.dom.ownerDocument.defaultView;
      const caret = view.dom.ownerDocument.createElement("span");
      caret.className = "custom-editor-caret";
      caret.setAttribute("aria-hidden", "true");
      caret.hidden = true;
      container?.append(caret);
      let frame = 0;
      let composing = false;

      const updateCaret = () => {
        frame = 0;
        const { selection } = view.state;
        if (!container || composing || !view.hasFocus() || !selection.empty || !selection.$head.parent.isTextblock) {
          caret.hidden = true;
          return;
        }
        try {
          const coords = view.coordsAtPos(selection.head);
          const bounds = container.getBoundingClientRect();
          const lineHeight = Math.max(1, coords.bottom - coords.top);
          const caretHeight = Math.max(18, Math.min(34, lineHeight * .82));
          caret.style.left = `${coords.left - bounds.left}px`;
          caret.style.top = `${coords.top - bounds.top + (lineHeight - caretHeight) / 2 + CARET_OPTICAL_OFFSET_Y}px`;
          caret.style.height = `${caretHeight}px`;
          caret.hidden = false;
        } catch {
          caret.hidden = true;
        }
      };
      const scheduleCaretUpdate = () => {
        if (!ownerWindow) return updateCaret();
        if (frame) ownerWindow.cancelAnimationFrame(frame);
        frame = ownerWindow.requestAnimationFrame(updateCaret);
      };
      const resizeObserver = typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleCaretUpdate);
      resizeObserver?.observe(view.dom);
      if (container) resizeObserver?.observe(container);
      if (scrollHost) resizeObserver?.observe(scrollHost);
      const handleFocus = () => scheduleCaretUpdate();
      const handleBlur = () => { caret.hidden = true; };
      const handleCompositionStart = () => {
        composing = true;
        caret.hidden = true;
        view.dom.classList.add("is-composing");
      };
      const handleCompositionEnd = () => {
        composing = false;
        view.dom.classList.remove("is-composing");
        scheduleCaretUpdate();
      };
      view.dom.addEventListener("focus", handleFocus);
      view.dom.addEventListener("blur", handleBlur);
      view.dom.addEventListener("compositionstart", handleCompositionStart);
      view.dom.addEventListener("compositionend", handleCompositionEnd);
      scrollHost?.addEventListener("scroll", scheduleCaretUpdate, { passive: true });
      ownerWindow?.addEventListener("resize", scheduleCaretUpdate);
      scheduleCaretUpdate();
      return {
        update: scheduleCaretUpdate,
        destroy() {
          if (frame) ownerWindow?.cancelAnimationFrame(frame);
          view.dom.classList.remove("is-composing");
          view.dom.removeEventListener("focus", handleFocus);
          view.dom.removeEventListener("blur", handleBlur);
          view.dom.removeEventListener("compositionstart", handleCompositionStart);
          view.dom.removeEventListener("compositionend", handleCompositionEnd);
          scrollHost?.removeEventListener("scroll", scheduleCaretUpdate);
          ownerWindow?.removeEventListener("resize", scheduleCaretUpdate);
          resizeObserver?.disconnect();
          caret.remove();
        },
      };
    },
  }));
}

function defineKukuExtension(): Extension {
  return union(
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineHistory(),
    defineBaseKeymap(),
    defineBlurSelection(),
    defineBold(),
    defineItalic(),
    defineCode(),
    defineStrike(),
    defineLink(),
    defineHardBreak(),
    defineHeading(),
    defineHorizontalRule(),
    defineBlockquote(),
    defineCodeBlock(),
    defineImage(),
    defineList(),
    defineTable(),
    defineMeetingTranscriptPlugin(),
    defineCustomCaret(),
    defineScrollProps(),
  );
}

function createKukuEditor(): Editor {
  return createEditor({ extension: defineKukuExtension() });
}

export { createKukuEditor };
