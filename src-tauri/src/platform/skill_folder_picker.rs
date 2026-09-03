use crate::error::AppError;
use tauri::AppHandle;

/// Opens the platform folder picker while keeping dot-prefixed Skill roots visible on macOS.
pub(crate) async fn select_skill_folder(
    app: AppHandle,
    title: String,
) -> Result<Option<String>, AppError> {
    let (selection_sender, selection_receiver) = tokio::sync::oneshot::channel();
    let picker_app = app.clone();

    app.run_on_main_thread(move || {
        let selection = select_skill_folder_on_main_thread(&picker_app, &title);
        let _selection_delivered = selection_sender.send(selection).is_ok();
    })
    .map_err(|_| AppError::SkillFilesystemFailed)?;

    selection_receiver
        .await
        .map_err(|_| AppError::SkillFilesystemFailed)
}

#[cfg(target_os = "macos")]
fn select_skill_folder_on_main_thread(_app: &AppHandle, title: &str) -> Option<String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::NSString;

    let main_thread = MainThreadMarker::new()?;
    let panel = NSOpenPanel::openPanel(main_thread);
    let title = NSString::from_str(title);

    panel.setCanChooseDirectories(true);
    panel.setCanChooseFiles(false);
    panel.setAllowsMultipleSelection(false);
    panel.setShowsHiddenFiles(true);
    panel.setMessage(Some(&title));

    if panel.runModal() != NSModalResponseOK {
        return None;
    }

    panel.URL()?.path().map(|path| path.to_string())
}

#[cfg(not(target_os = "macos"))]
fn select_skill_folder_on_main_thread(app: &AppHandle, title: &str) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    app.dialog()
        .file()
        .set_title(title)
        .blocking_pick_folder()
        .and_then(|path| {
            path.as_path()
                .map(|path| path.to_string_lossy().into_owned())
        })
}
