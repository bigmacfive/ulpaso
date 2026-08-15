// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import App from "./App";
import { MEETING_DETECTION_STORAGE_KEY, type MeetingDetectionSnapshot } from "./meeting/detection_prompt";
import { MEETING_RESOURCE_CONSENT_KEY, type MeetingResourceStatus } from "./meeting/resources";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  show: vi.fn(async () => undefined),
  setFocus: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  onCloseRequested: vi.fn(async () => vi.fn()),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, callback: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(event, callback);
    return vi.fn();
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: mocks.show,
    setFocus: mocks.setFocus,
    close: mocks.close,
    onCloseRequested: mocks.onCloseRequested,
  }),
}));
vi.mock("@tauri-apps/api/app", () => ({ setTheme: vi.fn(async () => undefined) }));
vi.mock("./editor/KukuEditor", () => ({
  default: () => <div data-testid="editor" />,
}));
vi.mock("./components/TitleBar", () => ({
  default: (props: { center?: unknown; right?: unknown }) => (
    <header>{props.center as never}{props.right as never}</header>
  ),
}));

const idleMeeting = {
  phase: "idle",
  sessionId: null,
  progress: null,
  message: null,
  startedAtMs: null,
  errorCode: null,
  microphoneOnly: false,
  systemOnly: false,
};
const readyResources: MeetingResourceStatus = {
  ready: true,
  runtimeReady: true,
  transcriptionModelReady: true,
  speakerModelReady: true,
  estimatedDownloadBytes: 0,
  estimatedInstalledBytes: 1_760_000_000,
  availableDiskBytes: 10_000_000_000,
  diskSpaceSufficient: true,
};
const zoom: MeetingDetectionSnapshot = {
  available: true,
  detected: true,
  appName: "Zoom",
  bundleId: "us.zoom.xos",
  windowId: 42,
};
const googleMeet: MeetingDetectionSnapshot = {
  available: true,
  detected: true,
  appName: "Google Meet",
  bundleId: "com.google.Chrome",
  windowId: 84,
};
const cleared: MeetingDetectionSnapshot = {
  available: true,
  detected: false,
  appName: null,
  bundleId: null,
  windowId: null,
};

let dispose: (() => void) | undefined;
let meetingState = idleMeeting;
let resources = readyResources;
let detectorStatus: MeetingDetectionSnapshot = cleared;
let manualCaptureTarget: { bundleId: string; windowId: number | null } | null = null;
let manualCaptureTargetFails = false;
let microphonePermission: "not-determined" | "authorized" | "denied" = "authorized";

function invokeCalls(command: string) {
  return mocks.invoke.mock.calls.filter(([name]) => name === command);
}

async function mountApp() {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = render(() => <App />, root);
  await vi.waitFor(() => {
    expect(invokeCalls("meeting_status")).toHaveLength(1);
    expect(invokeCalls("meeting_detection_status")).toHaveLength(1);
    expect(mocks.listeners.has("meeting://detection")).toBe(true);
  });
  return root;
}

function emitDetection(snapshot: MeetingDetectionSnapshot) {
  mocks.listeners.get("meeting://detection")?.({ payload: snapshot });
}

beforeEach(() => {
  localStorage.clear();
  meetingState = idleMeeting;
  resources = readyResources;
  detectorStatus = cleared;
  manualCaptureTarget = null;
  manualCaptureTargetFails = false;
  microphonePermission = "authorized";
  mocks.listeners.clear();
  mocks.invoke.mockReset();
  mocks.show.mockClear();
  mocks.setFocus.mockClear();
  mocks.close.mockClear();
  mocks.onCloseRequested.mockClear();
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "meeting_status") return meetingState;
    if (command === "meeting_resources") return resources;
    if (command === "meeting_microphone_permission_status") return microphonePermission;
    if (command === "meeting_request_microphone_permission") {
      microphonePermission = "authorized";
      return microphonePermission;
    }
    if (command === "meeting_detection_status") return detectorStatus;
    if (command === "meeting_detection_capture_target") {
      if (manualCaptureTargetFails) throw new Error("detector unavailable");
      return manualCaptureTarget;
    }
    return idleMeeting;
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("App meeting detection integration", () => {
  it("asks macOS for microphone access on first launch and before starting a meeting", async () => {
    microphonePermission = "not-determined";
    const root = await mountApp();

    await vi.waitFor(() => expect(invokeCalls("meeting_request_microphone_permission")).toHaveLength(1));

    root.querySelector<HTMLButtonElement>(".meeting-trigger")!.click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    const commands = mocks.invoke.mock.calls.map(([command]) => command);
    expect(commands.indexOf("meeting_request_microphone_permission")).toBeGreaterThanOrEqual(0);
    expect(commands.indexOf("meeting_request_microphone_permission")).toBeLessThan(commands.indexOf("meeting_start"));
  });

  it("uses a freshly verified meeting target for a manual combined start", async () => {
    manualCaptureTarget = { bundleId: "us.zoom.xos", windowId: 42 };
    const root = await mountApp();

    root.querySelector<HTMLButtonElement>(".meeting-trigger")!.click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_detection_capture_target")).toHaveLength(1);
    expect(invokeCalls("meeting_start")[0][1]).toEqual({
      microphoneOnly: false,
      systemOnly: false,
      captureBundleId: "us.zoom.xos",
      captureWindowId: 42,
    });
  });

  it("keeps ordinary manual capture untargeted when no meeting is live", async () => {
    const root = await mountApp();

    root.querySelector<HTMLButtonElement>(".meeting-trigger")!.click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_detection_capture_target")).toHaveLength(1);
    expect(invokeCalls("meeting_start")[0][1]).toEqual({
      microphoneOnly: false,
      systemOnly: false,
      captureBundleId: undefined,
      captureWindowId: undefined,
    });
  });

  it("still starts ordinary capture when the optional target lookup fails", async () => {
    manualCaptureTargetFails = true;
    const root = await mountApp();

    root.querySelector<HTMLButtonElement>(".meeting-trigger")!.click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_start")[0][1]).toMatchObject({
      microphoneOnly: false,
      systemOnly: false,
      captureBundleId: undefined,
      captureWindowId: undefined,
    });
  });

  it("targets a manual system-only retry when a meeting was just confirmed", async () => {
    meetingState = {
      ...idleMeeting,
      phase: "error",
      errorCode: "microphone_unavailable",
    };
    manualCaptureTarget = { bundleId: "us.zoom.xos", windowId: 42 };
    const root = await mountApp();

    Array.from(root.querySelectorAll<HTMLButtonElement>(".meeting-error-actions button"))
      .find((button) => button.textContent === "Use system audio only")!
      .click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_detection_capture_target")).toHaveLength(1);
    expect(invokeCalls("meeting_start")[0][1]).toEqual({
      microphoneOnly: false,
      systemOnly: true,
      captureBundleId: "us.zoom.xos",
      captureWindowId: 42,
    });
  });

  it("never queries or passes a display target for microphone-only retry", async () => {
    meetingState = {
      ...idleMeeting,
      phase: "error",
      errorCode: "permission_or_capture",
    };
    manualCaptureTarget = { bundleId: "us.zoom.xos", windowId: 42 };
    const root = await mountApp();

    Array.from(root.querySelectorAll<HTMLButtonElement>(".meeting-error-actions button"))
      .find((button) => button.textContent === "Use microphone only")!
      .click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_detection_capture_target")).toHaveLength(0);
    expect(invokeCalls("meeting_start")[0][1]).toEqual({
      microphoneOnly: true,
      systemOnly: false,
      captureBundleId: undefined,
      captureWindowId: undefined,
    });
  });

  it("shows one confirmation prompt and starts only after approval", async () => {
    const root = await mountApp();
    emitDetection(zoom);

    await vi.waitFor(() => expect(root.querySelector("#meeting-detection-title")?.textContent).toBe("Record this meeting?"));
    expect(root.querySelector("#meeting-detection-description")?.textContent).toContain("Zoom");
    expect(invokeCalls("meeting_start")).toHaveLength(0);
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();

    emitDetection(zoom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelectorAll(".meeting-detection-dialog")).toHaveLength(1);

    root.querySelector<HTMLButtonElement>(".meeting-detection-dialog .button-primary")!.click();
    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_start")[0][1]).toEqual({
      microphoneOnly: false,
      systemOnly: false,
      captureBundleId: "us.zoom.xos",
      captureWindowId: 42,
    });
    expect(invokeCalls("meeting_detection_capture_target")).toHaveLength(0);
  });

  it("keeps the confirmation prompt when macOS denies the focus request", async () => {
    mocks.setFocus.mockRejectedValueOnce(new Error("focus denied"));
    const root = await mountApp();

    emitDetection(googleMeet);

    await vi.waitFor(() => expect(root.querySelector("#meeting-detection-title")?.textContent).toBe("Record this meeting?"));
    expect(root.querySelector("#meeting-detection-description")?.textContent).toContain("Google Meet");
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();
  });

  it("prompts for a Google Meet browser window and keeps its exact capture target", async () => {
    const root = await mountApp();
    emitDetection(googleMeet);

    await vi.waitFor(() => expect(root.querySelector("#meeting-detection-description")?.textContent).toContain("Google Meet"));
    expect(invokeCalls("meeting_start")).toHaveLength(0);
    root.querySelector<HTMLButtonElement>(".meeting-detection-dialog .button-primary")!.click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_start")[0][1]).toMatchObject({
      captureBundleId: "com.google.Chrome",
      captureWindowId: 84,
    });
  });

  it("does not record when the detected meeting prompt is declined", async () => {
    const root = await mountApp();
    emitDetection(zoom);

    await vi.waitFor(() => expect(root.querySelector("#meeting-detection-title")).not.toBeNull());
    root.querySelector<HTMLButtonElement>(".meeting-detection-dialog .button-secondary")!.click();

    expect(root.querySelector("#meeting-detection-title")).toBeNull();
    expect(invokeCalls("meeting_start")).toHaveLength(0);
    emitDetection(zoom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector("#meeting-detection-title")).toBeNull();
  });

  it("does not restart after detection arrives during a manual recording", async () => {
    meetingState = { ...idleMeeting, phase: "recording", sessionId: "manual" };
    await mountApp();
    emitDetection(zoom);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invokeCalls("meeting_start")).toHaveLength(0);
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it("preserves first-use disclosure after approving a detected meeting", async () => {
    resources = { ...readyResources, ready: false, transcriptionModelReady: false };
    const root = await mountApp();
    emitDetection(zoom);

    await vi.waitFor(() => expect(root.querySelector("#meeting-detection-title")).not.toBeNull());
    root.querySelector<HTMLButtonElement>(".meeting-detection-dialog .button-primary")!.click();
    await vi.waitFor(() => {
      expect(root.querySelector("#meeting-setup-title")?.textContent).toContain("Prepare local meeting transcription");
    });
    expect(invokeCalls("meeting_start")).toHaveLength(0);

    root.querySelector<HTMLButtonElement>(".meeting-setup-dialog .button-primary")!.click();
    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(invokeCalls("meeting_start")[0][1]).toMatchObject({
      captureBundleId: "us.zoom.xos",
      captureWindowId: 42,
    });
    expect(localStorage.getItem(MEETING_RESOURCE_CONSENT_KEY)).toBe("accepted");
  });

  it("can be enabled while a current detection is active", async () => {
    localStorage.setItem(MEETING_DETECTION_STORAGE_KEY, "false");
    detectorStatus = zoom;
    const root = await mountApp();
    expect(invokeCalls("meeting_start")).toHaveLength(0);

    root.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!.click();
    const detection = root.querySelector<HTMLElement>('[role="group"][aria-label="Meeting detection"]')!;
    detection.querySelectorAll<HTMLButtonElement>("button")[0].click();

    await vi.waitFor(() => expect(root.querySelector("#meeting-detection-title")).not.toBeNull());
    expect(invokeCalls("meeting_start")).toHaveLength(0);
    expect(localStorage.getItem(MEETING_DETECTION_STORAGE_KEY)).toBe("true");
  });
});
