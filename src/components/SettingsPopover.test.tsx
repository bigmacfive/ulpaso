// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { setLocale } from "../i18n";
import SettingsPopover from "./SettingsPopover";

afterEach(() => {
  setLocale("en");
  document.body.replaceChildren();
});

describe("SettingsPopover shortcut guide", () => {
  it("reveals the complete shortcut guide on keyboard focus", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => (
      <SettingsPopover
        theme="light"
        meetingDescription="Local models ready"
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onOpenAudioSettings={vi.fn()}
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
        theme="dark"
        meetingDescription="로컬 모델 준비됨"
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onOpenAudioSettings={vi.fn()}
      />
    ), root);

    root.querySelector<HTMLButtonElement>(".settings-help-button")!.focus();
    const guide = root.querySelector<HTMLElement>("#settings-shortcut-guide")!;
    expect(guide.textContent).toContain("키보드 단축키");
    expect(guide.textContent).toContain("다른 이름으로 저장");
    expect(Array.from(guide.querySelectorAll("kbd")).map((key) => key.textContent)).toContain("⌘");
    dispose();
  });
});
