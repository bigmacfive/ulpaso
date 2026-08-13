import { For, Show } from "solid-js";
import { Icon } from "../icons";
import { t } from "../i18n";

interface CommandPaletteItem {
  icon: string;
  label: string;
  hint: string;
  action: string;
}

interface CommandPaletteProps {
  items: CommandPaletteItem[];
  selectedIndex: number;
  query: string;
  theme: "light" | "dark";
  onClose(): void;
  onQuery(value: string): void;
  onSelectIndex(index: number): void;
  onAction(action: string): void;
  onKeyDown(event: KeyboardEvent): void;
}

export default function CommandPalette(props: CommandPaletteProps) {
  return (
    <div class="modal-backdrop" onMouseDown={props.onClose}>
      <div class="command-palette" role="dialog" aria-modal="true" aria-label={t("palette.title")} onMouseDown={(event) => event.stopPropagation()}>
        <div class="command-input"><Icon name="command" size={18} /><input
          autofocus
          aria-label={t("palette.search")}
          aria-controls="command-results"
          aria-activedescendant={props.items[props.selectedIndex] ? `command-${props.selectedIndex}` : undefined}
          placeholder={t("palette.search")}
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
          onKeyDown={props.onKeyDown}
        /></div>
        <div class="command-results" id="command-results" role="listbox" aria-label={t("palette.available")}>
          <p>{t("palette.commands")}</p>
          <For each={props.items}>{(item, index) => <button
            type="button"
            id={`command-${index()}`}
            role="option"
            aria-selected={index() === props.selectedIndex}
            classList={{ selected: index() === props.selectedIndex }}
            onMouseEnter={() => props.onSelectIndex(index())}
            onClick={() => props.onAction(item.action)}
          ><Icon name={item.action === "theme" && props.theme === "dark" ? "sun" : item.icon} size={17} /><span>{item.label}</span><kbd>{item.hint}</kbd></button>}</For>
          <Show when={!props.items.length}><div class="no-results">{t("palette.empty")}</div></Show>
        </div>
        <div class="command-footer"><span><kbd>↵</kbd> {t("palette.select")}</span><span><kbd>Esc</kbd> {t("palette.close")}</span></div>
      </div>
    </div>
  );
}

export type { CommandPaletteItem };
