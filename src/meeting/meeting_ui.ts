import { t, type MessageKey } from "../i18n";

const errorMessageKeys: Record<string, MessageKey> = {
  microphone_permission: "meeting.error.microphonePermission",
  microphone_unavailable: "meeting.error.microphoneUnavailable",
  permission_or_capture: "meeting.error.audioCapture",
  capture_start: "meeting.error.audioCapture",
  audio_file: "meeting.error.localFile",
  worker_exit: "meeting.error.recovery",
  worker_recovery: "meeting.error.recovery",
  worker_recovery_timeout: "meeting.error.recovery",
  worker_spool: "meeting.error.recovery",
  runtime_prepare: "meeting.error.engine",
  worker_prepare: "meeting.error.engine",
  worker_input: "meeting.error.engine",
  worker_error: "meeting.error.engine",
  worker_exception: "meeting.error.engine",
};

function meetingErrorDescription(errorCode: string | null): string {
  return t(errorMessageKeys[errorCode ?? ""] ?? "meeting.errorBody");
}

export { meetingErrorDescription };
