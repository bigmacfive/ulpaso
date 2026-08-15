use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdate {
    version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<AppUpdate>, String> {
    if cfg!(debug_assertions) {
        return Ok(None);
    }

    app.updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())
        .map(|update| {
            update.map(|update| AppUpdate {
                version: update.version,
            })
        })
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let Some(update) = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
    else {
        return Err("No update is currently available.".into());
    };

    let progress_app = app.clone();
    let mut downloaded = 0_u64;
    update
        .download_and_install(
            move |chunk_length, total| {
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let _ =
                    progress_app.emit("update://progress", UpdateProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|error| error.to_string())?;

    app.restart();
}
