use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::Manager;

mod audio_capture;
mod meeting;
mod meeting_detection;
mod meeting_notification;
mod updater;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn ulpaso_install_window_shadow(window: *mut std::ffi::c_void);
}

static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileDocument {
    path: Option<String>,
    content: String,
}

fn read_document(path: PathBuf) -> Result<FileDocument, String> {
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the document: {error}"))?;
    Ok(FileDocument {
        path: Some(path.to_string_lossy().to_string()),
        content,
    })
}

#[tauri::command]
fn open_document() -> Result<Option<FileDocument>, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "mdown", "txt"])
        .set_title("Open Markdown Document")
        .pick_file();
    path.map(read_document).transpose()
}

#[tauri::command]
fn open_path(path: String) -> Result<FileDocument, String> {
    read_document(PathBuf::from(path))
}

#[tauri::command]
fn save_document(
    path: Option<String>,
    content: String,
    save_as: bool,
) -> Result<Option<String>, String> {
    let target = if save_as || path.is_none() {
        let mut dialog = rfd::FileDialog::new()
            .add_filter("Markdown", &["md"])
            .set_title("Save Markdown Document");
        if let Some(current) = path.as_deref() {
            if let Some(name) = Path::new(current)
                .file_name()
                .and_then(|name| name.to_str())
            {
                dialog = dialog.set_file_name(name);
            }
        } else {
            dialog = dialog.set_file_name("Untitled.md");
        }
        dialog.save_file()
    } else {
        path.map(PathBuf::from)
    };

    let Some(mut target) = target else {
        return Ok(None);
    };
    if target.extension().is_none() {
        target.set_extension("md");
    }
    fs::write(&target, content).map_err(|error| format!("Could not save the document: {error}"))?;
    Ok(Some(target.to_string_lossy().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(native_window) = window.ns_window() {
                    unsafe { ulpaso_install_window_shadow(native_window) };
                }
            }

            let controller = meeting::MeetingController::new(app.handle().clone());
            app.manage(controller.clone());
            let meeting_detector =
                meeting_detection::MeetingDetectionController::new(app.handle().clone());
            app.manage(meeting_detector.clone());
            meeting_notification::install(app.handle());
            meeting_detector.spawn();
            updater::spawn_update_check(app.handle().clone());
            if std::env::var("ULPASO_ASR_AUTOSTART").ok().as_deref() == Some("1") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    let system_only = std::env::var("ULPASO_AUDIO_SYSTEM_ONLY")
                        .ok()
                        .as_deref()
                        == Some("1");
                    if controller.start(false, system_only).is_ok() {
                        if let Some(seconds) = std::env::var("ULPASO_ASR_AUTOSTOP_SECONDS")
                            .ok()
                            .and_then(|value| value.parse::<u64>().ok())
                            .or_else(|| {
                                std::env::var("ULPASO_ASR_AUTOCANCEL_SECONDS")
                                    .ok()
                                    .and_then(|value| value.parse::<u64>().ok())
                            })
                        {
                            let cancel = std::env::var("ULPASO_ASR_AUTOCANCEL_SECONDS").is_ok();
                            for _ in 0..3_600 {
                                let phase = controller.status().phase;
                                if phase == "recording" {
                                    std::thread::sleep(std::time::Duration::from_secs(seconds));
                                    if cancel {
                                        let _ = controller.cancel();
                                    } else {
                                        let _ = controller.stop();
                                    }
                                    break;
                                }
                                if phase == "idle" || phase == "error" {
                                    break;
                                }
                                std::thread::sleep(std::time::Duration::from_millis(500));
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // The red window control keeps the local detector alive in the
                // background. Command-Q still follows the ExitRequested path.
                api.prevent_close();
                let _ = window.hide();
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .invoke_handler(tauri::generate_handler![
            open_document,
            open_path,
            save_document,
            meeting::meeting_status,
            meeting::meeting_resources,
            meeting::meeting_prepare,
            meeting::meeting_start,
            meeting::meeting_stop,
            meeting::meeting_cancel,
            meeting::meeting_open_settings,
            meeting_detection::meeting_detection_status,
            meeting_notification::meeting_notification_show,
            meeting_notification::meeting_notification_clear,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Ulpaso")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                for (_, window) in app_handle.webview_windows() {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            if let tauri::RunEvent::ExitRequested { ref api, .. } = event {
                let controller = app_handle.state::<meeting::MeetingController>();
                let phase = controller.status().phase;
                if phase != "idle" && phase != "error" && !ALLOW_EXIT.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let should_exit = rfd::MessageDialog::new()
                        .set_level(rfd::MessageLevel::Warning)
                        .set_title("Stop meeting transcription?")
                        .set_description(
                            "Closing the app will stop the current transcription. Recovery audio will remain in the Meeting Recovery folder.",
                        )
                        .set_buttons(rfd::MessageButtons::YesNo)
                        .show()
                        == rfd::MessageDialogResult::Yes;
                    if should_exit {
                        ALLOW_EXIT.store(true, Ordering::SeqCst);
                        let _ = controller.cancel();
                        app_handle.exit(0);
                    }
                }
            }
            let _ = (app_handle, event);
        });
}
