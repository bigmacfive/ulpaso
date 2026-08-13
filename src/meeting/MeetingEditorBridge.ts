import type {
  KukuEditorHandle,
  MeetingTranscriptSegment,
} from "../editor/KukuEditor";

interface MeetingEditorState {
  phase: string;
  sessionId: string | null;
}

interface MeetingEditorTranscript {
  sessionId: string;
  kind: "update" | "final";
  stableText: string;
  unstableText: string;
  speakerId: number | null;
  segments: MeetingTranscriptSegment[];
  speakerLimitWarning: boolean;
}

class MeetingEditorBridge {
  private editor: KukuEditorHandle | null = null;
  private state: MeetingEditorState = { phase: "idle", sessionId: null };
  private activeSessionId: string | null = null;
  private readonly titles = new Map<string, string>();
  private readonly pending = new Map<string, MeetingEditorTranscript>();

  constructor(private readonly createTitle: () => string) {}

  attach(editor: KukuEditorHandle): MeetingEditorTranscript[] {
    this.editor = editor;
    this.reconcileState();
    const completed: MeetingEditorTranscript[] = [];
    for (const payload of this.pending.values()) {
      if (this.applyTranscript(payload) && payload.kind === "final") completed.push(payload);
    }
    this.pending.clear();
    return completed;
  }

  updateState(state: MeetingEditorState): void {
    this.state = state;
    this.reconcileState();
  }

  pushTranscript(payload: MeetingEditorTranscript): boolean {
    if (!this.editor) {
      this.pending.set(payload.sessionId, payload);
      return false;
    }
    return this.applyTranscript(payload);
  }

  private titleFor(sessionId: string): string {
    const existing = this.titles.get(sessionId);
    if (existing) return existing;
    const title = this.createTitle();
    this.titles.set(sessionId, title);
    return title;
  }

  private ensureSession(sessionId: string): boolean {
    if (!this.editor) return false;
    if (this.activeSessionId !== sessionId) {
      this.editor.beginMeeting(sessionId, this.titleFor(sessionId));
      this.activeSessionId = sessionId;
    }
    return true;
  }

  private reconcileState(): void {
    const { phase, sessionId } = this.state;
    if (phase === "recording" && sessionId) {
      this.ensureSession(sessionId);
      return;
    }
    if (phase === "error" && sessionId && this.activeSessionId === sessionId && this.editor) {
      this.editor.endMeetingDraft(sessionId);
      this.activeSessionId = null;
      this.titles.delete(sessionId);
    }
  }

  private applyTranscript(payload: MeetingEditorTranscript): boolean {
    if (!this.ensureSession(payload.sessionId) || !this.editor) {
      this.pending.set(payload.sessionId, payload);
      return false;
    }
    if (payload.kind === "final") {
      this.editor.finalizeMeeting(payload.sessionId, payload.segments);
      this.activeSessionId = null;
      this.titles.delete(payload.sessionId);
      return true;
    }
    this.editor.updateMeeting(
      payload.sessionId,
      payload.stableText,
      payload.unstableText,
      payload.speakerId ?? undefined,
    );
    return true;
  }
}

export { MeetingEditorBridge };
export type { MeetingEditorState, MeetingEditorTranscript };
