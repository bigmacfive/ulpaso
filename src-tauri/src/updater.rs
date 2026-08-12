use rfd::{AsyncMessageDialog, MessageButtons, MessageDialogResult, MessageLevel};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

pub fn spawn_update_check(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        if let Err(error) = check_and_install(app).await {
            eprintln!("Update check failed: {error}");
        }
    });
}

async fn check_and_install(app: AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };

    let install = AsyncMessageDialog::new()
        .set_level(MessageLevel::Info)
        .set_title("Ulpaso update available")
        .set_description(format!(
            "Version {} is ready. Install it now and restart Ulpaso?",
            update.version
        ))
        .set_buttons(MessageButtons::YesNo)
        .show()
        .await
        == MessageDialogResult::Yes;

    if !install {
        return Ok(());
    }

    if let Err(error) = update.download_and_install(|_, _| {}, || {}).await {
        AsyncMessageDialog::new()
            .set_level(MessageLevel::Error)
            .set_title("Update could not be installed")
            .set_description("Ulpaso will try again the next time it starts.")
            .set_buttons(MessageButtons::Ok)
            .show()
            .await;
        return Err(error);
    }

    app.restart();
}
