// @vitest-environment jsdom

import { render } from "solid-js/web";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import KukuEditor, {
  type KukuEditorHandle,
  type MeetingTranscriptSegment,
} from "./KukuEditor";

beforeAll(() => {
  let insideAnimationFrame = false;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    if (insideAnimationFrame) {
      return globalThis.setTimeout(() => callback(performance.now()), 0);
    }
    insideAnimationFrame = true;
    try {
      callback(performance.now());
    } finally {
      insideAnimationFrame = false;
    }
    return 0;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) => {
    globalThis.clearTimeout(handle);
  }) as typeof cancelAnimationFrame;
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 16);
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  }) as DOMRectList;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("KukuEditor meeting integration", () => {
  it("replaces live content with one editable final speaker markdown region", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const changes: string[] = [];
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"# 앞 문서\n\n본문\n"}
          onReady={(next) => { handle = next; }}
          onChange={(markdown) => { changes.push(markdown); }}
        />
      ),
      root,
    );
    await Promise.resolve();
    expect(handle).toBeDefined();

    handle!.beginMeeting("session-1", "미팅 노트 · 2026-08-04 14:30");
    handle!.updateMeeting(
      "session-1",
      "첫 번째 실시간 문장",
      "아직 확정 전",
      1,
    );
    const finalSegments: MeetingTranscriptSegment[] = [
      { speaker: 1, text: "첫 번째 최종 문장" },
      { speaker: 2, text: "두 번째 최종 문장" },
    ];
    handle!.finalizeMeeting("session-1", finalSegments);

    expect(handle!.getMarkdown()).toContain([
      "## 미팅 노트 · 2026-08-04 14:30",
      "",
      "**Speaker 1**",
      "",
      "첫 번째 최종 문장",
      "",
      "**Speaker 2**",
      "",
      "두 번째 최종 문장",
    ].join("\n"));
    expect(root.textContent).not.toContain("아직 확정 전");
    expect(changes.at(-1)).toBe(handle!.getMarkdown());
    dispose();
  });

  it("keeps stable text and removes the partial decoration after a recoverable error", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"# 회의 문서\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    handle!.beginMeeting("session-error", "미팅 노트");
    handle!.updateMeeting("session-error", "오류 전에 확정된 문장", "바뀔 문장", 1);
    handle!.endMeetingDraft("session-error");

    expect(handle!.getMarkdown()).toContain("오류 전에 확정된 문장");
    expect(root.textContent).not.toContain("바뀔 문장");
    dispose();
  });

  it("applies the prism reveal only to the latest stable transcript delta", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"회의 전 문장\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    handle!.beginMeeting("session-prism", "미팅 노트");
    handle!.updateMeeting("session-prism", "첫 번째 문장", "작성 중", 1);
    expect(root.querySelector(".meeting-transcript-reveal")?.textContent).toBe("첫 번째 문장");
    expect(root.querySelector(".meeting-transcript-partial")?.textContent).toContain("작성 중");
    expect(root.querySelector(".meeting-transcript-partial .tl-loader")).toBeNull();

    handle!.updateMeeting("session-prism", "첫 번째 문장", "작성 중 계속", 1);
    expect(root.querySelector(".meeting-transcript-partial")?.textContent).toContain("작성 중 계속");

    handle!.updateMeeting("session-prism", "첫 번째 문장 두 번째 문장", "계속 작성 중", 1);
    const reveal = root.querySelector(".meeting-transcript-reveal");
    expect(reveal?.textContent?.trim()).toBe("두 번째 문장");
    expect(reveal?.textContent).not.toContain("첫 번째 문장");
    expect(root.querySelector(".meeting-transcript-partial")?.textContent).toContain("계속 작성 중");
    expect(root.querySelector(".meeting-transcript-partial .tl-loader")).toBeNull();

    handle!.finalizeMeeting("session-prism", [{ speaker: 1, text: "최종 문장" }]);
    expect(root.querySelector(".meeting-transcript-reveal")).toBeNull();
    expect(root.querySelector(".meeting-transcript-partial .tl-loader")).toBeNull();
    dispose();
  });

  it("does not merge earlier speakers when a rolling accuracy block rewrites text", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"회의 전 문장\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    handle!.beginMeeting("session-correction", "미팅 노트");
    handle!.updateMeeting(
      "session-correction",
      "안녕하세요 오늘 회의를 시작합니다",
      "",
      1,
    );
    handle!.updateMeeting(
      "session-correction",
      "안녕하세요 오늘 회의를 시작합니다 두 번째 화자가 답합니다",
      "",
      2,
    );
    handle!.updateMeeting(
      "session-correction",
      "안녕하세요. 오늘 회의를 시작합니다. 두 번째 화자가 답변합니다.",
      "",
      2,
    );

    const markdown = handle!.getMarkdown();
    expect(markdown.match(/\*\*Speaker 1\*\*/g)).toHaveLength(1);
    expect(markdown.match(/\*\*Speaker 2\*\*/g)).toHaveLength(1);
    expect(markdown).toContain("안녕하세요. 오늘 회의를 시작합니다.");
    expect(markdown).toContain("두 번째 화자가 답변합니다.");
    dispose();
  });

  it("keeps reliable live speaker boundaries when final diarization collapses them", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"회의 전 문장\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    handle!.beginMeeting("session-final-regression", "미팅 노트");
    handle!.updateMeeting("session-final-regression", "첫 화자 발언", "", 1);
    handle!.updateMeeting("session-final-regression", "첫 화자 발언 둘째 화자 답변", "", 2);
    handle!.finalizeMeeting("session-final-regression", [
      { speaker: 1, text: "첫 화자 발언. 둘째 화자 답변." },
    ]);

    const markdown = handle!.getMarkdown();
    expect(markdown.match(/\*\*Speaker 1\*\*/g)).toHaveLength(1);
    expect(markdown.match(/\*\*Speaker 2\*\*/g)).toHaveLength(1);
    dispose();
  });

  it("removes provisional third and fourth speakers after final cleanup", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"# 회의 문서\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    handle!.beginMeeting("session-over-split", "미팅 노트");
    handle!.updateMeeting("session-over-split", "첫 발언", "", 1);
    handle!.updateMeeting("session-over-split", "첫 발언 임시 둘", "", 2);
    handle!.updateMeeting("session-over-split", "첫 발언 임시 둘 상대방", "", 3);
    handle!.updateMeeting("session-over-split", "첫 발언 임시 둘 상대방 임시 넷", "", 4);
    handle!.finalizeMeeting("session-over-split", [
      { speaker: 1, text: "첫 발언 임시 둘" },
      { speaker: 2, text: "상대방 임시 넷" },
    ]);

    const markdown = handle!.getMarkdown();
    expect(markdown.match(/\*\*Speaker 1\*\*/g)).toHaveLength(1);
    expect(markdown.match(/\*\*Speaker 2\*\*/g)).toHaveLength(1);
    expect(markdown).not.toContain("**Speaker 3**");
    expect(markdown).not.toContain("**Speaker 4**");
    dispose();
  });

  it("follows the live transcript tail until the user scrolls away", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"회의 전 문장\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    const viewport = root.querySelector<HTMLElement>(".kuku-editor-scroll")!;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    handle!.beginMeeting("session-scroll", "미팅 노트");
    expect(viewport.scrollTop).toBe(1_000);

    viewport.scrollTop = 120;
    viewport.dispatchEvent(new Event("scroll"));
    handle!.updateMeeting("session-scroll", "사용자가 읽는 동안 추가된 문장", "작성 중", 1);
    expect(viewport.scrollTop).toBe(120);

    viewport.scrollTop = 800;
    viewport.dispatchEvent(new Event("scroll"));
    handle!.updateMeeting("session-scroll", "사용자가 읽는 동안 추가된 문장 최신 문장", "계속 작성 중", 1);
    expect(viewport.scrollTop).toBe(1_000);
    dispose();
  });

  it("dismisses the document hint after any editing command until a new blank document loads", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={""}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    expect(handle!.getElement().dataset.empty).toBe("true");
    expect(handle!.command("toggleHeading", { level: 1 })).toBe(true);
    expect(handle!.getElement().querySelector("h1")).not.toBeNull();
    expect(handle!.getElement().dataset.empty).toBe("false");

    expect(handle!.command("toggleHeading", { level: 1 })).toBe(true);
    expect(handle!.getElement().querySelector("p")).not.toBeNull();
    expect(handle!.getElement().dataset.empty).toBe("false");

    handle!.setMarkdown("");
    expect(handle!.getElement().dataset.empty).toBe("true");
    dispose();
  });

  it("keeps appending a one-hour live transcript without rebuilding speaker history", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"회의 전 문장\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    handle!.beginMeeting("session-long", "미팅 노트 · 장시간 테스트");
    const stableParts: string[] = [];
    for (let index = 0; index < 1_800; index += 1) {
      stableParts.push(`문장${index}`);
      handle!.updateMeeting(
        "session-long",
        stableParts.join(" "),
        `임시${index}`,
        1,
      );
    }

    const markdown = handle!.getMarkdown();
    expect(markdown).toContain("문장0 문장1 문장2");
    expect(markdown).toContain("문장1797 문장1798 문장1799");
    expect(markdown.match(/\*\*Speaker 1\*\*/g)).toHaveLength(1);
    expect(root.textContent).toContain("임시1799");
    dispose();
  }, 15_000);

  it("keeps the editor selectable and inserts Kuku-sized indentation with Tab", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"한글 입력"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    const editorElement = handle!.getElement();
    expect(editorElement.getAttribute("contenteditable")).toBe("true");
    const textNode = editorElement.querySelector("p")?.firstChild;
    expect(textNode).toBeTruthy();

    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode!, textNode!.textContent?.length ?? 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editorElement.focus();
    editorElement.dispatchEvent(new Event("selectionchange", { bubbles: true }));

    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    editorElement.dispatchEvent(tab);

    expect(handle!.getMarkdown().replace(/&#x20;/g, " ")).toContain("한글 입력    ");
    dispose();
  });

  it("turns a heading back into a paragraph with Backspace at its start", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let handle: KukuEditorHandle | undefined;
    const dispose = render(
      () => (
        <KukuEditor
          initialMarkdown={"# 제목 내용\n"}
          onReady={(next) => { handle = next; }}
          onChange={() => undefined}
        />
      ),
      root,
    );
    await Promise.resolve();

    const editorElement = handle!.getElement();
    const textNode = editorElement.querySelector("h1")?.firstChild;
    expect(textNode).toBeTruthy();
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode!, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editorElement.focus();
    editorElement.dispatchEvent(new Event("selectionchange", { bubbles: true }));

    const backspace = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    });
    editorElement.dispatchEvent(backspace);

    expect(editorElement.querySelector("h1")).toBeNull();
    expect(editorElement.querySelector("p")?.textContent).toBe("제목 내용");
    expect(handle!.getMarkdown()).not.toContain("# 제목 내용");
    dispose();
  });
});
