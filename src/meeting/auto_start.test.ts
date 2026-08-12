import { describe, expect, it } from "vitest";
import {
  MeetingAutoStartCoordinator,
  readMeetingAutoStartPreference,
  type MeetingDetectionSnapshot,
} from "./auto_start";

const zoom: MeetingDetectionSnapshot = {
  available: true,
  detected: true,
  appName: "Zoom",
  bundleId: "us.zoom.xos",
};
const cleared: MeetingDetectionSnapshot = {
  available: true,
  detected: false,
  appName: null,
  bundleId: null,
};

describe("meeting auto-start preference", () => {
  it("defaults to enabled and only an explicit false disables it", () => {
    expect(readMeetingAutoStartPreference(null)).toBe(true);
    expect(readMeetingAutoStartPreference("true")).toBe(true);
    expect(readMeetingAutoStartPreference("invalid")).toBe(true);
    expect(readMeetingAutoStartPreference("false")).toBe(false);
  });
});

describe("MeetingAutoStartCoordinator", () => {
  it("starts once for a detected meeting and ignores duplicate samples", () => {
    const coordinator = new MeetingAutoStartCoordinator();
    expect(coordinator.observe(zoom, { enabled: true, busy: false })).toBe("start");
    expect(coordinator.observe(zoom, { enabled: true, busy: false })).toBe("none");
  });

  it("does not consume a detection while automatic start is disabled", () => {
    const coordinator = new MeetingAutoStartCoordinator();
    expect(coordinator.observe(zoom, { enabled: false, busy: false })).toBe("none");
    expect(coordinator.observe(zoom, { enabled: true, busy: false })).toBe("start");
  });

  it("consumes a detection that arrives during a manual recording", () => {
    const coordinator = new MeetingAutoStartCoordinator();
    expect(coordinator.observe(zoom, { enabled: true, busy: true })).toBe("none");
    expect(coordinator.observe(zoom, { enabled: true, busy: false })).toBe("none");
  });

  it("rearms only after the detector clears the previous session", () => {
    const coordinator = new MeetingAutoStartCoordinator();
    expect(coordinator.observe(zoom, { enabled: true, busy: false })).toBe("start");
    expect(coordinator.observe(cleared, { enabled: true, busy: false })).toBe("none");
    expect(coordinator.observe(zoom, { enabled: true, busy: false })).toBe("start");
  });

  it("keeps unavailable and empty signals inert", () => {
    const coordinator = new MeetingAutoStartCoordinator();
    expect(coordinator.observe({ ...cleared, available: false }, { enabled: true, busy: false })).toBe("none");
  });
});
