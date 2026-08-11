import { getCurrentWindow } from "@tauri-apps/api/window";
import { type JSX, Show, createSignal, onCleanup, onMount } from "solid-js";

const DRAG = {
  "-webkit-app-region": "drag",
  "app-region": "drag",
} as Record<string, string>;

const NO_DRAG = {
  "-webkit-app-region": "no-drag",
  "app-region": "no-drag",
} as Record<string, string>;

interface TitleBarProps {
  left?: JSX.Element;
  center?: JSX.Element;
  right?: JSX.Element;
  class?: string;
}

export default function TitleBar(props: TitleBarProps) {
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(true);
  let unlistenResize: (() => void) | undefined;
  let unlistenFocus: (() => void) | undefined;

  onMount(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const appWindow = getCurrentWindow();
    void appWindow.isFullscreen().then(setIsFullscreen);
    void appWindow.isFocused().then(setIsFocused);
    void appWindow.onResized(() => {
      window.setTimeout(() => {
        void appWindow.isFullscreen().then(setIsFullscreen);
      }, 50);
    }).then((unlisten) => {
      unlistenResize = unlisten;
    });
    void appWindow.onFocusChanged(({ payload }) => {
      setIsFocused(payload);
    }).then((unlisten) => {
      unlistenFocus = unlisten;
    });
  });

  onCleanup(() => {
    unlistenResize?.();
    unlistenFocus?.();
  });

  function handleTitleBarPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !("__TAURI_INTERNALS__" in window)) return;
    const target = event.target;
    if (target instanceof Element && target.closest("[data-titlebar-no-drag]")) return;
    void getCurrentWindow().startDragging();
  }

  return (
    <header
      class={`titlebar ${isFocused() ? "window-active" : "window-inactive"} ${props.class ?? ""}`}
      style={DRAG}
      data-tauri-drag-region
      onPointerDown={handleTitleBarPointerDown}
    >
      <Show when={!isFullscreen()}>
        <div class="titlebar-traffic-spacer" style={NO_DRAG} data-titlebar-no-drag />
      </Show>

      <div class="titlebar-left" style={NO_DRAG} data-titlebar-no-drag>
        {props.left}
      </div>

      <div class="titlebar-flex-spacer" />

      <div class="titlebar-center" data-tauri-drag-region>
        <div class="titlebar-center-content" data-tauri-drag-region>{props.center}</div>
      </div>

      <div class="titlebar-actions" style={NO_DRAG} data-titlebar-no-drag>
        {props.right}
      </div>
    </header>
  );
}
