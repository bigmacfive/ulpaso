// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { setLocale } from "../i18n";
import UpdateNotice from "./UpdateNotice";

afterEach(() => {
  setLocale("en");
  document.body.replaceChildren();
});

describe("UpdateNotice", () => {
  it("offers a localized, non-blocking update action", () => {
    setLocale("ko");
    const root = document.createElement("div");
    document.body.append(root);
    const install = vi.fn();
    const dismiss = vi.fn();
    const dispose = render(() => (
      <UpdateNotice version="0.3.0" phase="available" progress={null} onInstall={install} onDismiss={dismiss} />
    ), root);

    expect(root.textContent).toContain("Ulpaso 0.3.0 업데이트");
    root.querySelector<HTMLButtonElement>(".update-install")!.click();
    root.querySelector<HTMLButtonElement>(".update-later")!.click();
    expect(install).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledOnce();
    dispose();
  });

  it("shows determinate progress and prevents dismissal while installing", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = render(() => (
      <UpdateNotice version="0.3.0" phase="installing" progress={0.42} onInstall={() => undefined} onDismiss={() => undefined} />
    ), root);

    expect(root.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("42");
    expect(root.querySelector<HTMLButtonElement>(".update-later")?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>(".update-install")?.disabled).toBe(true);
    dispose();
  });
});
