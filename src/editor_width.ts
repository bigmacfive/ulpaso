const EDITOR_FULL_WIDTH_STORAGE_KEY = "ulpaso-editor-full-width";

function readEditorFullWidthPreference(value: string | null): boolean {
  return value === "true";
}

export { EDITOR_FULL_WIDTH_STORAGE_KEY, readEditorFullWidthPreference };
