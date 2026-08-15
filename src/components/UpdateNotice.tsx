import { Show } from "solid-js";
import { Icon } from "../icons";
import { t } from "../i18n";

type UpdateNoticePhase = "available" | "installing" | "error";

interface UpdateNoticeProps {
  version: string;
  phase: UpdateNoticePhase;
  progress: number | null;
  onDismiss(): void;
  onInstall(): void;
}

export default function UpdateNotice(props: UpdateNoticeProps) {
  const title = () => props.phase === "error"
    ? t("update.errorTitle")
    : t("update.title", { version: props.version });
  const description = () => props.phase === "error"
    ? t("update.errorBody")
    : props.phase === "installing"
      ? t("update.installingBody")
      : t("update.body");

  return (
    <aside
      class="update-notice"
      classList={{ installing: props.phase === "installing", error: props.phase === "error" }}
      role={props.phase === "error" ? "alert" : "dialog"}
      aria-labelledby="update-notice-title"
      aria-describedby="update-notice-description"
      aria-live="polite"
    >
      <div class="update-notice-icon"><Icon name={props.phase === "error" ? "alert" : "download"} size={16} /></div>
      <div class="update-notice-copy">
        <strong id="update-notice-title">{title()}</strong>
        <span id="update-notice-description">{description()}</span>
      </div>
      <div class="update-notice-actions">
        <button type="button" class="update-later" disabled={props.phase === "installing"} onClick={props.onDismiss}>{t("update.later")}</button>
        <button type="button" class="update-install" disabled={props.phase === "installing"} onClick={props.onInstall}>
          {props.phase === "installing" ? t("update.installing") : props.phase === "error" ? t("update.retry") : t("update.install")}
        </button>
      </div>
      <Show when={props.phase === "installing"}>
        <div class="update-progress" role="progressbar" aria-label={t("update.installing")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={props.progress == null ? undefined : Math.round(props.progress * 100)}>
          <i classList={{ indeterminate: props.progress == null }} style={{ width: props.progress == null ? undefined : `${Math.max(4, props.progress * 100)}%` }} />
        </div>
      </Show>
    </aside>
  );
}

export type { UpdateNoticePhase };
