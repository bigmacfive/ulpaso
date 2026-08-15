import { Icon } from "../icons";
import { t } from "../i18n";

interface MeetingDetectionDialogProps {
  appName: string;
  onCancel(): void;
  onConfirm(): void;
}

export default function MeetingDetectionDialog(props: MeetingDetectionDialogProps) {
  return (
    <div class="modal-backdrop confirmation-backdrop" onMouseDown={props.onCancel}>
      <section
        class="confirmation-dialog meeting-detection-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="meeting-detection-title"
        aria-describedby="meeting-detection-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div class="confirmation-icon"><Icon name="mic" size={20} /></div>
        <div class="confirmation-copy">
          <h2 id="meeting-detection-title">{t("meeting.detectedTitle")}</h2>
          <p id="meeting-detection-description">{t("meeting.detectedBody", { app: props.appName })}</p>
        </div>
        <div class="confirmation-actions">
          <button type="button" class="button-secondary" autofocus onClick={props.onCancel}>{t("meeting.detectedCancel")}</button>
          <button type="button" class="button-primary" onClick={props.onConfirm}>{t("meeting.detectedConfirm")}</button>
        </div>
      </section>
    </div>
  );
}
