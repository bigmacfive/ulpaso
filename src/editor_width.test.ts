import { describe, expect, it } from "vitest";
import { readEditorFullWidthPreference } from "./editor_width";

describe("editor width preference", () => {
  it("defaults to the focused reading width", () => {
    expect(readEditorFullWidthPreference(null)).toBe(false);
    expect(readEditorFullWidthPreference("invalid")).toBe(false);
  });

  it("enables full width only when explicitly stored", () => {
    expect(readEditorFullWidthPreference("true")).toBe(true);
    expect(readEditorFullWidthPreference("false")).toBe(false);
  });
});
