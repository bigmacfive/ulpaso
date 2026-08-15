import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { Editor } from "prosekit/core";
import { ProseKit, useDocChange, useKeymap } from "prosekit/solid";
import { Fragment, type Node as ProseMirrorNode } from "prosekit/pm/model";
import { installWebKitCompositionWorkaround } from "~/components/editor/system/ime_composition_workaround";
import { locale, t } from "~/i18n";
import { EDITOR_KEYMAP } from "~/shortcuts";
import { editorCoreMarkdown } from "./core/markdown_handlers";
import {
  filterEditorSlashItems,
  readEditorSlashItemState,
  registerDefaultEditorSlashItems,
  type EditorSlashItem,
} from "./core/slash_items";
import EditorSlashMenu from "./EditorSlashMenu";
import {
  focusOrCreateEditorEndParagraph,
  isEditorEndBlankPointerDown,
} from "./editor_end_affordance";
import { createKukuEditor } from "./extension";
import { computeSlashMenuPosition, type SlashMenuPosition } from "./slash_menu_position";
import {
  buildMarkdownService,
  contributeMarkdown,
  getMarkdownService,
} from "./markdown_service";
import {
  clearMeetingPluginState,
  getMeetingPluginState,
  setMeetingPluginState,
} from "./meeting_transcript_plugin";
import {
  createMeetingDocumentNodes,
  preserveSpeakerBoundaries,
  reconcileMeetingTranscriptSegments,
  type MeetingTranscriptSegment,
} from "./meeting_document";

type EditorCommand = ((attrs?: unknown) => void) & { canExec?: (attrs?: unknown) => boolean };

interface ResolvedSlashMenu {
  from: number;
  to: number;
  query: string;
  position: SlashMenuPosition;
}

const SLASH_TRIGGER_PATTERN = /^(\s*)\/([^\s]*)$/;
const SLASH_MENU_WIDTH = 320;
const SLASH_MENU_MAX_HEIGHT = 400;
const EDITOR_TAB_SIZE = 4;
const MEETING_TAIL_THRESHOLD = 96;

function isStructuralTabTargetNodeName(nodeName: string): boolean {
  return nodeName === "list" || nodeName === "tableCell" || nodeName === "tableHeaderCell";
}

interface KukuEditorHandle {
  command(name: string, attrs?: unknown): boolean;
  focus(): void;
  getElement(): HTMLElement;
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  beginMeeting(sessionId: string, title: string): void;
  updateMeeting(sessionId: string, stableText: string, unstableText: string, speakerId?: number): void;
  finalizeMeeting(sessionId: string, segments: MeetingTranscriptSegment[]): void;
  endMeetingDraft(sessionId: string): void;
}

interface KukuEditorProps {
  initialMarkdown: string;
  onChange(markdown: string, element: HTMLElement): void;
  onReady(handle: KukuEditorHandle): void;
  onMeetingCommand?(): void;
  meetingActive?: boolean;
}

interface ActiveMeetingDocument {
  id: string;
  title: string;
  lastStableText: string;
  segments: MeetingTranscriptSegment[];
}

let markdownInitialized = false;
function ensureMarkdownService() {
  if (markdownInitialized) return;
  contributeMarkdown("core-editor", editorCoreMarkdown);
  buildMarkdownService();
  registerDefaultEditorSlashItems();
  markdownInitialized = true;
}

export default function KukuEditor(props: KukuEditorProps) {
  ensureMarkdownService();
  const editor: Editor = createKukuEditor();
  let settingContent = false;
  let ignoredProgrammaticMarkdown: string | null = null;
  let containerRef!: HTMLDivElement;
  let viewportRef!: HTMLDivElement;
  let activeMeeting: ActiveMeetingDocument | null = null;
  let editorHintDismissed = Boolean(props.initialMarkdown.trim());
  let followMeetingTail = true;
  let meetingTailFrame: number | null = null;
  const [activeSlashMenu, setActiveSlashMenu] = createSignal<ResolvedSlashMenu | null>(null);
  const [slashMenuSelectedIndex, setSlashMenuSelectedIndex] = createSignal(0);

  function syncEditorSurfaceState() {
    if (!editor.mounted) return;
    const root = editor.view.dom;
    const { doc } = editor.view.state;
    const onlyBlock = doc.childCount === 1 ? doc.firstChild : null;
    const isEmpty = Boolean(
      !editorHintDismissed
      && onlyBlock?.type.name === "paragraph"
      && onlyBlock.content.size === 0,
    );
    root.dataset.empty = String(isEmpty);
  }

  function dismissEditorHint(): void {
    if (editorHintDismissed) return;
    editorHintDismissed = true;
    syncEditorSurfaceState();
  }

  function isNearMeetingTail(): boolean {
    if (!viewportRef) return true;
    return viewportRef.scrollHeight - viewportRef.scrollTop - viewportRef.clientHeight
      <= MEETING_TAIL_THRESHOLD;
  }

  function scheduleMeetingTailScroll(force = false): void {
    if (!viewportRef || (!force && !followMeetingTail)) return;
    if (meetingTailFrame != null) cancelAnimationFrame(meetingTailFrame);
    meetingTailFrame = requestAnimationFrame(() => {
      meetingTailFrame = null;
      if (!viewportRef || (!force && !followMeetingTail)) return;
      viewportRef.scrollTop = viewportRef.scrollHeight;
    });
  }

  function handleMeetingViewportScroll(): void {
    if (!activeMeeting) return;
    followMeetingTail = isNearMeetingTail();
  }

  function resolveSlashMenu(): ResolvedSlashMenu | null {
    if (!editor.mounted || !containerRef || !viewportRef) return null;
    const { selection } = editor.view.state;
    if (!selection.empty || !selection.$from.parent.isTextblock) return null;
    const { $from } = selection;
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\0");
    const match = SLASH_TRIGGER_PATTERN.exec(textBefore);
    if (!match) return null;

    let coords: { top: number; bottom: number; left: number };
    try { coords = editor.view.coordsAtPos(selection.from); }
    catch { return null; }

    return {
      from: $from.start() + (match[1]?.length ?? 0),
      to: selection.from,
      query: match[2] ?? "",
      position: computeSlashMenuPosition({
        anchorRect: coords,
        containerRect: containerRef.getBoundingClientRect(),
        viewportRect: viewportRef.getBoundingClientRect(),
        menuWidth: SLASH_MENU_WIDTH,
        menuMaxHeight: SLASH_MENU_MAX_HEIGHT,
      }),
    };
  }

  function closeSlashMenu() {
    setActiveSlashMenu(null);
    setSlashMenuSelectedIndex(0);
  }

  function visibleSlashItems(): EditorSlashItem[] {
    const menu = activeSlashMenu();
    if (!menu) return [];
    const query = menu.query.trim().toLowerCase();
    const meetingItem: EditorSlashItem = {
      id: "meeting-note",
      title: props.meetingActive ? t("editor.meeting.stop") : t("editor.meeting.start"),
      description: props.meetingActive ? t("editor.meeting.stopDescription") : t("editor.meeting.startDescription"),
      icon: "mic",
      keywords: ["meeting", "notes", "record", "transcribe", "audio"],
      group: "meeting",
      order: -100,
      execute: () => props.onMeetingCommand?.(),
    };
    const meetingMatches = !query || [meetingItem.title, meetingItem.description, ...(meetingItem.keywords ?? [])]
      .some((value) => value?.toLowerCase().includes(query));
    return [...(meetingMatches ? [meetingItem] : []), ...filterEditorSlashItems(menu.query)];
  }

  function meetingNodes(title: string, segments: MeetingTranscriptSegment[]): ProseMirrorNode[] {
    const schema = editor.view.state.schema;
    return createMeetingDocumentNodes(title, segments).map((node) => schema.nodeFromJSON(node));
  }

  function replaceMeetingContent(
    meeting: ActiveMeetingDocument,
    segments: MeetingTranscriptSegment[],
    partial: string,
    addToHistory: boolean,
    revealLatest = false,
  ) {
    const plugin = getMeetingPluginState(editor.view.state);
    if (!plugin || plugin.sessionId !== meeting.id) return;
    const nodes = meetingNodes(meeting.title, segments);
    if (!nodes.length) return;
    const fragment = Fragment.fromArray(nodes);
    const latestText = revealLatest ? segments.at(-1)?.text : undefined;
    let revealFrom: number | undefined;
    let revealTo: number | undefined;
    if (latestText) {
      fragment.forEach((node, offset) => {
        if (!node.isTextblock || node.textContent !== latestText) return;
        revealFrom = plugin.from + offset + 1;
        revealTo = revealFrom + node.content.size;
      });
    }
    const transaction = editor.view.state.tr.replaceWith(plugin.from, plugin.to, fragment);
    transaction.setMeta("addToHistory", addToHistory);
    setMeetingPluginState(transaction, {
      sessionId: meeting.id,
      from: plugin.from,
      to: plugin.from + fragment.size,
      partial,
      revealFrom,
      revealTo,
      revealId: revealLatest ? (plugin.revealId ?? 0) + 1 : plugin.revealId,
    });
    editor.view.dispatch(transaction);
    scheduleMeetingTailScroll();
  }

  function updateMeetingPartial(sessionId: string, partial: string) {
    const plugin = getMeetingPluginState(editor.view.state);
    if (!plugin || plugin.sessionId !== sessionId || plugin.partial === partial) return;
    const transaction = editor.view.state.tr;
    transaction.setMeta("addToHistory", false);
    setMeetingPluginState(transaction, { ...plugin, partial });
    editor.view.dispatch(transaction);
    scheduleMeetingTailScroll();
  }

  function appendMeetingText(sessionId: string, text: string, partial: string): boolean {
    const plugin = getMeetingPluginState(editor.view.state);
    if (!plugin || plugin.sessionId !== sessionId || !text) return false;
    const insertAt = Math.max(plugin.from, plugin.to - 1);
    const transaction = editor.view.state.tr.insertText(text, insertAt);
    transaction.setMeta("addToHistory", false);
    setMeetingPluginState(transaction, {
      ...plugin,
      to: plugin.to + text.length,
      partial,
      revealFrom: insertAt,
      revealTo: insertAt + text.length,
      revealId: (plugin.revealId ?? 0) + 1,
    });
    editor.view.dispatch(transaction);
    scheduleMeetingTailScroll();
    return true;
  }

  function appendMeetingSegment(
    meeting: ActiveMeetingDocument,
    segment: MeetingTranscriptSegment,
    partial: string,
  ): boolean {
    const plugin = getMeetingPluginState(editor.view.state);
    if (!plugin || plugin.sessionId !== meeting.id) return false;
    const schema = editor.view.state.schema;
    const nodes = createMeetingDocumentNodes(meeting.title, [segment])
      .slice(1)
      .map((node) => schema.nodeFromJSON(node));
    if (!nodes.length) return false;
    const fragment = Fragment.fromArray(nodes);
    let revealFrom: number | undefined;
    let revealTo: number | undefined;
    fragment.forEach((node, offset) => {
      if (!node.isTextblock || node.textContent !== segment.text) return;
      revealFrom = plugin.to + offset + 1;
      revealTo = revealFrom + node.content.size;
    });
    const transaction = editor.view.state.tr.insert(plugin.to, fragment);
    transaction.setMeta("addToHistory", false);
    setMeetingPluginState(transaction, {
      ...plugin,
      to: plugin.to + fragment.size,
      partial,
      revealFrom,
      revealTo,
      revealId: (plugin.revealId ?? 0) + 1,
    });
    editor.view.dispatch(transaction);
    scheduleMeetingTailScroll();
    return true;
  }

  function refreshSlashMenu() {
    const next = resolveSlashMenu();
    if (!next) { closeSlashMenu(); return; }
    const current = activeSlashMenu();
    setActiveSlashMenu(next);
    if (!current || current.from !== next.from || current.to !== next.to || current.query !== next.query) {
      setSlashMenuSelectedIndex(0);
      return;
    }
    setSlashMenuSelectedIndex((index) => Math.min(index, Math.max(0, visibleSlashItems().length - 1)));
  }

  function isSlashItemActive(item: EditorSlashItem): boolean {
    return item.isActive?.(readEditorSlashItemState(editor.view), editor) === true;
  }

  function isSlashItemDisabled(item: EditorSlashItem): boolean {
    const state = readEditorSlashItemState(editor.view);
    if (item.isActive?.(state, editor)) return false;
    return item.isEnabled?.(state, editor) === false;
  }

  function applySlashItem(item: EditorSlashItem) {
    const menu = activeSlashMenu();
    if (!menu || isSlashItemDisabled(item)) return;
    dismissEditorHint();
    editor.view.dispatch(editor.view.state.tr.delete(menu.from, menu.to));
    closeSlashMenu();
    requestAnimationFrame(() => {
      void item.execute(editor);
      if (editor.mounted) editor.view.focus();
    });
  }

  function handleSlashMenuKey(key: string): boolean {
    if (!activeSlashMenu()) return false;
    const items = visibleSlashItems();
    if (key === "ArrowDown" && items.length) {
      setSlashMenuSelectedIndex((index) => Math.min(index + 1, items.length - 1));
      return true;
    }
    if (key === "ArrowUp" && items.length) {
      setSlashMenuSelectedIndex((index) => Math.max(index - 1, 0));
      return true;
    }
    if (key === "Enter" || key === "Tab") {
      const item = items[slashMenuSelectedIndex()];
      if (!item) return false;
      applySlashItem(item);
      return true;
    }
    if (key === "Escape") { closeSlashMenu(); return true; }
    return false;
  }

  function insertEditorIndent(): boolean {
    const { state } = editor.view;
    const { from, to } = state.selection;
    const spaces = " ".repeat(EDITOR_TAB_SIZE);
    editor.view.dispatch(state.tr.insertText(spaces, from, to).scrollIntoView());
    return true;
  }

  function shouldDeferTabToStructuralKeymap(): boolean {
    const { $from } = editor.view.state.selection;
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      if (isStructuralTabTargetNodeName($from.node(depth).type.name)) return true;
    }
    return false;
  }

  function handleEditorOverlayKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.key !== "Escape") return;
    if (handleSlashMenuKey("Escape")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleEditorFocusIn(): void {
    requestAnimationFrame(() => {
      if (editor.mounted) refreshSlashMenu();
    });
  }

  function handleEditorFocusOut(event: FocusEvent): void {
    const related = event.relatedTarget as Node | null;
    if (!related || !containerRef.contains(related)) closeSlashMenu();
  }

  const handle: KukuEditorHandle = {
    command(name, attrs) {
      const command = (editor.commands as Record<string, EditorCommand | undefined>)[name];
      if (!command) return false;
      if (command.canExec && !command.canExec(attrs)) return false;
      dismissEditorHint();
      command(attrs);
      editor.view.focus();
      return true;
    },
    focus: () => editor.view.focus(),
    getElement: () => editor.view.dom,
    getMarkdown() {
      return getMarkdownService()?.stringify(editor.getDocJSON()) ?? "";
    },
    setMarkdown(markdown) {
      const service = getMarkdownService();
      const parsed = service?.parse(markdown);
      if (!parsed) return;
      editorHintDismissed = Boolean(markdown.trim());
      ignoredProgrammaticMarkdown = service?.stringify(parsed) ?? null;
      settingContent = true;
      try { editor.setContent(parsed, "start"); }
      finally { settingContent = false; }
      requestAnimationFrame(syncEditorSurfaceState);
    },
    beginMeeting(sessionId, title) {
      if (activeMeeting?.id === sessionId) return;
      dismissEditorHint();
      const { state } = editor.view;
      const { $from } = state.selection;
      const topLevel = $from.depth >= 1 ? $from.node(1) : null;
      const from = topLevel && !topLevel.textContent.trim() ? $from.before(1) : $from.depth >= 1 ? $from.after(1) : state.selection.to;
      const to = topLevel && !topLevel.textContent.trim() ? from + topLevel.nodeSize : from;
      activeMeeting = { id: sessionId, title, lastStableText: "", segments: [] };
      followMeetingTail = true;
      const nodes = meetingNodes(title, []);
      const fragment = Fragment.fromArray(nodes);
      const transaction = state.tr.replaceWith(from, to, fragment);
      transaction.setMeta("addToHistory", false);
      setMeetingPluginState(transaction, { sessionId, from, to: from + fragment.size, partial: t("editor.listening") });
      editor.view.dispatch(transaction.scrollIntoView());
      scheduleMeetingTailScroll(true);
    },
    updateMeeting(sessionId, stableText, unstableText, speakerId) {
      const meeting = activeMeeting;
      if (!meeting || meeting.id !== sessionId) return;
      const partial = unstableText || t("editor.listening");
      let updatedIncrementally = false;
      let needsFullReplacement = false;
      const isFirstStableText = !meeting.lastStableText;
      if (stableText !== meeting.lastStableText) {
        if (stableText.startsWith(meeting.lastStableText)) {
          const delta = stableText.slice(meeting.lastStableText.length).trim();
          if (delta) {
            const previous = meeting.segments.at(-1);
            const normalizedSpeaker = speakerId ?? previous?.speaker ?? null;
            if (previous && previous.speaker === normalizedSpeaker) {
              const separator = previous.text ? " " : "";
              previous.text = `${previous.text}${separator}${delta}`;
              updatedIncrementally = appendMeetingText(sessionId, `${separator}${delta}`, partial);
            } else {
              const segment = { speaker: normalizedSpeaker, text: delta };
              meeting.segments.push(segment);
              updatedIncrementally = meeting.segments.length > 1
                && appendMeetingSegment(meeting, segment, partial);
              needsFullReplacement = !updatedIncrementally;
            }
          }
        } else {
          meeting.segments = reconcileMeetingTranscriptSegments(
            meeting.segments,
            stableText,
            speakerId,
          );
          needsFullReplacement = true;
        }
        meeting.lastStableText = stableText;
      }
      if (needsFullReplacement) {
        replaceMeetingContent(meeting, meeting.segments, partial, false, isFirstStableText);
      } else if (!updatedIncrementally) {
        updateMeetingPartial(sessionId, partial);
      }
    },
    finalizeMeeting(sessionId, segments) {
      const meeting = activeMeeting;
      if (!meeting || meeting.id !== sessionId) return;
      const cleaned = segments.filter((segment) => segment.text.trim());
      const finalSegments = preserveSpeakerBoundaries(
        meeting.segments,
        cleaned.length ? cleaned : meeting.segments,
      );
      // Final speaker cleanup is still a machine-authored transcript update.
      // Keep the whole replacement atomic without adding it to user undo history.
      replaceMeetingContent(meeting, finalSegments, "", false);
      const plugin = getMeetingPluginState(editor.view.state);
      if (plugin?.sessionId === sessionId) {
        const transaction = editor.view.state.tr;
        clearMeetingPluginState(transaction, sessionId);
        editor.view.dispatch(transaction);
      }
      activeMeeting = null;
    },
    endMeetingDraft(sessionId) {
      if (activeMeeting?.id !== sessionId) return;
      replaceMeetingContent(activeMeeting, activeMeeting.segments, "", false);
      const transaction = editor.view.state.tr;
      clearMeetingPluginState(transaction, sessionId);
      editor.view.dispatch(transaction);
      activeMeeting = null;
    },
  };

  onMount(() => {
    handle.setMarkdown(props.initialMarkdown);
    props.onReady(handle);
    const cleanupComposition = installWebKitCompositionWorkaround(editor.view);
    onCleanup(cleanupComposition);
    const editorDom = editor.view.dom;
    editorDom.setAttribute("role", "textbox");
    editorDom.setAttribute("aria-label", t("editor.label"));
    editorDom.setAttribute("aria-multiline", "true");
    editorDom.dataset.placeholder = t("editor.placeholder");
    syncEditorSurfaceState();
    const handleSelectionChange = () => requestAnimationFrame(() => {
      if (editor.mounted) refreshSlashMenu();
    });
    const handleEditorInput = () => {
      dismissEditorHint();
      requestAnimationFrame(() => {
        if (editor.mounted) refreshSlashMenu();
      });
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    editorDom.addEventListener("input", handleEditorInput);
    onCleanup(() => document.removeEventListener("selectionchange", handleSelectionChange));
    onCleanup(() => editorDom.removeEventListener("input", handleEditorInput));
    onCleanup(() => {
      if (meetingTailFrame != null) cancelAnimationFrame(meetingTailFrame);
      if (editor.mounted) editor.unmount();
    });
    requestAnimationFrame(() => {
      if (editor.mounted) editor.view.focus();
    });
  });

  createEffect(() => {
    locale();
    if (!editor.mounted) return;
    editor.view.dom.setAttribute("aria-label", t("editor.label"));
    editor.view.dom.dataset.placeholder = t("editor.placeholder");
  });

  useDocChange(() => {
    if (settingContent) return;
    const markdown = handle.getMarkdown();
    if (ignoredProgrammaticMarkdown === markdown) {
      ignoredProgrammaticMarkdown = null;
      return;
    }
    ignoredProgrammaticMarkdown = null;
    editorHintDismissed = true;
    syncEditorSurfaceState();
    props.onChange(markdown, editor.view.dom);
    requestAnimationFrame(() => {
      if (editor.mounted) refreshSlashMenu();
    });
  }, { editor });

  useKeymap(() => ({
    ArrowDown: () => handleSlashMenuKey("ArrowDown"),
    ArrowUp: () => handleSlashMenuKey("ArrowUp"),
    Enter: () => handleSlashMenuKey("Enter"),
    Tab: () => {
      if (handleSlashMenuKey("Tab")) return true;
      if (shouldDeferTabToStructuralKeymap()) return false;
      return insertEditorIndent();
    },
    Escape: () => handleSlashMenuKey("Escape"),
    [EDITOR_KEYMAP.bold]: () => handle.command("toggleBold"),
    [EDITOR_KEYMAP.italic]: () => handle.command("toggleItalic"),
    [EDITOR_KEYMAP.inlineCode]: () => handle.command("toggleCode"),
    [EDITOR_KEYMAP.heading1]: () => handle.command("toggleHeading", { level: 1 }),
    [EDITOR_KEYMAP.heading2]: () => handle.command("toggleHeading", { level: 2 }),
    [EDITOR_KEYMAP.heading3]: () => handle.command("toggleHeading", { level: 3 }),
  }), { editor });

  return (
    <ProseKit editor={editor}>
      <div
        ref={containerRef}
        class="kuku-editor-container"
        onFocusIn={handleEditorFocusIn}
        onFocusOut={handleEditorFocusOut}
        onKeyDown={handleEditorOverlayKeyDown}
        onPointerDown={(event) => {
          if (!isEditorEndBlankPointerDown(event, editor.view.dom)) return;
          event.preventDefault();
          event.stopPropagation();
          closeSlashMenu();
          focusOrCreateEditorEndParagraph(editor.view);
          requestAnimationFrame(refreshSlashMenu);
        }}
      >
        <div
          ref={viewportRef}
          class="kuku-editor-scroll"
          data-scroll-area-viewport=""
          onScroll={handleMeetingViewportScroll}
        >
          <div class="kuku-editor-host" ref={editor.mount} />
        </div>
        <Show when={activeSlashMenu()}>{(menu) =>
          <EditorSlashMenu
            position={menu().position}
            items={visibleSlashItems()}
            selectedIndex={slashMenuSelectedIndex()}
            isItemDisabled={isSlashItemDisabled}
            isItemActive={isSlashItemActive}
            onHoverIndexChange={setSlashMenuSelectedIndex}
            onSelect={applySlashItem}
          />
        }</Show>
      </div>
    </ProseKit>
  );
}

export type { KukuEditorHandle, MeetingTranscriptSegment };
