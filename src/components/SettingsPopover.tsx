import { For, Show, createSignal } from "solid-js";
import { Icon } from "../icons";
import { locale, localeLabels, setLocale, t, type Locale } from "../i18n";
import { SHORTCUT_GROUPS, SHORTCUTS } from "../shortcuts";

interface SettingsPopoverProps {
  theme: "light" | "dark";
  meetingDescription: string;
  onClose(): void;
  onToggleTheme(): void;
  onOpenAudioSettings(): void;
}

const shortcutGroupColumns = [
  SHORTCUT_GROUPS.filter((group) => group.id === "document" || group.id === "view"),
  SHORTCUT_GROUPS.filter((group) => group.id === "editing" || group.id === "meeting"),
] as const;

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
        <div class="settings-row settings-row-static">
          <div><strong>{t("settings.meeting")}</strong><span>{props.meetingDescription}</span></div>
          <button type="button" class="settings-link" onClick={props.onOpenAudioSettings}>{t("settings.audioPermissions")}<Icon name="externalLink" size={12} /></button>
        </div>
        <div class="settings-row settings-row-shortcuts">
          <div><strong>{t("settings.shortcuts")}</strong><span>{t("settings.shortcutsDescription")}</span></div>
          <ShortcutGuideTrigger />
        </div>
      </section>
    </div>
  );
}
