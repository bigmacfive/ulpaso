const MEETING_AUTO_START_STORAGE_KEY = "ulpaso-meeting-auto-start";

interface MeetingDetectionSnapshot {
  available: boolean;
  detected: boolean;
  appName: string | null;
  bundleId: string | null;
}

interface MeetingAutoStartContext {
  enabled: boolean;
  busy: boolean;
}

type MeetingAutoStartAction = "start" | "none";

function readMeetingAutoStartPreference(value: string | null): boolean {
  return value !== "false";
}

class MeetingAutoStartCoordinator {
  private handledDetection: string | null = null;

  observe(
    snapshot: MeetingDetectionSnapshot,
    context: MeetingAutoStartContext,
  ): MeetingAutoStartAction {
    if (!snapshot.detected) {
      this.handledDetection = null;
      return "none";
    }
    if (!context.enabled) return "none";

    const detectionKey = snapshot.bundleId || snapshot.appName || "meeting";
    if (this.handledDetection === detectionKey) return "none";

    // A detection that arrives while the user is already transcribing belongs
    // to that same session. Consume it so manually stopping never causes an
    // immediate automatic restart.
    this.handledDetection = detectionKey;
    return context.busy ? "none" : "start";
  }
}

export {
  MEETING_AUTO_START_STORAGE_KEY,
  MeetingAutoStartCoordinator,
  readMeetingAutoStartPreference,
};
export type {
  MeetingAutoStartAction,
  MeetingAutoStartContext,
  MeetingDetectionSnapshot,
};
