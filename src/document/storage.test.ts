import { describe, expect, it } from "vitest";
import {
  documentTitle,
  loadRecentDocuments,
  loadRecoveryDraft,
  persistRecoveryDraft,
  readableError,
  updateRecentDocuments,
} from "./storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("document persistence", () => {
  it("round-trips recovery drafts and ignores empty content", () => {
    const storage = memoryStorage();
    persistRecoveryDraft("# Draft", "/tmp/draft.md", storage);
    expect(loadRecoveryDraft(storage)).toMatchObject({ content: "# Draft", path: "/tmp/draft.md" });
    persistRecoveryDraft("  ", null, storage);
    expect(loadRecoveryDraft(storage)).toBeNull();
  });

  it("deduplicates and caps recent documents", () => {
    const storage = memoryStorage();
    let recent = Array.from({ length: 8 }, (_, index) => ({ path: `/${index}.md`, title: String(index) }));
    recent = updateRecentDocuments(recent, "/4.md", "updated", storage);
    expect(recent).toHaveLength(8);
    expect(recent[0]).toEqual({ path: "/4.md", title: "updated" });
    expect(loadRecentDocuments(storage)).toEqual(recent);
  });

  it("prefers a Markdown heading and normalizes thrown values", () => {
    expect(documentTitle("# Project\n", "/tmp/file.md", "Untitled")).toBe("Project");
    expect(documentTitle("text", "/tmp/file.md", "Untitled")).toBe("file");
    expect(readableError(new Error("failed"), "fallback")).toBe("failed");
    expect(readableError(null, "fallback")).toBe("fallback");
  });
});
