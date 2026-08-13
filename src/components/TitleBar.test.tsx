import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";

const windowMocks = vi.hoisted(() => ({
  startDragging: vi.fn(),
  isFullscreen: vi.fn(async () => false),
  isFocused: vi.fn(async () => true),
  onResized: vi.fn(async () => vi.fn()),
  onFocusChanged: vi.fn(async () => vi.fn()),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMocks,
}));

import TitleBar from "./TitleBar";

describe("TitleBar drag regions", () => {
  let root: HTMLDivElement;
  let dispose: () => void;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.append(root);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    windowMocks.startDragging.mockClear();
  });

  afterEach(() => {
    dispose?.();
    root.remove();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("starts moving the native window from an empty titlebar area", () => {
    dispose = render(() => <TitleBar center={<span>무제</span>} />, root);
    const titlebar = root.querySelector(".titlebar")!;

    titlebar.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));

    expect(windowMocks.startDragging).toHaveBeenCalledTimes(1);
  });

  it("keeps titlebar buttons clickable instead of starting a window drag", () => {
    dispose = render(() => (
      <TitleBar right={<button type="button">설정</button>} />
    ), root);
    const button = root.querySelector("button")!;

    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));

    expect(windowMocks.startDragging).not.toHaveBeenCalled();
  });
});
