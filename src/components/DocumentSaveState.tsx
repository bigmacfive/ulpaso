import { createEffect, onCleanup } from "solid-js";
import { t } from "../i18n";
import type { DocumentSaveLoaderHandle } from "./document_save_loader";

interface DocumentSaveStateProps {
  saving: boolean;
  dirty: boolean;
  saved: boolean;
}

let saveLoaderModule: Promise<typeof import("./document_save_loader")> | null = null;

function loadSaveLoader() {
  saveLoaderModule ??= import("./document_save_loader");
  return saveLoaderModule;
}

export default function DocumentSaveState(props: DocumentSaveStateProps) {
  let host!: HTMLSpanElement;
  let loader: DocumentSaveLoaderHandle | null = null;
  let revision = 0;

  const destroyLoader = () => {
    revision += 1;
    loader?.destroy();
    loader = null;
  };

  createEffect(() => {
    const saving = props.saving;
    destroyLoader();
    if (!saving) return;

    const currentRevision = revision;
    void loadSaveLoader().then(({ createDocumentSaveLoader }) => {
      if (currentRevision !== revision || !host.isConnected) return;
      loader = createDocumentSaveLoader(host);
    }).catch(() => {
      saveLoaderModule = null;
    });
  });

  onCleanup(destroyLoader);

  return (
    <span
      ref={host}
      class="document-save-state"
      classList={{ saving: props.saving, dirty: props.dirty && !props.saving }}
      title={props.saving ? t("document.saving") : props.dirty ? t("document.unsavedChanges") : props.saved ? t("document.saved") : t("document.new")}
      aria-hidden="true"
    />
  );
}
