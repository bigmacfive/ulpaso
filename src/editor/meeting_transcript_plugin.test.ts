// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { history, undo } from "prosekit/pm/history";
import { Schema } from "prosekit/pm/model";
import { EditorState } from "prosekit/pm/state";
import {
  createMeetingTranscriptPlugin,
  getMeetingPluginState,
  setMeetingPluginState,
} from "./meeting_transcript_plugin";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", group: "block" },
    text: { group: "inline" },
  },
});

function paragraph(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);
}

function createState(withHistory = false) {
  const before = paragraph("before");
  const meeting = paragraph("meeting");
  const after = paragraph("after");
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(null, [before, meeting, after]),
    plugins: [createMeetingTranscriptPlugin(), ...(withHistory ? [history()] : [])],
  });
  const from = before.nodeSize;
  const to = from + meeting.nodeSize;
  const transaction = setMeetingPluginState(state.tr, {
    sessionId: "meeting-1",
    from,
    to,
    partial: "듣고 있습니다…",
  });
  transaction.setMeta("addToHistory", false);
  state = state.apply(transaction);
  return { state, from, to };
}

describe("meeting transcript range", () => {
  it("maps the protected range while the surrounding document is edited", () => {
    const initial = createState();
    const transaction = initial.state.tr.insertText("prefix ", 1);
    const result = initial.state.applyTransaction(transaction);

    expect(result.transactions).toHaveLength(1);
    const meeting = getMeetingPluginState(result.state);
    expect(meeting?.from).toBe(initial.from + 7);
    expect(meeting?.to).toBe(initial.to + 7);
  });

  it("blocks deletion and typing inside the active transcript", () => {
    const initial = createState();
    const deleted = initial.state.applyTransaction(
      initial.state.tr.delete(initial.from, initial.to),
    );
    const typed = initial.state.applyTransaction(
      initial.state.tr.insertText("사용자 입력", initial.from + 2),
    );

    expect(deleted.transactions).toHaveLength(0);
    expect(typed.transactions).toHaveLength(0);
    expect(deleted.state.doc.textContent).toBe("beforemeetingafter");
  });

  it("allows machine replacement and exposes only a decoration for partial text", () => {
    const initial = createState();
    const finalNode = paragraph("최종 문장");
    const transaction = initial.state.tr.replaceWith(initial.from, initial.to, finalNode);
    transaction.setMeta("addToHistory", false);
    setMeetingPluginState(transaction, {
      sessionId: "meeting-1",
      from: initial.from,
      to: initial.from + finalNode.nodeSize,
      partial: "아직 바뀔 문장",
    });
    const result = initial.state.applyTransaction(transaction);

    expect(result.transactions).toHaveLength(1);
    expect(result.state.doc.textContent).toBe("before최종 문장after");
    expect(getMeetingPluginState(result.state)?.partial).toBe("아직 바뀔 문장");
  });

  it("keeps machine transcript updates out of undo history", () => {
    let { state, from, to } = createState(true);
    state = state.apply(state.tr.insertText("사용자 ", 1));
    from += 4;
    to += 4;

    const finalNode = paragraph("화자 1 최종 문장");
    const machineUpdate = state.tr.replaceWith(from, to, finalNode);
    machineUpdate.setMeta("addToHistory", false);
    setMeetingPluginState(machineUpdate, {
      sessionId: "meeting-1",
      from,
      to: from + finalNode.nodeSize,
      partial: "",
    });
    state = state.apply(machineUpdate);

    const dispatch = (transaction: typeof state.tr) => {
      state = state.apply(transaction);
    };
    expect(undo(state, dispatch)).toBe(true);
    expect(state.doc.textContent).toBe("before화자 1 최종 문장after");
  });
});
