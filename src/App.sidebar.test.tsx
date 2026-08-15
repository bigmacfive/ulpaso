// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import App from "./App";

vi.mock("./editor/KukuEditor", () => ({
  default: () => <div data-testid="editor" />,
}));

let dispose: (() => void) | undefined;

function pressShortcut(key: string, options: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe("App sidebar commands", () => {
  it("opens and closes the sidebar from the command palette", () => {
    const root = document.createElement("div");
    document.body.append(root);
    dispose = render(() => <App />, root);

    pressShortcut("k", { metaKey: true });
    const openSidebarCommand = [...root.querySelectorAll<HTMLButtonElement>(".command-results button")]
      .find((button) => button.textContent?.includes("Open sidebar"));
    expect(openSidebarCommand).toBeDefined();

    openSidebarCommand!.click();

    const shell = root.querySelector("main")!;
    expect(shell.classList.contains("sidebar-open")).toBe(true);
    expect(root.querySelector("aside.sidebar")?.classList.contains("closed")).toBe(false);

    pressShortcut("k", { metaKey: true });
    const closeSidebarCommand = [...root.querySelectorAll<HTMLButtonElement>(".command-results button")]
      .find((button) => button.textContent?.includes("Close sidebar"));
    expect(closeSidebarCommand).toBeDefined();

    closeSidebarCommand!.click();
    expect(shell.classList.contains("sidebar-open")).toBe(false);
    expect(root.querySelector("aside.sidebar")?.classList.contains("closed")).toBe(true);
  });
});
