import { describe, expect, it, vi } from "vitest";
import type { KukuEditorHandle } from "../editor/KukuEditor";
import {
  MeetingEditorBridge,
  type MeetingEditorTranscript,
} from "./MeetingEditorBridge";

function fakeEditor() {
  return {
    beginMeeting: vi.fn(),
    updateMeeting: vi.fn(),
    finalizeMeeting: vi.fn(),
    endMeetingDraft: vi.fn(),
  } as unknown as KukuEditorHandle;
}

function update(sessionId = "session-1", stableText = "확정 문장"): MeetingEditorTranscript {
  return {
    sessionId,
    kind: "update",
    stableText,
    unstableText: "작성 중",
    speakerId: 1,
    segments: [],
    speakerLimitWarning: false,
  };
}

describe("MeetingEditorBridge", () => {
  it("creates the meeting region when recording starts before the editor is ready", () => {
    const bridge = new MeetingEditorBridge(() => "미팅 노트");
    const editor = fakeEditor();

    bridge.updateState({ phase: "recording", sessionId: "session-1" });
    bridge.attach(editor);

    expect(editor.beginMeeting).toHaveBeenCalledWith("session-1", "미팅 노트");
  });

  it("replays the latest transcript that arrived before the editor was ready", () => {
    const bridge = new MeetingEditorBridge(() => "미팅 노트");
    const editor = fakeEditor();

    expect(bridge.pushTranscript(update("session-1", "첫 문장"))).toBe(false);
    expect(bridge.pushTranscript(update("session-1", "첫 문장 둘째 문장"))).toBe(false);
    bridge.attach(editor);

    expect(editor.beginMeeting).toHaveBeenCalledTimes(1);
    expect(editor.updateMeeting).toHaveBeenCalledTimes(1);
    expect(editor.updateMeeting).toHaveBeenCalledWith(
      "session-1",
      "첫 문장 둘째 문장",
      "작성 중",
      1,
    );
  });

  it("does not lose a final transcript that arrives during editor startup", () => {
    const bridge = new MeetingEditorBridge(() => "미팅 노트");
    const editor = fakeEditor();
    const final: MeetingEditorTranscript = {
      ...update(),
      kind: "final",
      stableText: "최종 문장",
      unstableText: "",
      segments: [{ speaker: 1, text: "최종 문장" }],
    };

    expect(bridge.pushTranscript(final)).toBe(false);
    const completed = bridge.attach(editor);

    expect(editor.beginMeeting).toHaveBeenCalledTimes(1);
    expect(editor.finalizeMeeting).toHaveBeenCalledWith("session-1", final.segments);
    expect(completed).toEqual([final]);
  });

  it("uses the canonical final text when speaker segments are empty", () => {
    const bridge = new MeetingEditorBridge(() => "미팅 노트");
    const editor = fakeEditor();
    bridge.attach(editor);

    bridge.pushTranscript({
      ...update(),
      kind: "final",
      stableText: "누락되면 안 되는 최종 문장",
      unstableText: "",
      segments: [],
    });

    expect(editor.finalizeMeeting).toHaveBeenCalledWith("session-1", [
      { speaker: null, text: "누락되면 안 되는 최종 문장" },
    ]);
  });

  it("uses the canonical final text when speaker cleanup drops content", () => {
    const bridge = new MeetingEditorBridge(() => "미팅 노트");
    const editor = fakeEditor();
    bridge.attach(editor);

    bridge.pushTranscript({
      ...update(),
      kind: "final",
      stableText: "첫 문장 둘째 문장 셋째 문장 넷째 문장",
      unstableText: "",
      segments: [{ speaker: 1, text: "첫 문장" }],
    });

    expect(editor.finalizeMeeting).toHaveBeenCalledWith("session-1", [
      { speaker: null, text: "첫 문장 둘째 문장 셋째 문장 넷째 문장" },
    ]);
  });

  it("uses the canonical final text when speaker cleanup inserts content", () => {
    const bridge = new MeetingEditorBridge(() => "미팅 노트");
    const editor = fakeEditor();
    bridge.attach(editor);

    bridge.pushTranscript({
      ...update(),
      kind: "final",
      stableText: "첫 문장 둘째 문장",
      unstableText: "",
      segments: [{ speaker: 1, text: "첫 문장 잘못 추가된 문장 둘째 문장" }],
    });

    expect(editor.finalizeMeeting).toHaveBeenCalledWith("session-1", [
      { speaker: null, text: "첫 문장 둘째 문장" },
    ]);
  });

  it("keeps a recovered worker update in the same active document region", () => {
    const bridge = new MeetingEditorBridge(() => "미팅 노트");
    const editor = fakeEditor();
    bridge.attach(editor);
    bridge.updateState({ phase: "recording", sessionId: "session-1" });

    bridge.pushTranscript(update("session-1", "복구 전"));
    bridge.updateState({ phase: "recording", sessionId: "session-1" });
    bridge.pushTranscript(update("session-1", "복구 전 복구 후"));

    expect(editor.beginMeeting).toHaveBeenCalledTimes(1);
    expect(editor.updateMeeting).toHaveBeenCalledTimes(2);
  });
});
