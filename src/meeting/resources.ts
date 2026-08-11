type MeetingResourceStatus = {
  ready: boolean;
  runtimeReady: boolean;
  transcriptionModelReady: boolean;
  speakerModelReady: boolean;
  estimatedDownloadBytes: number;
  estimatedInstalledBytes: number;
  availableDiskBytes: number | null;
  diskSpaceSufficient: boolean;
};

const MEETING_RESOURCE_CONSENT_KEY = "ulpaso-meeting-resource-consent-v1";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const gigabytes = bytes / 1_000_000_000;
  if (gigabytes >= 1) return `${gigabytes.toFixed(gigabytes >= 10 ? 0 : 1)} GB`;
  return `${Math.ceil(bytes / 1_000_000)} MB`;
}

function hasMeetingResourceConsent(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(MEETING_RESOURCE_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

function saveMeetingResourceConsent(storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(MEETING_RESOURCE_CONSENT_KEY, "accepted");
  } catch {
    // The disclosure is still valid for this start even when storage is disabled.
  }
}

export {
  MEETING_RESOURCE_CONSENT_KEY,
  formatBytes,
  hasMeetingResourceConsent,
  saveMeetingResourceConsent,
};
export type { MeetingResourceStatus };
