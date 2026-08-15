import { describe, expect, it } from "vitest";
import { SHORTCUTS, appShortcutAction, shortcutHint } from "./shortcuts";

function keyEvent(key: string, modifiers: Partial<Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">> = {}) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe("shortcut registry", () => {
  it("keeps every shortcut id unique", () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("distinguishes save from save as using exact modifiers", () => {
    expect(appShortcutAction(keyEvent("s", { metaKey: true }))).toBe("save");
    expect(appShortcutAction(keyEvent("S", { metaKey: true, shiftKey: true }))).toBe("saveAs");
  });

  it("supports Control as Mod without accepting unrelated modifiers", () => {
    expect(appShortcutAction(keyEvent("k", { ctrlKey: true }))).toBe("palette");
    expect(appShortcutAction(keyEvent("k", { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("does not reserve the removed focus-mode shortcut", () => {
    expect(appShortcutAction(keyEvent("F", { metaKey: true, shiftKey: true }))).toBeNull();
  });

  it("exposes readable key hints from the same registry used by the guide", () => {
    expect(shortcutHint("settings")).toBe("⌘ ,");
    expect(shortcutHint("meeting")).toBe("⌘ ⇧ M");
  });
});
