import { Icon } from "../icons";
import { t } from "../i18n";

type PendingDocumentAction = { kind: "new" } | { kind: "open"; path?: string } | { kind: "close" };

interface DocumentConfirmationDialogProps {
  action: PendingDocumentAction;
  saving: boolean;
  canSave: boolean;
  onCancel(): void;
  onDiscard(): void;
  onSave(): void;
}

export default function DocumentConfirmationDialog(props: DocumentConfirmationDialogProps) {
  const description = () => props.action.kind === "new"
    ? t("confirm.body.new")
    : props.action.kind === "open"
      ? t("confirm.body.open")
      : t("confirm.body.close");
  return (
    <div class="modal-backdrop confirmation-backdrop" onMouseDown={props.onCancel}>
      <section class="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description" onMouseDown={(event) => event.stopPropagation()}>
        <div class="confirmation-icon"><Icon name="alert" size={20} /></div>
        <div class="confirmation-copy">
          <h2 id="discard-title">{t("confirm.title")}</h2>
          <p id="discard-description">{description()}</p>
        </div>
        <div class="confirmation-actions">
          <button type="button" class="button-secondary" autofocus onClick={props.onCancel}>{t("confirm.cancel")}</button>
          <button type="button" class="button-secondary danger" onClick={props.onDiscard}>{t("confirm.dontSave")}</button>
          <button type="button" class="button-primary" disabled={!props.canSave || props.saving} onClick={props.onSave}>{props.saving ? t("document.savingEllipsis") : t("confirm.saveContinue")}</button>
        </div>
      </section>
    </div>
  );
}

export type { PendingDocumentAction };
