use serde::Serialize;
use std::path::PathBuf;

use crate::i18n::{self, ErrorMessageKey};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AppError {
    ClaudeNotInstalled,
    ClaudeProbeFailed,
    ClaudeProtocolFailed,
    ClaudeNeedsInput,
    ClaudeTaskFailed,
    ClaudeTimedOut,
    CodexProbeFailed,
    CodexProtocolFailed,
    CodexNeedsInput,
    CodexTaskFailed,
    CodexTimedOut,
    OpenCodeNotInstalled,
    OpenCodeProbeFailed,
    OpenCodeProtocolFailed,
    OpenCodeNeedsInput,
    OpenCodeTaskFailed,
    OpenCodeTimedOut,
    ProcessProbeFailed,
    WorkBuddyNotInstalled,
    WorkBuddyConfigReadFailed,
    WorkBuddyProbeFailed,
    WorkBuddyProtocolFailed,
    WorkBuddyNeedsInput,
    WorkBuddyTaskFailed,
    WorkBuddyTimedOut,
    InvalidQuery,
    InvalidComparison,
    ComparisonDatabaseFailed,
    ComparisonNotFound,
    InvalidWorkspace,
    WorkspaceDatabaseFailed,
    WorkspaceFilesystemFailed,
    InvalidSkill,
    SkillDatabaseFailed,
    SkillFilesystemFailed,
    TaskDatabaseFailed,
    InvalidTask,
    TaskNotFound,
    TaskPreparationFailed,
    TaskResultFailed,
    UnsafeWorkspaceLink(PathBuf),
    WorkerFailed,
}

/// Stable and redacted error contract exposed across the Tauri IPC boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IpcError {
    /// Machine-readable category used by the frontend.
    pub(crate) code: &'static str,
    /// Safe user-facing explanation without local paths or process details.
    pub(crate) message: String,
}

impl From<AppError> for IpcError {
    fn from(error: AppError) -> Self {
        Self::map(error, i18n::message)
    }
}

impl IpcError {
    #[cfg(test)]
    fn from_app_error(error: AppError, locale: &str) -> Self {
        Self::map(error, |key| i18n::message_for_locale(key, locale))
    }

    fn map(error: AppError, translate: impl FnOnce(ErrorMessageKey) -> &'static str) -> Self {
        let (code, key, path) = match error {
            AppError::ClaudeNotInstalled => (
                "CLAUDE_NOT_INSTALLED",
                ErrorMessageKey::ClaudeNotInstalled,
                None,
            ),
            AppError::ClaudeProbeFailed => (
                "CLAUDE_PROBE_FAILED",
                ErrorMessageKey::ClaudeProbeFailed,
                None,
            ),
            AppError::ClaudeProtocolFailed => (
                "CLAUDE_PROTOCOL_FAILED",
                ErrorMessageKey::ClaudeProtocolFailed,
                None,
            ),
            AppError::ClaudeNeedsInput => (
                "CLAUDE_NEEDS_INPUT",
                ErrorMessageKey::ClaudeNeedsInput,
                None,
            ),
            AppError::ClaudeTaskFailed => (
                "CLAUDE_TASK_FAILED",
                ErrorMessageKey::ClaudeTaskFailed,
                None,
            ),
            AppError::ClaudeTimedOut => ("CLAUDE_TIMED_OUT", ErrorMessageKey::ClaudeTimedOut, None),
            AppError::CodexProbeFailed => (
                "CODEX_PROBE_FAILED",
                ErrorMessageKey::CodexProbeFailed,
                None,
            ),
            AppError::CodexProtocolFailed => (
                "CODEX_PROTOCOL_FAILED",
                ErrorMessageKey::CodexProtocolFailed,
                None,
            ),
            AppError::CodexNeedsInput => {
                ("CODEX_NEEDS_INPUT", ErrorMessageKey::CodexNeedsInput, None)
            }
            AppError::CodexTaskFailed => {
                ("CODEX_TASK_FAILED", ErrorMessageKey::CodexTaskFailed, None)
            }
            AppError::CodexTimedOut => ("CODEX_TIMED_OUT", ErrorMessageKey::CodexTimedOut, None),
            AppError::OpenCodeNotInstalled => (
                "OPENCODE_NOT_INSTALLED",
                ErrorMessageKey::OpenCodeNotInstalled,
                None,
            ),
            AppError::OpenCodeProbeFailed => (
                "OPENCODE_PROBE_FAILED",
                ErrorMessageKey::OpenCodeProbeFailed,
                None,
            ),
            AppError::OpenCodeProtocolFailed => (
                "OPENCODE_PROTOCOL_FAILED",
                ErrorMessageKey::OpenCodeProtocolFailed,
                None,
            ),
            AppError::OpenCodeNeedsInput => (
                "OPENCODE_NEEDS_INPUT",
                ErrorMessageKey::OpenCodeNeedsInput,
                None,
            ),
            AppError::OpenCodeTaskFailed => (
                "OPENCODE_TASK_FAILED",
                ErrorMessageKey::OpenCodeTaskFailed,
                None,
            ),
            AppError::OpenCodeTimedOut => (
                "OPENCODE_TIMED_OUT",
                ErrorMessageKey::OpenCodeTimedOut,
                None,
            ),
            AppError::ProcessProbeFailed => (
                "PROCESS_PROBE_FAILED",
                ErrorMessageKey::ProcessProbeFailed,
                None,
            ),
            AppError::WorkBuddyNotInstalled => (
                "WORKBUDDY_NOT_INSTALLED",
                ErrorMessageKey::WorkBuddyNotInstalled,
                None,
            ),
            AppError::WorkBuddyConfigReadFailed => (
                "WORKBUDDY_CONFIG_READ_FAILED",
                ErrorMessageKey::WorkBuddyConfigReadFailed,
                None,
            ),
            AppError::WorkBuddyProbeFailed => (
                "WORKBUDDY_PROBE_FAILED",
                ErrorMessageKey::WorkBuddyProbeFailed,
                None,
            ),
            AppError::WorkBuddyProtocolFailed => (
                "WORKBUDDY_PROTOCOL_FAILED",
                ErrorMessageKey::WorkBuddyProtocolFailed,
                None,
            ),
            AppError::WorkBuddyNeedsInput => (
                "WORKBUDDY_NEEDS_INPUT",
                ErrorMessageKey::WorkBuddyNeedsInput,
                None,
            ),
            AppError::WorkBuddyTaskFailed => (
                "WORKBUDDY_TASK_FAILED",
                ErrorMessageKey::WorkBuddyTaskFailed,
                None,
            ),
            AppError::WorkBuddyTimedOut => (
                "WORKBUDDY_TIMED_OUT",
                ErrorMessageKey::WorkBuddyTimedOut,
                None,
            ),
            AppError::InvalidQuery => ("INVALID_QUERY", ErrorMessageKey::InvalidQuery, None),
            AppError::InvalidComparison => (
                "INVALID_COMPARISON",
                ErrorMessageKey::InvalidComparison,
                None,
            ),
            AppError::ComparisonDatabaseFailed => (
                "COMPARISON_DATABASE_FAILED",
                ErrorMessageKey::ComparisonDatabaseFailed,
                None,
            ),
            AppError::ComparisonNotFound => (
                "COMPARISON_NOT_FOUND",
                ErrorMessageKey::ComparisonNotFound,
                None,
            ),
            AppError::InvalidWorkspace => {
                ("INVALID_WORKSPACE", ErrorMessageKey::InvalidWorkspace, None)
            }
            AppError::WorkspaceDatabaseFailed => (
                "WORKSPACE_DATABASE_FAILED",
                ErrorMessageKey::WorkspaceDatabaseFailed,
                None,
            ),
            AppError::WorkspaceFilesystemFailed => (
                "WORKSPACE_FILESYSTEM_FAILED",
                ErrorMessageKey::WorkspaceFilesystemFailed,
                None,
            ),
            AppError::InvalidSkill => ("INVALID_SKILL", ErrorMessageKey::InvalidSkill, None),
            AppError::SkillDatabaseFailed => (
                "SKILL_DATABASE_FAILED",
                ErrorMessageKey::SkillDatabaseFailed,
                None,
            ),
            AppError::SkillFilesystemFailed => (
                "SKILL_FILESYSTEM_FAILED",
                ErrorMessageKey::SkillFilesystemFailed,
                None,
            ),
            AppError::TaskDatabaseFailed => (
                "TASK_DATABASE_FAILED",
                ErrorMessageKey::TaskDatabaseFailed,
                None,
            ),
            AppError::InvalidTask => ("INVALID_TASK", ErrorMessageKey::InvalidTask, None),
            AppError::TaskNotFound => ("TASK_NOT_FOUND", ErrorMessageKey::TaskNotFound, None),
            AppError::TaskPreparationFailed => (
                "TASK_PREPARATION_FAILED",
                ErrorMessageKey::TaskPreparationFailed,
                None,
            ),
            AppError::TaskResultFailed => (
                "TASK_RESULT_FAILED",
                ErrorMessageKey::TaskResultFailed,
                None,
            ),
            AppError::UnsafeWorkspaceLink(path) => (
                "UNSAFE_WORKSPACE_LINK",
                ErrorMessageKey::UnsafeWorkspaceLink,
                Some(path),
            ),
            AppError::WorkerFailed => ("WORKER_FAILED", ErrorMessageKey::WorkerFailed, None),
        };
        let translated_message = translate(key);
        let message = match path {
            Some(path) => format!("{translated_message} {}", path.display()),
            None => translated_message.to_string(),
        };

        Self { code, message }
    }
}

#[cfg(test)]
mod tests {
    use super::{AppError, IpcError};

    #[test]
    fn translates_an_ipc_error_to_english() {
        let error = IpcError::from_app_error(AppError::TaskNotFound, "en-US");

        assert_eq!(error.code, "TASK_NOT_FOUND");
        assert_eq!(error.message, "The requested task was not found");
    }

    #[test]
    fn translates_an_ipc_error_to_chinese() {
        let error = IpcError::from_app_error(AppError::TaskNotFound, "zh-CN");

        assert_eq!(error.code, "TASK_NOT_FOUND");
        assert_eq!(error.message, "未找到对应的任务记录");
    }
}
