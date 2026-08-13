import {
  IconAlertCircle,
  IconBlockquote,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconCommand,
  IconDeviceFloppy,
  IconDownload,
  IconDots,
  IconExternalLink,
  IconFile,
  IconFilePlus,
  IconFocus2,
  IconFolder,
  IconFolderOpen,
  IconH1,
  IconH2,
  IconH3,
  IconInfoCircle,
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconMinus,
  IconMicrophone,
  IconMoon,
  IconPlayerStop,
  IconPhoto,
  IconPlus,
  IconSettings,
  IconSun,
  IconTable,
  IconX,
  type IconProps,
} from "@tabler/icons-solidjs";
import type { JSX } from "solid-js";

type TablerIcon = (props: IconProps) => JSX.Element;

const ICONS: Record<string, TablerIcon> = {
  alert: IconAlertCircle,
  blockquote: IconBlockquote,
  bulletList: IconList,
  check: IconCheck,
  codeBlock: IconCode,
  chevronDown: IconChevronDown,
  command: IconCommand,
  download: IconDownload,
  externalLink: IconExternalLink,
  file: IconFile,
  filePlus: IconFilePlus,
  focus: IconFocus2,
  folder: IconFolder,
  folderOpen: IconFolderOpen,
  heading1: IconH1,
  heading2: IconH2,
  heading3: IconH3,
  horizontalRule: IconMinus,
  image: IconPhoto,
  info: IconInfoCircle,
  mic: IconMicrophone,
  moon: IconMoon,
  more: IconDots,
  orderedList: IconListNumbers,
  plus: IconPlus,
  save: IconDeviceFloppy,
  settings: IconSettings,
  sidebar: IconLayoutSidebar,
  sidebarCollapse: IconLayoutSidebarLeftCollapse,
  sidebarExpand: IconLayoutSidebarLeftExpand,
  stop: IconPlayerStop,
  sun: IconSun,
  table: IconTable,
  taskList: IconListCheck,
  x: IconX,
};

export function Icon(props: { name: string; size?: number; stroke?: number; class?: string }): JSX.Element {
  const Component = ICONS[props.name] ?? IconFile;
  const size = props.size ?? 18;
  return (
    <Component
      aria-hidden="true"
      class={`ui-icon ${props.class ?? ""}`}
      size={size}
      strokeWidth={props.stroke ?? (size <= 14 ? 1.8 : 1.6)}
    />
  );
}
