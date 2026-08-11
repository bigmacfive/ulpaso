import { beforeAll, describe, expect, it } from "vitest";
import { editorCoreMarkdown } from "./core/markdown_handlers";
import {
  buildMarkdownService,
  contributeMarkdown,
  getMarkdownService,
} from "./markdown_service";
import { createMeetingDocumentNodes } from "./meeting_document";

beforeAll(() => {
  contributeMarkdown("meeting-document-test", editorCoreMarkdown);
  buildMarkdownService();
});

describe("meeting document markdown", () => {
  it("serializes final speaker turns as editable standard markdown", () => {
    const content = createMeetingDocumentNodes("미팅 노트 · 2026-08-04 14:30", [
      { speaker: 1, text: "첫 번째 발화 내용" },
      { speaker: 2, text: "두 번째 발화 내용" },
    ]);
    const markdown = getMarkdownService()?.stringify({ type: "doc", content });

    expect(markdown).toBe([
      "## 미팅 노트 · 2026-08-04 14:30",
      "",
      "**Speaker 1**",
      "",
      "첫 번째 발화 내용",
      "",
      "**Speaker 2**",
      "",
      "두 번째 발화 내용",
      "",
    ].join("\n"));
  });

  it("keeps an empty editable paragraph while capture is preparing", () => {
    expect(createMeetingDocumentNodes("미팅 노트", [])).toEqual([
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "미팅 노트" }],
      },
      { type: "paragraph" },
    ]);
  });
});
