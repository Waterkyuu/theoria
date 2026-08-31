use crate::i18n;

/// Selects the locale used for subsequent user-facing IPC error messages.
#[tauri::command]
pub fn set_backend_locale(locale: String) {
    i18n::set_locale(&locale);
}

#[cfg(test)]
mod tests {
    use super::set_backend_locale;
    use crate::error::{AppError, IpcError};

    #[test]
    fn switches_the_locale_used_by_ipc_errors() {
        set_backend_locale("zh-CN".to_string());

        let error = IpcError::from(AppError::TaskNotFound);
        assert_eq!(error.message, "未找到对应的任务记录。");

        set_backend_locale("en-US".to_string());
    }
}
