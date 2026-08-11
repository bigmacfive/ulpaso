import type { PMNodeJSON } from "@ulpaso/markdown/types";

interface MeetingTranscriptSegment {
  speaker?: number | null;
  text: string;
  start?: number | null;
  end?: number | null;
}

function createMeetingDocumentNodes(
  title: string,
  segments: MeetingTranscriptSegment[],
): PMNodeJSON[] {
  const paragraphs = segments
    .filter((segment) => segment.text.trim())
    .flatMap((segment): PMNodeJSON[] => {
      const nodes: PMNodeJSON[] = [];
      if (segment.speaker) {
        nodes.push({
          type: "paragraph",
          content: [{
            type: "text",
            text: `Speaker ${segment.speaker}`,
            marks: [{ type: "bold" }],
          }],
        });
      }
      nodes.push({
        type: "paragraph",
        content: [{ type: "text", text: segment.text.trim() }],
      });
      return nodes;
    });

  return [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: title }],
    },
    ...(paragraphs.length ? paragraphs : [{ type: "paragraph" }]),
  ];
}

export { createMeetingDocumentNodes };
export type { MeetingTranscriptSegment };
