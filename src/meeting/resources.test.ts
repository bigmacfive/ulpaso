import { describe, expect, it } from "vitest";
import {
  MEETING_RESOURCE_CONSENT_KEY,
  formatBytes,
  hasMeetingResourceConsent,
  saveMeetingResourceConsent,
} from "./resources";

describe("meeting resource disclosure", () => {
  it("formats the first-use cost without false precision", () => {
    expect(formatBytes(1_760_000_000)).toBe("1.8 GB");
    expect(formatBytes(500_000_000)).toBe("500 MB");
    expect(formatBytes(0)).toBe("0 MB");
  });

  it("stores an explicit consent marker", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(hasMeetingResourceConsent(storage)).toBe(false);
    saveMeetingResourceConsent(storage);
    expect(values.get(MEETING_RESOURCE_CONSENT_KEY)).toBe("accepted");
    expect(hasMeetingResourceConsent(storage)).toBe(true);
  });
});
