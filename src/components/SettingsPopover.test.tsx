// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { setLocale } from "../i18n";
import SettingsPopover from "./SettingsPopover";

const localDataProps = {
  localDataRemovalBusy: false,
  localDataRemovalDisabled: false,
  onRemoveLocalMeetingData: vi.fn(),
};

afterEach(() => {
  setLocale("en");
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("SettingsPopover shortcut guide", () => {
  it("reveals the complete shortcut guide on keyboard focus", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => (
      <SettingsPopover
        {...localDataProps}
        theme="light"
        editorFullWidth={false}
        meetingDescription="Local models ready"
        meetingDetectionEnabled={true}
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleEditorFullWidth={vi.fn()}
        onToggleMeetingDetection={vi.fn()}
        microphonePermission="authorized"
        microphonePermissionBusy={false}
        onManageMicrophonePermission={vi.fn()}
      />
    ), root);

    const help = root.querySelector<HTMLButtonElement>(".settings-help-button")!;
    expect(help.getAttribute("aria-label")).toBe("Show keyboard shortcuts");
    expect(root.querySelector("#settings-shortcut-guide")).toBeNull();

    help.focus();

    const guide = root.querySelector<HTMLElement>("#settings-shortcut-guide")!;
    expect(guide).not.toBeNull();
    expect(guide.getAttribute("role")).toBe("tooltip");
    expect(guide.textContent).toContain("Save document");
    expect(guide.textContent).toContain("Start or stop meeting notes");
    expect(guide.querySelectorAll("kbd").length).toBeGreaterThan(20);
    dispose();
  });

  it("uses localized labels without changing the keycaps", () => {
    setLocale("ko");
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => (
      <SettingsPopover
        {...localDataProps}
        theme="dark"
        editorFullWidth={false}
        meetingDescription="로컬 모델 준비됨"
        meetingDetectionEnabled={false}
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleEditorFullWidth={vi.fn()}
        onToggleMeetingDetection={vi.fn()}
        microphonePermission="authorized"
        microphonePermissionBusy={false}
        onManageMicrophonePermission={vi.fn()}
      />
    ), root);

    root.querySelector<HTMLButtonElement>(".settings-help-button")!.focus();
    const guide = root.querySelector<HTMLElement>("#settings-shortcut-guide")!;
    expect(guide.textContent).toContain("키보드 단축키");
    expect(guide.textContent).toContain("다른 이름으로 저장");
    expect(Array.from(guide.querySelectorAll("kbd")).map((key) => key.textContent)).toContain("⌘");
    dispose();
  });

  it("exposes meeting detection as an explicit on/off control", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onToggleMeetingDetection = vi.fn();
    const dispose = render(() => (
      <SettingsPopover
        {...localDataProps}
        theme="light"
        editorFullWidth={false}
        meetingDescription="Local models ready"
        meetingDetectionEnabled={true}
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleEditorFullWidth={vi.fn()}
        onToggleMeetingDetection={onToggleMeetingDetection}
        microphonePermission="authorized"
        microphonePermissionBusy={false}
        onManageMicrophonePermission={vi.fn()}
      />
    ), root);

    const group = root.querySelector<HTMLElement>('[role="group"][aria-label="Meeting detection"]')!;
    const [on, off] = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(off.getAttribute("aria-pressed")).toBe("false");
    off.click();
    expect(onToggleMeetingDetection).toHaveBeenCalledOnce();
    dispose();
  });

  it("switches between focused and full editor width", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onToggleEditorFullWidth = vi.fn();
    const dispose = render(() => (
      <SettingsPopover
        {...localDataProps}
        theme="light"
        editorFullWidth={false}
        meetingDescription="Local models ready"
        meetingDetectionEnabled={true}
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleEditorFullWidth={onToggleEditorFullWidth}
        onToggleMeetingDetection={vi.fn()}
        microphonePermission="authorized"
        microphonePermissionBusy={false}
        onManageMicrophonePermission={vi.fn()}
      />
    ), root);

    const group = root.querySelector<HTMLElement>('[role="group"][aria-label="Editor width"]')!;
    const [focused, full] = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
    expect(focused.getAttribute("aria-pressed")).toBe("true");
    expect(full.getAttribute("aria-pressed")).toBe("false");
    full.click();
    expect(onToggleEditorFullWidth).toHaveBeenCalledOnce();
    dispose();
  });

  it("requires a second explicit click before deleting models and recovery audio", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onRemoveLocalMeetingData = vi.fn();
    const dispose = render(() => (
      <SettingsPopover
        {...localDataProps}
        onRemoveLocalMeetingData={onRemoveLocalMeetingData}
        theme="light"
        editorFullWidth={false}
        meetingDescription="Local models ready"
        meetingDetectionEnabled={true}
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleEditorFullWidth={vi.fn()}
        onToggleMeetingDetection={vi.fn()}
        microphonePermission="authorized"
        microphonePermissionBusy={false}
        onManageMicrophonePermission={vi.fn()}
      />
    ), root);

    const button = root.querySelector<HTMLButtonElement>(".settings-link-danger")!;
    button.click();
    expect(onRemoveLocalMeetingData).not.toHaveBeenCalled();
    expect(button.textContent).toContain("Remove models & audio");

    button.click();
    expect(onRemoveLocalMeetingData).toHaveBeenCalledOnce();
    dispose();
  });
});
