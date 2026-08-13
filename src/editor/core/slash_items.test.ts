import { describe, expect, it } from "vitest";

import {
  getEditorSlashItems,
  registerEditorSlashItem,
  type EditorSlashItem,
} from "./slash_items";

function item(id: string, title: string): EditorSlashItem {
  return {
    id,
    title,
    execute: () => undefined,
  };
}

describe("slash item registry", () => {
  it("shows only the latest registration for a stable command id", () => {
    const id = "test.hmr-duplicate";
    const disposeFirst = registerEditorSlashItem(item(id, "첫 등록"));
    const disposeSecond = registerEditorSlashItem(item(id, "HMR 재등록"));

    expect(getEditorSlashItems().filter((entry) => entry.id === id)).toEqual([
      expect.objectContaining({ title: "HMR 재등록" }),
    ]);

    disposeSecond();
    expect(getEditorSlashItems().filter((entry) => entry.id === id)).toEqual([
      expect.objectContaining({ title: "첫 등록" }),
    ]);

    disposeFirst();
    expect(getEditorSlashItems().some((entry) => entry.id === id)).toBe(false);
  });
});
