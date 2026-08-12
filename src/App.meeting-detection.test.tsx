// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import App from "./App";
import { MEETING_AUTO_START_STORAGE_KEY, type MeetingDetectionSnapshot } from "./meeting/auto_start";
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
};
const cleared: MeetingDetectionSnapshot = {
  available: true,
  detected: false,
  appName: null,
  bundleId: null,
};

let dispose: (() => void) | undefined;
let meetingState = idleMeeting;
let resources = readyResources;
let detectorStatus: MeetingDetectionSnapshot = cleared;

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
  mocks.listeners.clear();
  mocks.invoke.mockReset();
  mocks.show.mockClear();
  mocks.setFocus.mockClear();
  mocks.close.mockClear();
  mocks.onCloseRequested.mockClear();
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "meeting_status") return meetingState;
    if (command === "meeting_resources") return resources;
    if (command === "meeting_detection_status") return detectorStatus;
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
  it("shows the app and starts exactly once for duplicate detection events", async () => {
    await mountApp();
    emitDetection(zoom);

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();

    emitDetection(zoom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invokeCalls("meeting_start")).toHaveLength(1);
  });

  it("does not restart after detection arrives during a manual recording", async () => {
    meetingState = { ...idleMeeting, phase: "recording", sessionId: "manual" };
    await mountApp();
    emitDetection(zoom);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invokeCalls("meeting_start")).toHaveLength(0);
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it("preserves first-use disclosure before an automatically detected meeting", async () => {
    resources = { ...readyResources, ready: false, transcriptionModelReady: false };
    const root = await mountApp();
    emitDetection(zoom);

    await vi.waitFor(() => {
      expect(root.querySelector("#meeting-setup-title")?.textContent).toContain("Prepare local meeting transcription");
    });
    expect(invokeCalls("meeting_start")).toHaveLength(0);

    root.querySelector<HTMLButtonElement>(".meeting-setup-dialog .button-primary")!.click();
    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(localStorage.getItem(MEETING_RESOURCE_CONSENT_KEY)).toBe("accepted");
  });

  it("can be enabled while a current detection is active", async () => {
    localStorage.setItem(MEETING_AUTO_START_STORAGE_KEY, "false");
    detectorStatus = zoom;
    const root = await mountApp();
    expect(invokeCalls("meeting_start")).toHaveLength(0);

    root.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!.click();
    const autoStart = root.querySelector<HTMLElement>('[role="group"][aria-label="Automatic meeting detection"]')!;
    autoStart.querySelectorAll<HTMLButtonElement>("button")[0].click();

    await vi.waitFor(() => expect(invokeCalls("meeting_start")).toHaveLength(1));
    expect(localStorage.getItem(MEETING_AUTO_START_STORAGE_KEY)).toBe("true");
  });
});
