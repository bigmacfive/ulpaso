import { Icon } from "../icons";
import { t } from "../i18n";

interface MeetingDetectionDialogProps {
  appName: string;
  onDismiss(): void;
  onConfirm(): void;
}

export default function MeetingDetectionDialog(props: MeetingDetectionDialogProps) {
  return (
    <div class="modal-backdrop confirmation-backdrop" onMouseDown={props.onDismiss}>
      <section
        class="confirmation-dialog meeting-detection-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="meeting-detection-title"
        aria-describedby="meeting-detection-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div class="confirmation-icon meeting-detection-icon"><Icon name="mic" size={20} /></div>
        <div class="confirmation-copy">
          <h2 id="meeting-detection-title">{t("meeting.detectionPromptTitle", { app: props.appName })}</h2>
          <p id="meeting-detection-description">{t("meeting.detectionPromptBody")}</p>
        </div>
        <div class="confirmation-actions">
          <button type="button" class="button-secondary" onClick={props.onDismiss}>{t("meeting.detectionPromptDismiss")}</button>
          <button type="button" class="button-primary" autofocus onClick={props.onConfirm}>{t("meeting.detectionPromptStart")}</button>
        </div>
      </section>
    </div>
  );
}
