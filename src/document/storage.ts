type RecentDocument = { path: string; title: string };
type RecoveredDraft = { content: string; path: string | null; updatedAt: number };

const DRAFT_STORAGE_KEY = "ulpaso-recovery-draft-v1";
const RECENT_STORAGE_KEY = "ulpaso-recent";

function loadRecoveryDraft(storage: Pick<Storage, "getItem"> = localStorage): RecoveredDraft | null {
  try {
    const parsed = JSON.parse(storage.getItem(DRAFT_STORAGE_KEY) ?? "null") as Partial<RecoveredDraft> | null;
    if (!parsed || typeof parsed.content !== "string" || !parsed.content.trim()) return null;
    return {
      content: parsed.content,
      path: typeof parsed.path === "string" ? parsed.path : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function persistRecoveryDraft(
  markdown: string,
  path: string | null,
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage,
): void {
  if (!markdown.trim()) {
    storage.removeItem(DRAFT_STORAGE_KEY);
    return;
  }
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ content: markdown, path, updatedAt: Date.now() }));
}

function clearRecoveryDraft(storage: Pick<Storage, "removeItem"> = localStorage): void {
  storage.removeItem(DRAFT_STORAGE_KEY);
}

function loadRecentDocuments(storage: Pick<Storage, "getItem"> = localStorage): RecentDocument[] {
  try {
    const parsed = JSON.parse(storage.getItem(RECENT_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentDocument => Boolean(item) && typeof item.path === "string" && typeof item.title === "string")
      .slice(0, 8);
  } catch {
    return [];
  }
}

function updateRecentDocuments(
  items: RecentDocument[],
  path: string,
  title: string,
  storage: Pick<Storage, "setItem"> = localStorage,
): RecentDocument[] {
  const next = [{ path, title }, ...items.filter((item) => item.path !== path)].slice(0, 8);
  storage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function documentTitle(markdown: string, path: string | null, untitled: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path?.split("/").pop()?.replace(/\.md$/i, "") || untitled;
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) return error.message;
  return fallback;
}

export {
  clearRecoveryDraft,
  documentTitle,
  loadRecentDocuments,
  loadRecoveryDraft,
  persistRecoveryDraft,
  readableError,
  updateRecentDocuments,
};
export type { RecentDocument, RecoveredDraft };
