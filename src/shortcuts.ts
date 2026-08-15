import type { MessageKey } from "./i18n";

type ShortcutGroup = "document" | "editing" | "view" | "meeting";
type AppShortcutAction =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "palette"
  | "settings"
  | "sidebar"
  | "meeting"
  | "dismiss";

interface ShortcutBinding {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

interface ShortcutDefinition {
  id: string;
  group: ShortcutGroup;
  labelKey: MessageKey;
  keys: readonly string[];
  binding?: ShortcutBinding;
  appAction?: AppShortcutAction;
}

const EDITOR_KEYMAP = {
  bold: "Mod-b",
  italic: "Mod-i",
  inlineCode: "Mod-e",
  strike: "Mod-Shift-KeyX",
  heading1: "Mod-Alt-1",
  heading2: "Mod-Alt-2",
  heading3: "Mod-Alt-3",
} as const;

const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: "new", group: "document", labelKey: "command.new", keys: ["⌘", "N"], binding: { key: "n", mod: true }, appAction: "new" },
  { id: "open", group: "document", labelKey: "command.open", keys: ["⌘", "O"], binding: { key: "o", mod: true }, appAction: "open" },
  { id: "save", group: "document", labelKey: "command.save", keys: ["⌘", "S"], binding: { key: "s", mod: true }, appAction: "save" },
  { id: "saveAs", group: "document", labelKey: "command.saveAs", keys: ["⌘", "⇧", "S"], binding: { key: "s", mod: true, shift: true }, appAction: "saveAs" },

  { id: "undo", group: "editing", labelKey: "shortcut.undo", keys: ["⌘", "Z"] },
  { id: "redo", group: "editing", labelKey: "shortcut.redo", keys: ["⌘", "⇧", "Z"] },
  { id: "bold", group: "editing", labelKey: "shortcut.bold", keys: ["⌘", "B"] },
  { id: "italic", group: "editing", labelKey: "shortcut.italic", keys: ["⌘", "I"] },
  { id: "inlineCode", group: "editing", labelKey: "shortcut.inlineCode", keys: ["⌘", "E"] },
  { id: "strike", group: "editing", labelKey: "shortcut.strike", keys: ["⌘", "⇧", "X"] },
  { id: "heading1", group: "editing", labelKey: "shortcut.heading1", keys: ["⌘", "⌥", "1"] },
  { id: "heading2", group: "editing", labelKey: "shortcut.heading2", keys: ["⌘", "⌥", "2"] },
  { id: "heading3", group: "editing", labelKey: "shortcut.heading3", keys: ["⌘", "⌥", "3"] },
  { id: "blockMenu", group: "editing", labelKey: "shortcut.blockMenu", keys: ["/"] },

  { id: "palette", group: "view", labelKey: "shortcut.palette", keys: ["⌘", "K"], binding: { key: "k", mod: true }, appAction: "palette" },
  { id: "settings", group: "view", labelKey: "shortcut.settings", keys: ["⌘", ","], binding: { key: ",", mod: true }, appAction: "settings" },
  { id: "sidebar", group: "view", labelKey: "shortcut.sidebar", keys: ["⌘", "\\"], binding: { key: "\\", mod: true }, appAction: "sidebar" },
  { id: "dismiss", group: "view", labelKey: "shortcut.dismiss", keys: ["Esc"], binding: { key: "Escape" }, appAction: "dismiss" },

  { id: "meeting", group: "meeting", labelKey: "shortcut.meeting", keys: ["⌘", "⇧", "M"], binding: { key: "m", mod: true, shift: true }, appAction: "meeting" },
];

const SHORTCUT_GROUPS: readonly { id: ShortcutGroup; labelKey: MessageKey }[] = [
  { id: "document", labelKey: "shortcuts.group.document" },
  { id: "editing", labelKey: "shortcuts.group.editing" },
  { id: "view", labelKey: "shortcuts.group.view" },
  { id: "meeting", labelKey: "shortcuts.group.meeting" },
];

function shortcutById(id: string): ShortcutDefinition {
  const shortcut = SHORTCUTS.find((item) => item.id === id);
  if (!shortcut) throw new Error(`Unknown shortcut: ${id}`);
  return shortcut;
}

function shortcutHint(id: string): string {
  return shortcutById(id).keys.join(" ");
}

function matchesShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">, binding: ShortcutBinding): boolean {
  const actualKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const expectedKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;
  return actualKey === expectedKey
    && (event.metaKey || event.ctrlKey) === Boolean(binding.mod)
    && event.shiftKey === Boolean(binding.shift)
    && event.altKey === Boolean(binding.alt);
}

function appShortcutAction(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): AppShortcutAction | null {
  return SHORTCUTS.find((item) => item.appAction && item.binding && matchesShortcut(event, item.binding))?.appAction ?? null;
}

export {
  EDITOR_KEYMAP,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  appShortcutAction,
  shortcutById,
  shortcutHint,
};
export type { AppShortcutAction, ShortcutDefinition, ShortcutGroup };
