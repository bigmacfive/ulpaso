import { Icon } from "../icons";
import { t } from "../i18n";
import { formatBytes, type MeetingResourceStatus } from "../meeting/resources";

interface MeetingSetupDialogProps {
  resources: MeetingResourceStatus;
  onCancel(): void;
  onConfirm(): void;
}

export default function MeetingSetupDialog(props: MeetingSetupDialogProps) {
  return (
    <div class="modal-backdrop confirmation-backdrop" onMouseDown={props.onCancel}>
      <section
        class="confirmation-dialog meeting-setup-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="meeting-setup-title"
        aria-describedby="meeting-setup-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div class="confirmation-icon"><Icon name="download" size={20} /></div>
        <div class="confirmation-copy">
          <h2 id="meeting-setup-title">{t("meeting.setupTitle")}</h2>
          <p id="meeting-setup-description">{t("meeting.setupBody", {
            download: formatBytes(props.resources.estimatedDownloadBytes),
            installed: formatBytes(props.resources.estimatedInstalledBytes),
          })}</p>
          <p class="meeting-setup-note">{t("meeting.setupNetwork")}</p>
          {!props.resources.diskSpaceSufficient && <p class="meeting-setup-space-warning">{t("meeting.setupInsufficientSpace", {
            available: formatBytes(props.resources.availableDiskBytes ?? 0),
            required: formatBytes(props.resources.estimatedDownloadBytes + 500_000_000),
          })}</p>}
        </div>
        <div class="confirmation-actions">
          <button type="button" class="button-secondary" autofocus onClick={props.onCancel}>{t("meeting.setupCancel")}</button>
          <button type="button" class="button-primary" disabled={!props.resources.diskSpaceSufficient} onClick={props.onConfirm}>{t("meeting.setupContinue")}</button>
        </div>
      </section>
    </div>
  );
}
