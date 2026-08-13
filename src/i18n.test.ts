// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { locale, setLocale, t } from "./i18n";
import { getEditorSlashItems, registerDefaultEditorSlashItems } from "./editor/core/slash_items";

afterEach(() => {
  setLocale("en");
});

describe("interface localization", () => {
  it("switches and persists Korean and Japanese interface copy", () => {
    setLocale("ko");
    expect(locale()).toBe("ko");
    expect(t("settings.title")).toBe("설정");
    expect(t("settings.meetingDownload", { size: "1.8 GB" })).toContain("1.8 GB의 AI 모델");
    expect(t("settings.shortcutsDescription")).toContain("?");
    expect(t("meeting.modelProgress", { progress: 42 })).toBe("모델 42%");
    expect(document.documentElement.lang).toBe("ko");
    expect(localStorage.getItem("ulpaso-locale")).toBe("ko");

    setLocale("ja");
    expect(t("settings.title")).toBe("設定");
    expect(t("settings.meetingDownload", { size: "1.8 GB" })).toContain("AIモデル");
    expect(t("meeting.modelProgress", { progress: 42 })).toBe("モデル 42%");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("localizes already-registered editor slash commands without rebuilding the editor", () => {
    const dispose = registerDefaultEditorSlashItems();
    setLocale("ja");
    expect(getEditorSlashItems().find((item) => item.id === "core-editor.heading-1")?.title).toBe("見出し1");
    setLocale("ko");
    expect(getEditorSlashItems().find((item) => item.id === "core-editor.heading-1")?.title).toBe("제목 1");
    dispose();
  });
});
