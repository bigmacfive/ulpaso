import { setTheme as setNativeTheme } from "@tauri-apps/api/app";

export type AppTheme = "light" | "dark";

export function readStoredTheme(value: string | null): AppTheme {
  return value === "dark" ? "dark" : "light";
}

export async function applyAppTheme(theme: AppTheme): Promise<void> {
  document.documentElement.dataset.theme = theme;

  if (!("__TAURI_INTERNALS__" in window)) return;

  try {
    // Native window chrome (including macOS traffic lights) otherwise keeps
    // following the OS appearance, which can disagree with the editor theme.
    await setNativeTheme(theme);
  } catch (error) {
    console.warn("Failed to synchronize the native window theme", error);
  }
}
