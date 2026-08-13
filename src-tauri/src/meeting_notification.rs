use serde::Serialize;
use std::ffi::{c_char, CStr, CString};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MeetingNotificationAction {
    action: String,
}

#[cfg(target_os = "macos")]
static NOTIFICATION_APP: OnceLock<AppHandle> = OnceLock::new();

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn ulpaso_install_meeting_notification_handler(callback: extern "C" fn(action: *const c_char));
    fn ulpaso_show_meeting_notification(
        title: *const c_char,
        body: *const c_char,
        start_title: *const c_char,
        dismiss_title: *const c_char,
    );
    fn ulpaso_clear_meeting_notification();
}

#[cfg(target_os = "macos")]
extern "C" fn handle_notification_action(action: *const c_char) {
    if action.is_null() {
        return;
    }
    let action = unsafe { CStr::from_ptr(action) }
        .to_string_lossy()
        .into_owned();
    if let Some(app) = NOTIFICATION_APP.get() {
        let _ = app.emit(
            "meeting://notification-action",
            MeetingNotificationAction { action },
        );
    }
}

pub fn install(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = NOTIFICATION_APP.set(app.clone());
        unsafe { ulpaso_install_meeting_notification_handler(handle_notification_action) };
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[tauri::command]
pub fn meeting_notification_show(
    title: String,
    body: String,
    start_title: String,
    dismiss_title: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let title = CString::new(title).map_err(|_| "Invalid notification title")?;
        let body = CString::new(body).map_err(|_| "Invalid notification body")?;
        let start_title = CString::new(start_title).map_err(|_| "Invalid action title")?;
        let dismiss_title = CString::new(dismiss_title).map_err(|_| "Invalid action title")?;
        unsafe {
            ulpaso_show_meeting_notification(
                title.as_ptr(),
                body.as_ptr(),
                start_title.as_ptr(),
                dismiss_title.as_ptr(),
            )
        };
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, body, start_title, dismiss_title);
        Err("Meeting notifications are only available on macOS".into())
    }
}

#[tauri::command]
pub fn meeting_notification_clear() {
    #[cfg(target_os = "macos")]
    unsafe {
        ulpaso_clear_meeting_notification()
    };
}
