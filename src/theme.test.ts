// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nativeThemeMocks = vi.hoisted(() => ({
  setTheme: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/app", () => ({
  setTheme: nativeThemeMocks.setTheme,
}));

import { applyAppTheme, readStoredTheme } from "./theme";

describe("app theme synchronization", () => {
  beforeEach(() => {
    nativeThemeMocks.setTheme.mockClear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it.each([
    { theme: "light", systemTheme: "dark" },
    { theme: "dark", systemTheme: "light" },
  ] as const)(
    "forces the $theme app theme when the system theme is $systemTheme",
    async ({ theme }) => {
      Object.defineProperty(window, "__TAURI_INTERNALS__", {
        value: {},
        configurable: true,
      });

      await applyAppTheme(theme);

      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(nativeThemeMocks.setTheme).toHaveBeenCalledOnce();
      expect(nativeThemeMocks.setTheme).toHaveBeenCalledWith(theme);
    },
  );

  it("updates the web theme without invoking Tauri in a browser", async () => {
    await applyAppTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(nativeThemeMocks.setTheme).not.toHaveBeenCalled();
  });

  it("falls back to light for missing or invalid persisted values", () => {
    expect(readStoredTheme(null)).toBe("light");
    expect(readStoredTheme("system")).toBe("light");
    expect(readStoredTheme("light")).toBe("light");
    expect(readStoredTheme("dark")).toBe("dark");
  });
});
