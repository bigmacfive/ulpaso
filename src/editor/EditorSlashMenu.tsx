import { For, Show, createEffect } from "solid-js";
import { Icon } from "~/icons";
import { t } from "~/i18n";
import type { EditorSlashItem } from "./core/slash_items";
import type { SlashMenuPosition } from "./slash_menu_position";

interface EditorSlashMenuProps {
  position: SlashMenuPosition;
  items: readonly EditorSlashItem[];
  selectedIndex: number;
  isItemDisabled: (item: EditorSlashItem) => boolean;
  isItemActive: (item: EditorSlashItem) => boolean;
  onHoverIndexChange: (index: number) => void;
  onSelect: (item: EditorSlashItem) => void;
}

function hint(item: EditorSlashItem): string {
  const hints: Record<string, string> = {
    heading1: "#", heading2: "##", heading3: "###", blockquote: ">",
    codeBlock: "```", horizontalRule: "---", image: "/i", table: "/t",
    bulletList: "-", orderedList: "1.", taskList: "[]",
    mic: "/meeting",
  };
  return hints[item.icon ?? ""] ?? (item.keywords?.[0] ? `/${item.keywords[0]}` : "");
}

export default function EditorSlashMenu(props: EditorSlashMenuProps) {
  const itemRefs: (HTMLButtonElement | undefined)[] = [];
  let listRef!: HTMLDivElement;

  createEffect(() => {
    itemRefs.length = props.items.length;
    const selectedIndex = props.selectedIndex;
    if (selectedIndex < 0 || selectedIndex >= props.items.length || !listRef) return;

    requestAnimationFrame(() => {
      const item = itemRefs[selectedIndex];
      if (!item) return;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const viewportTop = listRef.scrollTop;
      const viewportBottom = viewportTop + listRef.clientHeight;

      if (itemTop < viewportTop) listRef.scrollTop = Math.max(0, itemTop - 4);
      else if (itemBottom > viewportBottom) listRef.scrollTop = itemBottom - listRef.clientHeight + 4;
    });
  });

  return (
    <div class="slash-command-layer">
      <div
        class="slash-command-bubble"
        style={{
          top: `${props.position.top}px`,
          left: `${props.position.left}px`,
          width: `${props.position.width}px`,
          "max-height": `${props.position.maxHeight}px`,
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <div ref={listRef} class="slash-command-list" style={{ "max-height": `${props.position.maxHeight - 16}px` }}>
          <Show when={props.items.length > 0} fallback={<div class="slash-command-empty">{t("editor.slash.empty")}</div>}>
            <For each={props.items}>{(item, index) => {
              const disabled = () => props.isItemDisabled(item);
              const selected = () => props.selectedIndex === index();
              const active = () => props.isItemActive(item);
              const separator = () => index() > 0 && props.items[index() - 1]?.group !== item.group;
              return <>
                <Show when={separator()}><div class="slash-command-separator" /></Show>
                <button
                  ref={(element) => { itemRefs[index()] = element; }}
                  type="button"
                  tabIndex={-1}
                  disabled={disabled()}
                  classList={{ selected: selected(), active: active() && !selected() }}
                  title={item.description}
                  onMouseEnter={() => props.onHoverIndexChange(index())}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (!disabled()) props.onSelect(item);
                  }}
                >
                  <span class="slash-command-icon"><Icon name={item.icon ?? "file"} size={16} /></span>
                  <span class="slash-command-title">{item.title}</span>
                  <small>{hint(item)}</small>
                </button>
              </>;
            }}</For>
          </Show>
        </div>
      </div>
    </div>
  );
}
