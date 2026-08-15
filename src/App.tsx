import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import DocumentSaveState from "./components/DocumentSaveState";
import CommandPalette from "./components/CommandPalette";
import DocumentConfirmationDialog, { type PendingDocumentAction } from "./components/DocumentConfirmationDialog";
import MeetingSetupDialog from "./components/MeetingSetupDialog";
import MeetingDetectionDialog from "./components/MeetingDetectionDialog";
import SettingsPopover from "./components/SettingsPopover";
import UpdateNotice, { type UpdateNoticePhase } from "./components/UpdateNotice";
import { locale, t } from "./i18n";
import { Icon } from "./icons";
import KukuEditor, { type KukuEditorHandle } from "./editor/KukuEditor";
import {
  MeetingEditorBridge,
  type MeetingEditorTranscript,
} from "./meeting/MeetingEditorBridge";
import { meetingErrorDescription } from "./meeting/meeting_ui";
import {
  clearRecoveryDraft,
  documentTitle,
  loadRecentDocuments,
  loadRecoveryDraft,
  persistRecoveryDraft,
  readableError,
  updateRecentDocuments,
  type RecentDocument,
} from "./document/storage";
import {
  formatBytes,
  hasMeetingResourceConsent,
  saveMeetingResourceConsent,
  type MeetingResourceStatus,
} from "./meeting/resources";
import {
  LEGACY_MEETING_AUTO_START_STORAGE_KEY,
  MEETING_DETECTION_STORAGE_KEY,
  MeetingDetectionPromptCoordinator,
  readMeetingDetectionPreference,
  type MeetingCaptureTarget,
  type MeetingDetectionSnapshot,
} from "./meeting/detection_prompt";
import { EDITOR_FULL_WIDTH_STORAGE_KEY, readEditorFullWidthPreference } from "./editor_width";
import { appShortcutAction, shortcutHint, type AppShortcutAction } from "./shortcuts";
import { applyAppTheme, readStoredTheme } from "./theme";

type FileDocument = { path: string | null; content: string };
type OutlineItem = { id: string; text: string; level: number };
type MeetingPhase = "idle" | "preparing" | "downloading" | "permission" | "recording" | "finalizing" | "error";
type MeetingState = {
  phase: MeetingPhase;
  sessionId: string | null;
  progress: number | null;
  message: string | null;
  startedAtMs: number | null;
  errorCode: string | null;
  microphoneOnly: boolean;
  systemOnly: boolean;
};
type MeetingTranscript = MeetingEditorTranscript;
type ToastTone = "success" | "error" | "info";
type ToastState = { message: string; tone: ToastTone };
type PendingMeetingStart = {
  microphoneOnly: boolean;
  systemOnly: boolean;
  captureBundleId?: string;
  captureWindowId?: number;
};
type AppUpdate = { version: string };
type UpdateProgress = { downloaded: number; total: number | null };
type MicrophonePermission = "not-determined" | "authorized" | "denied" | "restricted" | "unavailable";

const IDLE_MEETING: MeetingState = {
  phase: "idle", sessionId: null, progress: null, message: null,
  startedAtMs: null, errorCode: null, microphoneOnly: false,
  systemOnly: false,
};

const WELCOME = "";
const DEFAULT_MEETING_RESOURCES: MeetingResourceStatus = {
  ready: false,
  runtimeReady: false,
  transcriptionModelReady: false,
  speakerModelReady: false,
  estimatedDownloadBytes: 1_760_000_000,
  estimatedInstalledBytes: 1_760_000_000,
  availableDiskBytes: null,
  diskSpaceSufficient: true,
};

const commandDefinitions = [
  { icon: "filePlus", labelKey: "command.new" as const, hint: shortcutHint("new"), action: "new" },
  { icon: "folderOpen", labelKey: "command.open" as const, hint: shortcutHint("open"), action: "open" },
  { icon: "save", labelKey: "command.save" as const, hint: shortcutHint("save"), action: "save" },
  { icon: "save", labelKey: "command.saveAs" as const, hint: shortcutHint("saveAs"), action: "saveAs" },
  { icon: "settings", labelKey: "shortcut.settings" as const, hint: shortcutHint("settings"), action: "settings" },
  { icon: "sidebar", labelKey: "shortcut.sidebar" as const, hint: shortcutHint("sidebar"), action: "sidebar" },
  { icon: "mic", labelKey: "shortcut.meeting" as const, hint: shortcutHint("meeting"), action: "meeting" },
  { icon: "moon", labelKey: "command.theme" as const, hint: "", action: "theme" },
];

function Button(props: { icon?: string; title: string; active?: boolean; class?: string; onClick: () => void; children?: unknown }) {
  return <button
    type="button"
    class={`icon-button ${props.active ? "active" : ""} ${props.class ?? ""}`}
    title={props.title}
    aria-label={props.title}
    aria-pressed={props.active || undefined}
    onClick={props.onClick}
  >
    <Show when={props.icon}><Icon name={props.icon!} size={16} /></Show>{props.children as never}
  </button>;
}

export default function App() {
  const recoveredDraft = loadRecoveryDraft();
  let editorHandle: KukuEditorHandle | null = null;
  let currentMarkdown = recoveredDraft?.content ?? WELCOME;
  let saveTimer: number | undefined;
  let toastTimer: number | undefined;
  let meetingTimer: number | undefined;
  let allowWindowClose = false;
  let unlistenMeetingState: UnlistenFn | undefined;
  let unlistenMeetingTranscript: UnlistenFn | undefined;
  let unlistenMeetingDetection: UnlistenFn | undefined;
  let unlistenUpdateProgress: UnlistenFn | undefined;
  let unlistenCloseRequested: UnlistenFn | undefined;
  let meetingErrorPopoverRef: HTMLDivElement | undefined;
  let meetingStateInitialized = false;
  let pendingMeetingDetection: MeetingDetectionSnapshot | null = null;
  const [filePath, setFilePath] = createSignal<string | null>(recoveredDraft?.path ?? null);
  const [title, setTitle] = createSignal(documentTitle(currentMarkdown, recoveredDraft?.path ?? null, t("document.untitled")));
  const [dirty, setDirty] = createSignal(Boolean(recoveredDraft));
  const [saving, setSaving] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [theme, setTheme] = createSignal<"light" | "dark">(readStoredTheme(localStorage.getItem("ulpaso-theme")));
  const [sideTab, setSideTab] = createSignal<"files" | "outline">("files");
  const [outline, setOutline] = createSignal<OutlineItem[]>([]);
  const [recent, setRecent] = createSignal<RecentDocument[]>(loadRecentDocuments());
  const [toast, setToast] = createSignal<ToastState | null>(null);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [paletteQuery, setPaletteQuery] = createSignal("");
  const [paletteIndex, setPaletteIndex] = createSignal(0);
  const [zen, setZen] = createSignal(false);
  const [meeting, setMeeting] = createSignal<MeetingState>(IDLE_MEETING);
  const [meetingNow, setMeetingNow] = createSignal(Date.now());
  const [meetingErrorOpen, setMeetingErrorOpen] = createSignal(false);
  const [meetingResources, setMeetingResources] = createSignal<MeetingResourceStatus | null>(null);
  const [pendingMeetingStart, setPendingMeetingStart] = createSignal<PendingMeetingStart | null>(null);
  const [meetingDetectionEnabled, setMeetingDetectionEnabled] = createSignal(
    readMeetingDetectionPreference(
      localStorage.getItem(MEETING_DETECTION_STORAGE_KEY),
      localStorage.getItem(LEGACY_MEETING_AUTO_START_STORAGE_KEY),
    ),
  );
  const [editorFullWidth, setEditorFullWidth] = createSignal(
    readEditorFullWidthPreference(localStorage.getItem(EDITOR_FULL_WIDTH_STORAGE_KEY)),
  );
  const [detectedMeeting, setDetectedMeeting] = createSignal<MeetingDetectionSnapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [microphonePermission, setMicrophonePermission] = createSignal<MicrophonePermission>("unavailable");
  const [microphonePermissionBusy, setMicrophonePermissionBusy] = createSignal(false);
  const [pendingDocumentAction, setPendingDocumentAction] = createSignal<PendingDocumentAction | null>(null);
  const [appUpdate, setAppUpdate] = createSignal<AppUpdate | null>(null);
  const [updatePhase, setUpdatePhase] = createSignal<UpdateNoticePhase>("available");
  const [updateProgress, setUpdateProgress] = createSignal<number | null>(null);
  const isNative = "__TAURI_INTERNALS__" in window;
  const meetingEditorBridge = new MeetingEditorBridge(meetingTitle);
  const meetingDetectionPrompt = new MeetingDetectionPromptCoordinator();

  const sidebarVisible = createMemo(() => sidebarOpen() && !zen());
  const commands = createMemo(() => commandDefinitions.map((item) => ({
    ...item,
    label: item.action === "sidebar"
      ? t(sidebarVisible() ? "sidebar.close" : "sidebar.open")
      : t(item.labelKey),
  })));
  const filteredCommands = createMemo(() => {
    const q = paletteQuery().trim().toLowerCase();
    return q ? commands().filter((item) => item.label.toLowerCase().includes(q)) : commands();
  });

  createEffect(() => {
    locale();
    if (editorHandle) refreshDocumentMeta();
  });

  createEffect(() => {
    if (!meetingErrorOpen()) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || meetingErrorPopoverRef?.contains(target)) return;
      if (target instanceof Element && target.closest(".meeting-status-pill")) return;
      setMeetingErrorOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", handleOutsidePointerDown));
  });

  createEffect(() => {
    if (!settingsOpen() || !isNative) return;
    void refreshMicrophonePermission();
    const timer = window.setInterval(() => void refreshMicrophonePermission(), 1000);
    onCleanup(() => window.clearInterval(timer));
  });

  onMount(() => {
    void applyAppTheme(theme());
    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("beforeunload", handleBeforeUnload);
    meetingTimer = window.setInterval(() => setMeetingNow(Date.now()), 1000);
    if (recoveredDraft) showToast(t("document.restored"), "info", 3200);
    if (isNative) {
      void getCurrentWindow().onCloseRequested((event) => {
        if (allowWindowClose || !dirty() || !currentMarkdown.trim()) return;
        event.preventDefault();
        persistRecoveryDraft(currentMarkdown, filePath());
        setPendingDocumentAction({ kind: "close" });
      }).then((unlisten) => {
        unlistenCloseRequested = unlisten;
      });
      void invoke<MeetingState>("meeting_status").then(handleMeetingState).catch(() => {
        meetingStateInitialized = true;
        flushPendingMeetingDetection();
      });
      void refreshMeetingResources();
      void refreshMicrophonePermission().then((status) => {
        if (status !== "not-determined") return;
        void requestMicrophonePermission().catch(() => {
          // The Settings control remains available if macOS cannot present the
          // first-launch consent sheet yet (for example while the app is not active).
        });
      });
      void listen<MeetingState>("meeting://state", (event) => handleMeetingState(event.payload)).then((unlisten) => {
        unlistenMeetingState = unlisten;
      });
      void listen<MeetingTranscript>("meeting://transcript", (event) => handleMeetingTranscript(event.payload)).then((unlisten) => {
        unlistenMeetingTranscript = unlisten;
      });
      void listen<MeetingDetectionSnapshot>("meeting://detection", (event) => {
        void handleMeetingDetection(event.payload);
      }).then((unlisten) => {
        unlistenMeetingDetection = unlisten;
      });
      void listen<UpdateProgress>("update://progress", (event) => {
        const { downloaded, total } = event.payload;
        setUpdateProgress(total && total > 0 ? Math.min(1, downloaded / total) : null);
      }).then((unlisten) => {
        unlistenUpdateProgress = unlisten;
      });
      void invoke<AppUpdate | null>("update_check")
        .then((update) => {
          if (update?.version) setAppUpdate(update);
        })
        .catch(() => undefined);
      void invoke<MeetingDetectionSnapshot>("meeting_detection_status")
        .then((snapshot) => void handleMeetingDetection(snapshot))
        .catch(() => undefined);
    }
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleShortcut);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.clearTimeout(saveTimer);
    window.clearTimeout(toastTimer);
    window.clearInterval(meetingTimer);
    unlistenMeetingState?.();
    unlistenMeetingTranscript?.();
    unlistenMeetingDetection?.();
    unlistenUpdateProgress?.();
    unlistenCloseRequested?.();
  });

  function isMeetingBusy() {
    return !["idle", "error"].includes(meeting().phase);
  }

  async function installAppUpdate() {
    if (!appUpdate() || updatePhase() === "installing") return;
    setUpdatePhase("installing");
    setUpdateProgress(null);
    try {
      await invoke("update_install");
    } catch {
      setUpdatePhase("error");
      setUpdateProgress(null);
    }
  }

  function meetingTitle() {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return t("meeting.title", { date });
  }

  function handleMeetingState(next: MeetingState) {
    setMeeting(next);
    meetingStateInitialized = true;
    meetingEditorBridge.updateState(next);
    if (next.phase === "error") {
      setMeetingErrorOpen(true);
    } else if (next.phase !== "idle") {
      setMeetingErrorOpen(false);
      setDetectedMeeting(null);
    }
    if (next.phase === "recording" && !meetingResources()?.ready) void refreshMeetingResources();
    flushPendingMeetingDetection();
  }

  function flushPendingMeetingDetection() {
    if (!meetingStateInitialized || !pendingMeetingDetection) return;
    const snapshot = pendingMeetingDetection;
    pendingMeetingDetection = null;
    void handleMeetingDetection(snapshot);
  }

  async function handleMeetingDetection(snapshot: MeetingDetectionSnapshot) {
    if (!meetingStateInitialized) {
      pendingMeetingDetection = snapshot;
      return;
    }
    const action = meetingDetectionPrompt.observe(snapshot, {
      enabled: meetingDetectionEnabled(),
      busy: isMeetingBusy(),
    });
    if (action !== "prompt") return;

    // Render the decision before asking macOS for focus. Focus can be denied
    // by a system-owned dialog; the prompt must still be waiting when the user
    // returns to Ulpaso.
    setDetectedMeeting(snapshot);
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.show();
      await currentWindow.setFocus();
    } catch { /* Keep the rendered prompt available for the next app focus. */ }
  }

  function toggleMeetingDetection() {
    const next = !meetingDetectionEnabled();
    setMeetingDetectionEnabled(next);
    localStorage.setItem(MEETING_DETECTION_STORAGE_KEY, String(next));
    if (!next) setDetectedMeeting(null);
    if (next && isNative) {
      void invoke<MeetingDetectionSnapshot>("meeting_detection_status")
        .then((snapshot) => void handleMeetingDetection(snapshot))
        .catch(() => undefined);
    }
  }

  function toggleEditorFullWidth() {
    const next = !editorFullWidth();
    setEditorFullWidth(next);
    localStorage.setItem(EDITOR_FULL_WIDTH_STORAGE_KEY, String(next));
  }

  function confirmDetectedMeeting() {
    const snapshot = detectedMeeting();
    if (!snapshot) return;
    setDetectedMeeting(null);
    void toggleMeeting(
      false,
      false,
      false,
      snapshot.bundleId ?? undefined,
      snapshot.windowId ?? undefined,
    );
  }

  function handleMeetingTranscript(payload: MeetingTranscript) {
    const applied = meetingEditorBridge.pushTranscript(payload);
    if (payload.kind === "final") {
      if (applied) notifyMeetingFinal(payload);
      return;
    }
  }

  function notifyMeetingFinal(payload: MeetingTranscript) {
    showToast(payload.speakerLimitWarning
      ? t("meeting.speakerWarning")
      : t("meeting.finalized"));
  }

  async function refreshMeetingResources(): Promise<MeetingResourceStatus | null> {
    if (!isNative) return null;
    try {
      const status = await invoke<MeetingResourceStatus>("meeting_resources");
      setMeetingResources(status);
      return status;
    } catch {
      return null;
    }
  }

  async function refreshMicrophonePermission(): Promise<MicrophonePermission> {
    if (!isNative) return "unavailable";
    try {
      const status = await invoke<MicrophonePermission>("meeting_microphone_permission_status");
      setMicrophonePermission(status);
      return status;
    } catch {
      setMicrophonePermission("unavailable");
      return "unavailable";
    }
  }

  async function requestMicrophonePermission(): Promise<MicrophonePermission> {
    setMicrophonePermissionBusy(true);
    try {
      const status = await invoke<MicrophonePermission>("meeting_request_microphone_permission");
      setMicrophonePermission(status);
      return status;
    } finally {
      setMicrophonePermissionBusy(false);
    }
  }

  async function openMicrophoneSettings() {
    try { await invoke("meeting_open_microphone_settings"); }
    catch (error) { showToast(readableError(error, t("meeting.settingsFailed")), "error", 4200); }
  }

  async function manageMicrophonePermission() {
    if (microphonePermission() === "not-determined") {
      try { await requestMicrophonePermission(); }
      catch (error) { showToast(readableError(error, t("meeting.settingsFailed")), "error", 4200); }
      return;
    }
    await openMicrophoneSettings();
  }

  async function ensureMicrophonePermission(systemOnly: boolean): Promise<boolean> {
    if (systemOnly) return true;
    let status = await refreshMicrophonePermission();
    if (status === "not-determined") status = await requestMicrophonePermission();
    if (status === "authorized") return true;
    showToast(t("settings.microphoneDenied"), "error", 4200);
    if (status === "denied" || status === "restricted") await openMicrophoneSettings();
    return false;
  }

  async function toggleMeeting(
    microphoneOnly = false,
    systemOnly = false,
    disclosed = false,
    captureBundleId?: string,
    captureWindowId?: number,
  ) {
    if (!isNative) { showToast(t("meeting.desktopOnly"), "info"); return; }
    try {
      if (["recording", "permission"].includes(meeting().phase)) {
        await invoke("meeting_stop");
        return;
      }
      if (["preparing", "downloading"].includes(meeting().phase)) {
        await invoke("meeting_cancel");
        return;
      }
      if (meeting().phase === "finalizing") {
        showToast(t("meeting.finishing"), "info");
        return;
      }
      if (meeting().phase === "error") await invoke("meeting_cancel");
      if (!await ensureMicrophonePermission(systemOnly)) return;
      if (!disclosed) {
        const status = meetingResources() ?? await refreshMeetingResources();
        if (!status?.ready && (!status?.diskSpaceSufficient || !hasMeetingResourceConsent())) {
          setPendingMeetingStart({
            microphoneOnly,
            systemOnly,
            captureBundleId,
            captureWindowId,
          });
          return;
        }
      }
      setMeetingErrorOpen(false);
      // A display hint has no meaning in microphone-only mode. Clear even an
      // inherited hint so retries can never accidentally couple mic capture to
      // a meeting window.
      let resolvedCaptureBundleId = microphoneOnly ? undefined : captureBundleId;
      let resolvedCaptureWindowId = microphoneOnly ? undefined : captureWindowId;
      if (!microphoneOnly && !resolvedCaptureBundleId) {
        try {
          const target = await invoke<MeetingCaptureTarget | null>("meeting_detection_capture_target");
          resolvedCaptureBundleId = target?.bundleId || undefined;
          resolvedCaptureWindowId = target?.windowId || undefined;
        } catch {
          // Detection is an optional targeting hint. Preserve ordinary system
          // capture when the detector is unavailable or no meeting is live.
        }
      }
      if (!resolvedCaptureBundleId) resolvedCaptureWindowId = undefined;
      await invoke("meeting_start", {
        microphoneOnly,
        systemOnly,
        captureBundleId: resolvedCaptureBundleId,
        captureWindowId: resolvedCaptureWindowId,
      });
    } catch (error) {
      showToast(readableError(error, t("meeting.startFailed")), "error", 4200);
    }
  }

  function confirmMeetingSetup() {
    const start = pendingMeetingStart();
    if (!start) return;
    saveMeetingResourceConsent();
    setPendingMeetingStart(null);
    void toggleMeeting(
      start.microphoneOnly,
      start.systemOnly,
      true,
      start.captureBundleId,
      start.captureWindowId,
    );
  }

  function meetingResourceDescription() {
    const status = meetingResources();
    if (status?.ready) return t("settings.meetingReady");
    const bytes = status?.estimatedDownloadBytes ?? DEFAULT_MEETING_RESOURCES.estimatedDownloadBytes;
    return t("settings.meetingDownload", { size: formatBytes(bytes) });
  }

  async function retryMeeting(microphoneOnly = false, systemOnly = false) {
    try { await invoke("meeting_cancel"); } catch { /* already reset */ }
    setMeetingErrorOpen(false);
    await toggleMeeting(microphoneOnly, systemOnly);
  }

  async function openMeetingSettings() {
    try { await invoke("meeting_open_settings", { errorCode: meeting().errorCode }); }
    catch (error) { showToast(readableError(error, t("meeting.settingsFailed")), "error", 4200); }
  }

  function meetingStatusLabel() {
    const state = meeting();
    if (state.phase === "recording") {
      const elapsed = Math.max(0, meetingNow() - (state.startedAtMs ?? meetingNow()));
      const minutes = Math.floor(elapsed / 60_000).toString().padStart(2, "0");
      const seconds = Math.floor((elapsed % 60_000) / 1000).toString().padStart(2, "0");
      return t("meeting.transcribing", { time: `${minutes}:${seconds}` });
    }
    if (state.phase === "downloading") return state.progress == null
      ? t("meeting.preparingModel")
      : t("meeting.modelProgress", { progress: Math.round(state.progress * 100) });
    if (state.phase === "permission") return t("meeting.permissions");
    if (state.phase === "finalizing") return state.progress == null
      ? t("meeting.organizing")
      : t("meeting.organizingProgress", { progress: Math.round(state.progress * 100) });
    if (state.phase === "error") return t("meeting.attention");
    return t("meeting.preparingEngine");
  }

  function meetingActionLabel() {
    if (["recording", "permission"].includes(meeting().phase)) return t("meeting.stop");
    if (["preparing", "downloading"].includes(meeting().phase)) return t("meeting.cancel");
    if (meeting().phase === "finalizing") return t("meeting.organizingNotes");
    return t("meeting.start");
  }

  function addRecent(path: string, documentTitle: string) {
    setRecent(updateRecentDocuments(recent(), path, documentTitle));
  }

  function showToast(message: string, tone: ToastTone = "success", duration = 2400) {
    window.clearTimeout(toastTimer);
    setToast({ message, tone });
    toastTimer = window.setTimeout(() => setToast(null), duration);
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirty() || !currentMarkdown.trim()) return;
    persistRecoveryDraft(currentMarkdown, filePath());
    event.preventDefault();
    event.returnValue = "";
  }

  function refreshDocumentMeta(root = editorHandle?.getElement()) {
    if (!root) return;
    const heading = root.querySelector("h1");
    setTitle(heading?.textContent?.trim() || filePath()?.split("/").pop()?.replace(/\.md$/i, "") || t("document.untitled"));
    const nextOutline = Array.from(root.querySelectorAll("h1, h2, h3, h4")).map((node, index) => {
      const id = `heading-${index}`;
      node.id = id;
      return { id, text: node.textContent?.trim() || t("document.untitledSection"), level: Number(node.tagName[1]) };
    });
    setOutline(nextOutline);
  }

  function handleEditorChange(markdown: string, root: HTMLElement) {
    currentMarkdown = markdown;
    setDirty(true);
    persistRecoveryDraft(markdown, filePath());
    refreshDocumentMeta(root);
    window.clearTimeout(saveTimer);
    if (filePath()) saveTimer = window.setTimeout(() => void save(false, true), 850);
  }

  function runEditorCommand(command: string, attrs?: unknown) {
    editorHandle?.command(command, attrs);
  }

  function insertLink() {
    const url = window.prompt(t("editor.linkPrompt"), "https://");
    if (url) runEditorCommand("toggleLink", { href: url });
  }

  function shouldConfirmDocumentChange() {
    return dirty() && Boolean(currentMarkdown.trim());
  }

  function requestOpenDocument(path?: string) {
    if (isMeetingBusy()) { showToast(t("meeting.finishBeforeOpen"), "info"); return; }
    if (shouldConfirmDocumentChange()) {
      setPendingDocumentAction({ kind: "open", path });
      return;
    }
    void openDocument(path);
  }

  function requestNewDocument() {
    if (isMeetingBusy()) { showToast(t("meeting.finishBeforeNew"), "info"); return; }
    if (shouldConfirmDocumentChange()) {
      setPendingDocumentAction({ kind: "new" });
      return;
    }
    newDocument();
  }

  async function openDocument(path?: string) {
    if (!isNative) { showToast(t("document.openDesktopOnly"), "info"); return; }
    try {
      const doc = await invoke<FileDocument>(path ? "open_path" : "open_document", path ? { path } : {});
      if (!doc?.content && !doc?.path) return;
      window.clearTimeout(saveTimer);
      setFilePath(doc.path);
      currentMarkdown = doc.content;
      editorHandle?.setMarkdown(doc.content);
      setDirty(false);
      clearRecoveryDraft();
      const nextTitle = documentTitle(doc.content, doc.path, t("document.untitled"));
      setTitle(nextTitle);
      requestAnimationFrame(() => refreshDocumentMeta());
      if (doc.path) addRecent(doc.path, nextTitle);
      showToast(t("document.opened"));
    } catch (error) { showToast(readableError(error, t("document.openFailed")), "error", 4200); }
  }

  function newDocument() {
    window.clearTimeout(saveTimer);
    setFilePath(null);
    currentMarkdown = "";
    editorHandle?.setMarkdown(currentMarkdown);
    setDirty(false);
    setTitle(t("document.untitled"));
    setOutline([]);
    clearRecoveryDraft();
    requestAnimationFrame(() => refreshDocumentMeta());
    editorHandle?.focus();
  }

  async function save(saveAs = false, silent = false): Promise<boolean> {
    if (!isNative) { if (!silent) showToast(t("document.saveDesktopOnly"), "info"); return false; }
    if (saving()) return false;
    window.clearTimeout(saveTimer);
    setSaving(true);
    try {
      const path = await invoke<string | null>("save_document", {
        path: filePath(), content: editorHandle?.getMarkdown() ?? currentMarkdown, saveAs,
      });
      if (path) {
        setFilePath(path); setDirty(false); addRecent(path, title());
        clearRecoveryDraft();
        if (!silent) showToast(t("document.saved"));
        return true;
      }
      return false;
    } catch (error) {
      if (!silent) showToast(readableError(error, t("document.saveFailed")), "error", 4200);
      return false;
    }
    finally { setSaving(false); }
  }

  function continuePendingDocumentAction() {
    const action = pendingDocumentAction();
    setPendingDocumentAction(null);
    if (!action) return;
    if (action.kind === "new") newDocument();
    else if (action.kind === "open") void openDocument(action.path);
    else {
      clearRecoveryDraft();
      setDirty(false);
      allowWindowClose = true;
      void getCurrentWindow().close();
    }
  }

  async function saveThenContinue() {
    if (await save(false)) continuePendingDocumentAction();
  }

  function toggleTheme() {
    const next = theme() === "light" ? "dark" : "light";
    setTheme(next); void applyAppTheme(next);
    localStorage.setItem("ulpaso-theme", next);
  }

  function toggleSidebar() {
    if (sidebarVisible()) {
      setSidebarOpen(false);
      return;
    }

    setZen(false);
    setSidebarOpen(true);
  }

  function runAction(action: string) {
    closePalette();
    if (action === "new") requestNewDocument();
    else if (action === "open") requestOpenDocument();
    else if (action === "save") void save(false);
    else if (action === "saveAs") void save(true);
    else if (action === "settings") { setMeetingErrorOpen(false); setSettingsOpen(true); }
    else if (action === "sidebar") toggleSidebar();
    else if (action === "meeting") void toggleMeeting();
    else if (action === "theme") toggleTheme();
  }

  function closePalette() {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
  }

  function openPalette() {
    setSettingsOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
    setPaletteOpen(true);
  }

  function handlePaletteKeyDown(event: KeyboardEvent) {
    const items = filteredCommands();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPaletteIndex((index) => Math.min(index + 1, Math.max(0, items.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPaletteIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const item = items[paletteIndex()];
      if (item) { event.preventDefault(); runAction(item.action); }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
  }

  function runShortcutAction(action: AppShortcutAction) {
    if (action === "new") requestNewDocument();
    else if (action === "open") requestOpenDocument();
    else if (action === "save") void save(false);
    else if (action === "saveAs") void save(true);
    else if (action === "palette") openPalette();
    else if (action === "settings") {
      closePalette();
      setMeetingErrorOpen(false);
      setSettingsOpen((open) => !open);
    } else if (action === "sidebar") toggleSidebar();
    else if (action === "meeting") { setSettingsOpen(false); void toggleMeeting(); }
    else if (action === "dismiss") {
      closePalette();
      setSettingsOpen(false);
      setMeetingErrorOpen(false);
      setZen(false);
      setPendingDocumentAction(null);
      setPendingMeetingStart(null);
      setDetectedMeeting(null);
    }
  }

  function handleShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const action = appShortcutAction(event);
    if (!action) return;
    event.preventDefault();
    runShortcutAction(action);
  }

  return (
    <main
      class="app-shell"
      classList={{
        "zen-mode": zen(),
        "sidebar-open": sidebarVisible(),
        "editor-full-width": editorFullWidth(),
      }}
    >
      <TitleBar
        center={
          <div class="document-title" aria-label={`${title()} · ${saving() ? t("document.saving") : dirty() ? t("document.unsaved") : filePath() ? t("document.saved") : t("document.new")}`}>
            <span>{title()}</span>
            <DocumentSaveState
              saving={saving()}
              dirty={dirty()}
              saved={Boolean(filePath())}
            />
          </div>
        }
        right={<>
          <Show when={meeting().phase !== "idle"}>
            <div
              class="meeting-status-pill"
              classList={{ recording: meeting().phase === "recording", error: meeting().phase === "error" }}
              title={meeting().phase === "error" ? meetingErrorDescription(meeting().errorCode) : meetingStatusLabel()}
              role={meeting().phase === "error" ? "button" : "status"}
              tabIndex={meeting().phase === "error" ? 0 : undefined}
              aria-live="polite"
              onClick={() => meeting().phase === "error" ? setMeetingErrorOpen(!meetingErrorOpen()) : undefined}
              onKeyDown={(event) => {
                if (meeting().phase !== "error" || !["Enter", " "].includes(event.key)) return;
                event.preventDefault();
                setMeetingErrorOpen(!meetingErrorOpen());
              }}
            >
              <i /><span>{meetingStatusLabel()}</span>
              <Show when={["preparing", "downloading", "recording", "permission"].includes(meeting().phase)}>
                <button type="button" class="meeting-stop" aria-label={t("meeting.stopOrCancel")} onClick={(event) => { event.stopPropagation(); void toggleMeeting(); }}>
                  <Icon name="stop" size={12} />
                </button>
              </Show>
              <Show when={meeting().progress != null && meeting().phase !== "recording"}>
                <b style={{ width: `${Math.max(2, (meeting().progress ?? 0) * 100)}%` }} />
              </Show>
            </div>
          </Show>
          <div class="titlebar-button-group" role="group" aria-label={t("sidebar.windowTools")}>
            <Button
              icon={sidebarVisible() ? "sidebarCollapse" : "sidebarExpand"}
              title={`${sidebarVisible() ? t("sidebar.close") : t("sidebar.open")} (⌘ \\)`}
              active={sidebarVisible()}
              onClick={() => { setSettingsOpen(false); setMeetingErrorOpen(false); toggleSidebar(); }}
            />
            <Button
              icon="settings"
              title={t("settings.title")}
              active={settingsOpen()}
              onClick={() => { setMeetingErrorOpen(false); setSettingsOpen(!settingsOpen()); }}
            />
            <Button
              icon="mic"
              class="meeting-trigger"
              title={meetingActionLabel()}
              active={meeting().phase !== "idle"}
              onClick={() => { setSettingsOpen(false); void toggleMeeting(); }}
            />
          </div>
        </>}
      />

      <Show when={appUpdate()}>{(update) =>
        <UpdateNotice
          version={update().version}
          phase={updatePhase()}
          progress={updateProgress()}
          onDismiss={() => setAppUpdate(null)}
          onInstall={() => void installAppUpdate()}
        />
      }</Show>

      <Show when={settingsOpen()}>
        <SettingsPopover
          theme={theme()}
          meetingDescription={meetingResourceDescription()}
          meetingDetectionEnabled={meetingDetectionEnabled()}
          editorFullWidth={editorFullWidth()}
          microphonePermission={microphonePermission()}
          microphonePermissionBusy={microphonePermissionBusy()}
          onClose={() => setSettingsOpen(false)}
          onToggleTheme={toggleTheme}
          onToggleMeetingDetection={toggleMeetingDetection}
          onToggleEditorFullWidth={toggleEditorFullWidth}
          onManageMicrophonePermission={() => void manageMicrophonePermission()}
        />
      </Show>

      <Show when={meetingErrorOpen() && meeting().phase === "error"}>
        <div ref={meetingErrorPopoverRef} class="meeting-error-popover" role="alertdialog" aria-label={t("meeting.errorLabel")}>
          <div><Icon name="mic" size={16} /><strong>{t("meeting.errorTitle")}</strong></div>
          <p>{meetingErrorDescription(meeting().errorCode)}</p>
          <div class="meeting-error-actions">
            <button type="button" onClick={() => { setMeetingErrorOpen(false); void openMeetingSettings(); }}>{t("meeting.openSettings")}</button>
            <button type="button" onClick={() => void retryMeeting(false)}>{t("meeting.tryAgain")}</button>
            <Show when={["microphone_permission", "microphone_unavailable"].includes(meeting().errorCode ?? "")}>
              <button type="button" onClick={() => void retryMeeting(false, true)}>{t("meeting.systemOnly")}</button>
            </Show>
            <Show when={meeting().errorCode === "permission_or_capture"}>
              <button type="button" onClick={() => void retryMeeting(true)}>{t("meeting.microphoneOnly")}</button>
            </Show>
          </div>
        </div>
      </Show>

      <div class="workspace">
        <aside class="sidebar" classList={{ closed: !sidebarVisible() }}>
          <div class="sidebar-header">
            <div class="sidebar-tabs">
              <button type="button" aria-pressed={sideTab() === "files"} classList={{ active: sideTab() === "files" }} onClick={() => setSideTab("files")}>{t("sidebar.files")}</button>
              <button type="button" aria-pressed={sideTab() === "outline"} classList={{ active: sideTab() === "outline" }} onClick={() => setSideTab("outline")}>{t("sidebar.outline")}</button>
            </div>
            <div class="sidebar-actions">
              <button type="button" title={t("command.new")} aria-label={t("command.new")} onClick={requestNewDocument}><Icon name="plus" size={15} /></button>
              <button type="button" title={t("command.open")} aria-label={t("command.open")} onClick={() => requestOpenDocument()}><Icon name="folderOpen" size={15} /></button>
            </div>
          </div>
          <div class="sidebar-content">
            <Show when={sideTab() === "files"} fallback={
              <div class="outline-list">
                <Show when={outline().length} fallback={<p class="empty-state">{t("sidebar.emptyOutlineLine1")}<br />{t("sidebar.emptyOutlineLine2")}</p>}>
                  <For each={outline()}>{(item) =>
                    <button type="button" style={{ "padding-left": `${12 + (item.level - 1) * 14}px` }} onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                      <span>{item.text}</span>
                    </button>}
                  </For>
                </Show>
              </div>
            }>
              <div class="library-heading"><span>{t("sidebar.recent")}</span><button type="button" title={t("command.open")} aria-label={t("command.open")} onClick={() => requestOpenDocument()}><Icon name="folderOpen" size={14} /></button></div>
              <button type="button" class="file-row current" aria-current="page"><Icon name="file" size={15} /><span>{title()}</span><Show when={dirty()}><i aria-label={t("document.unsaved")} /></Show></button>
              <For each={recent().filter((item) => item.path !== filePath())}>{(item) =>
                <button type="button" class="file-row" title={item.path} onClick={() => requestOpenDocument(item.path)}><Icon name="file" size={15} /><span>{item.title}</span></button>}
              </For>
              <Show when={!recent().length}><p class="empty-state small">{t("sidebar.emptyRecent")}</p></Show>
            </Show>
          </div>
        </aside>

        <section class="editor-pane">
          <KukuEditor
            initialMarkdown={currentMarkdown}
            onReady={(handle) => {
              editorHandle = handle;
              for (const completed of meetingEditorBridge.attach(handle)) notifyMeetingFinal(completed);
              requestAnimationFrame(() => refreshDocumentMeta());
            }}
            onChange={handleEditorChange}
            meetingActive={isMeetingBusy()}
            onMeetingCommand={() => void toggleMeeting()}
          />
        </section>
      </div>

      <Show when={paletteOpen()}>
        <CommandPalette
          items={filteredCommands()}
          selectedIndex={paletteIndex()}
          query={paletteQuery()}
          theme={theme()}
          onClose={closePalette}
          onQuery={(value) => { setPaletteQuery(value); setPaletteIndex(0); }}
          onSelectIndex={setPaletteIndex}
          onAction={runAction}
          onKeyDown={handlePaletteKeyDown}
        />
      </Show>

      <Show when={pendingDocumentAction()}>{(action) =>
        <DocumentConfirmationDialog
          action={action()}
          saving={saving()}
          canSave={isNative}
          onCancel={() => setPendingDocumentAction(null)}
          onDiscard={continuePendingDocumentAction}
          onSave={() => void saveThenContinue()}
        />
      }</Show>

      <Show when={pendingMeetingStart()}>
        <MeetingSetupDialog
          resources={meetingResources() ?? DEFAULT_MEETING_RESOURCES}
          onCancel={() => setPendingMeetingStart(null)}
          onConfirm={confirmMeetingSetup}
        />
      </Show>

      <Show when={detectedMeeting()}>{(snapshot) =>
        <MeetingDetectionDialog
          appName={snapshot().appName || t("meeting.detectedApp")}
          onCancel={() => setDetectedMeeting(null)}
          onConfirm={confirmDetectedMeeting}
        />
      }</Show>

      <Show when={toast()}>{(item) => <div class="toast" classList={{ error: item().tone === "error", info: item().tone === "info" }} role={item().tone === "error" ? "alert" : "status"} aria-live="polite">
        <Icon name={item().tone === "error" ? "alert" : item().tone === "info" ? "info" : "check"} size={15} />
        <span>{item().message}</span>
      </div>}</Show>
    </main>
  );
}
