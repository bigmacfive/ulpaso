// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { setLocale } from "../i18n";
import MeetingSetupDialog from "./MeetingSetupDialog";

afterEach(() => {
  setLocale("en");
  document.body.replaceChildren();
});

describe("MeetingSetupDialog", () => {
  it("discloses resource sizes before invoking the confirmation", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const confirm = vi.fn();
    const dispose = render(() => (
      <MeetingSetupDialog
        resources={{
          ready: false,
          runtimeReady: true,
          transcriptionModelReady: false,
          speakerModelReady: false,
          estimatedDownloadBytes: 1_260_000_000,
          estimatedInstalledBytes: 1_760_000_000,
          availableDiskBytes: 20_000_000_000,
          diskSpaceSufficient: true,
        }}
        onCancel={() => undefined}
        onConfirm={confirm}
      />
    ), root);

    expect(root.textContent).toContain("1.3 GB");
    expect(root.textContent).toContain("1.8 GB");
    root.querySelector<HTMLButtonElement>(".button-primary")?.click();
    expect(confirm).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("blocks the download when the backend reports insufficient disk space", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => (
      <MeetingSetupDialog
        resources={{
          ready: false,
          runtimeReady: false,
          transcriptionModelReady: false,
          speakerModelReady: false,
          estimatedDownloadBytes: 1_760_000_000,
          estimatedInstalledBytes: 1_760_000_000,
          availableDiskBytes: 900_000_000,
          diskSpaceSufficient: false,
        }}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    ), root);
    expect(root.textContent).toContain("900 MB");
    expect(root.querySelector<HTMLButtonElement>(".button-primary")?.disabled).toBe(true);
    dispose();
  });
});
