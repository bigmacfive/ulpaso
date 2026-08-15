import { For, Show, createSignal } from "solid-js";
import { Icon } from "../icons";
import { locale, localeLabels, setLocale, t, type Locale, type MessageKey } from "../i18n";
import { SHORTCUT_GROUPS, SHORTCUTS } from "../shortcuts";

interface SettingsPopoverProps {
  theme: "light" | "dark";
  meetingDescription: string;
  meetingDetectionEnabled: boolean;
  editorFullWidth: boolean;
  microphonePermission: "not-determined" | "authorized" | "denied" | "restricted" | "unavailable";
  microphonePermissionBusy: boolean;
  localDataRemovalBusy: boolean;
  localDataRemovalDisabled: boolean;
  onClose(): void;
  onToggleTheme(): void;
  onToggleMeetingDetection(): void;
  onToggleEditorFullWidth(): void;
  onManageMicrophonePermission(): void;
  onRemoveLocalMeetingData(): void;
}

const shortcutGroupColumns = [
  SHORTCUT_GROUPS.filter((group) => group.id === "document" || group.id === "view"),
  SHORTCUT_GROUPS.filter((group) => group.id === "editing" || group.id === "meeting"),
] as const;

const microphoneStatusKeys: Record<SettingsPopoverProps["microphonePermission"], MessageKey> = {
  "not-determined": "settings.microphoneStatus.not-determined",
  authorized: "settings.microphoneStatus.authorized",
  denied: "settings.microphoneStatus.denied",
  restricted: "settings.microphoneStatus.restricted",
  unavailable: "settings.microphoneStatus.unavailable",
};

function ShortcutGuideTrigger() {
  const [shortcutGuideOpen, setShortcutGuideOpen] = createSignal(false);

  return (
    <div
      class="settings-shortcut-anchor"
      onPointerEnter={() => setShortcutGuideOpen(true)}
      onPointerLeave={() => setShortcutGuideOpen(false)}
      onFocusIn={() => setShortcutGuideOpen(true)}
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShortcutGuideOpen(false);
      }}
    >
      <button
        type="button"
        class="settings-help-button"
        aria-label={t("settings.shortcutsHint")}
        aria-expanded={shortcutGuideOpen()}
        aria-controls="settings-shortcut-guide"
        onClick={() => setShortcutGuideOpen(true)}
      >?</button>
      <Show when={shortcutGuideOpen()}>
        <aside id="settings-shortcut-guide" class="settings-shortcut-guide" role="tooltip">
          <header>
            <strong>{t("shortcuts.title")}</strong>
            <span>{t("shortcuts.description")}</span>
          </header>
          <div class="shortcut-guide-grid">
            <For each={shortcutGroupColumns}>{(column) =>
              <div class="shortcut-guide-column">
                <For each={column}>{(group) =>
                  <section class={`shortcut-group shortcut-group-${group.id}`}>
                    <h3>{t(group.labelKey)}</h3>
                    <dl>
                      <For each={SHORTCUTS.filter((shortcut) => shortcut.group === group.id)}>{(shortcut) => <>
                        <dt>{t(shortcut.labelKey)}</dt>
                        <dd aria-label={shortcut.keys.join(" + ")}>
                          <For each={shortcut.keys}>{(key) => <kbd>{key}</kbd>}</For>
                        </dd>
                      </>}</For>
                    </dl>
                  </section>
                }</For>
              </div>
            }</For>
          </div>
        </aside>
      </Show>
    </div>
  );
}

export default function SettingsPopover(props: SettingsPopoverProps) {
  const [localDataRemovalArmed, setLocalDataRemovalArmed] = createSignal(false);
  const microphoneActionLabel = () => {
    if (props.microphonePermissionBusy) return t("settings.microphoneRequesting");
    if (props.microphonePermission === "authorized") return t("settings.microphoneAllowed");
    if (props.microphonePermission === "not-determined") return t("settings.microphoneAllow");
    return t("settings.microphoneOpenSettings");
  };

  return (
    <div class="settings-popover-layer" onMouseDown={props.onClose}>
      <section
        class="settings-popover"
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>{t("settings.title")}</strong>
          <button type="button" class="icon-button" title={t("settings.close")} aria-label={t("settings.close")} onClick={props.onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        <div class="settings-row">
          <div><strong>{t("settings.appearance")}</strong><span>{t("settings.appearanceDescription")}</span></div>
          <div class="settings-segmented" role="group" aria-label={t("settings.colorTheme")}>
            <button type="button" aria-pressed={props.theme === "light"} classList={{ active: props.theme === "light" }} onClick={() => props.theme !== "light" && props.onToggleTheme()}><Icon name="sun" size={12} />{t("settings.light")}</button>
            <button type="button" aria-pressed={props.theme === "dark"} classList={{ active: props.theme === "dark" }} onClick={() => props.theme !== "dark" && props.onToggleTheme()}><Icon name="moon" size={12} />{t("settings.dark")}</button>
          </div>
        </div>
        <div class="settings-row settings-row-language">
          <div><strong>{t("settings.language")}</strong><span>{t("settings.languageDescription")}</span></div>
          <div class="settings-segmented settings-language" role="group" aria-label={t("settings.language")}>
            <For each={["en", "ko", "ja"] as Locale[]}>{(item) =>
              <button type="button" aria-pressed={locale() === item} classList={{ active: locale() === item }} onClick={() => setLocale(item)}>{localeLabels[item]}</button>
            }</For>
          </div>
        </div>
        <div class="settings-row">
          <div><strong>{t("settings.editorWidth")}</strong><span>{t("settings.editorWidthDescription")}</span></div>
          <div class="settings-segmented" role="group" aria-label={t("settings.editorWidth")}>
            <button
              type="button"
              aria-pressed={!props.editorFullWidth}
              classList={{ active: !props.editorFullWidth }}
              onClick={() => props.editorFullWidth && props.onToggleEditorFullWidth()}
            >{t("settings.editorWidthFocused")}</button>
            <button
              type="button"
              aria-pressed={props.editorFullWidth}
              classList={{ active: props.editorFullWidth }}
              onClick={() => !props.editorFullWidth && props.onToggleEditorFullWidth()}
            >{t("settings.editorWidthFull")}</button>
          </div>
        </div>
        <div class="settings-row settings-row-meeting">
          <div><strong>{t("settings.meeting")}</strong><span>{props.meetingDescription}</span></div>
          <div class="settings-meeting-controls">
            <div class="settings-segmented" role="group" aria-label={t("settings.meetingDetection")}>
              <button
                type="button"
                aria-pressed={props.meetingDetectionEnabled}
                classList={{ active: props.meetingDetectionEnabled }}
                onClick={() => !props.meetingDetectionEnabled && props.onToggleMeetingDetection()}
              >{t("settings.on")}</button>
              <button
                type="button"
                aria-pressed={!props.meetingDetectionEnabled}
                classList={{ active: !props.meetingDetectionEnabled }}
                onClick={() => props.meetingDetectionEnabled && props.onToggleMeetingDetection()}
              >{t("settings.off")}</button>
            </div>
            <span class="settings-meeting-auto-description">{t("settings.meetingDetectionDescription")}</span>
          </div>
        </div>
        <div class="settings-row settings-row-microphone">
          <div><strong>{t("settings.microphone")}</strong><span>{t(microphoneStatusKeys[props.microphonePermission])}</span></div>
          <button type="button" class="settings-link" disabled={props.microphonePermissionBusy || props.microphonePermission === "unavailable"} onClick={props.onManageMicrophonePermission}>
            {microphoneActionLabel()}<Icon name="externalLink" size={12} />
          </button>
        </div>
        <div class="settings-row settings-row-local-data">
          <div><strong>{t("settings.localData")}</strong><span>{t("settings.localDataDescription")}</span></div>
          <button
            type="button"
            class="settings-link settings-link-danger"
            disabled={props.localDataRemovalBusy || props.localDataRemovalDisabled}
            onBlur={() => setLocalDataRemovalArmed(false)}
            onClick={() => {
              if (!localDataRemovalArmed()) {
                setLocalDataRemovalArmed(true);
                return;
              }
              setLocalDataRemovalArmed(false);
              props.onRemoveLocalMeetingData();
            }}
          >
            {props.localDataRemovalBusy
              ? t("settings.localDataRemoving")
              : localDataRemovalArmed()
                ? t("settings.localDataConfirm")
                : t("settings.localDataRemove")}
          </button>
        </div>
        <div class="settings-row settings-row-shortcuts">
          <div><strong>{t("settings.shortcuts")}</strong><span>{t("settings.shortcutsDescription")}</span></div>
          <ShortcutGuideTrigger />
        </div>
      </section>
    </div>
  );
}
