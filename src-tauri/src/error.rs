use serde::Serialize;
use std::path::PathBuf;

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
        match error {
            AppError::ClaudeNotInstalled => Self {
                code: "CLAUDE_NOT_INSTALLED",
                message: "未找到本地 Claude Code。".to_string(),
            },
            AppError::ClaudeProbeFailed => Self {
                code: "CLAUDE_PROBE_FAILED",
                message: "无法检查本地 Claude Code 登录状态。".to_string(),
            },
            AppError::ClaudeProtocolFailed => Self {
                code: "CLAUDE_PROTOCOL_FAILED",
                message: "无法读取本地 Claude Code 事件流。".to_string(),
            },
            AppError::ClaudeNeedsInput => Self {
                code: "CLAUDE_NEEDS_INPUT",
                message: "Claude Code 正在等待用户回答。".to_string(),
            },
            AppError::ClaudeTaskFailed => Self {
                code: "CLAUDE_TASK_FAILED",
                message: "Claude Code 未能完成任务。".to_string(),
            },
            AppError::ClaudeTimedOut => Self {
                code: "CLAUDE_TIMED_OUT",
                message: "等待 Claude Code 完成任务超时。".to_string(),
            },
            AppError::CodexProbeFailed => Self {
                code: "CODEX_PROBE_FAILED",
                message: "无法检查本地 Codex 登录状态。".to_string(),
            },
            AppError::CodexProtocolFailed => Self {
                code: "CODEX_PROTOCOL_FAILED",
                message: "无法读取本地 Codex 事件流。".to_string(),
            },
            AppError::CodexNeedsInput => Self {
                code: "CODEX_NEEDS_INPUT",
                message: "Codex 正在等待用户回答。".to_string(),
            },
            AppError::CodexTaskFailed => Self {
                code: "CODEX_TASK_FAILED",
                message: "Codex 未能完成任务。".to_string(),
            },
            AppError::CodexTimedOut => Self {
                code: "CODEX_TIMED_OUT",
                message: "等待 Codex 完成任务超时。".to_string(),
            },
            AppError::OpenCodeNotInstalled => Self {
                code: "OPENCODE_NOT_INSTALLED",
                message: "未找到本地 OpenCode。".to_string(),
            },
            AppError::OpenCodeProbeFailed => Self {
                code: "OPENCODE_PROBE_FAILED",
                message: "无法检查本地 OpenCode 登录状态。".to_string(),
            },
            AppError::OpenCodeProtocolFailed => Self {
                code: "OPENCODE_PROTOCOL_FAILED",
                message: "无法读取本地 OpenCode 事件流。".to_string(),
            },
            AppError::OpenCodeNeedsInput => Self {
                code: "OPENCODE_NEEDS_INPUT",
                message: "OpenCode 正在等待用户回答。".to_string(),
            },
            AppError::OpenCodeTaskFailed => Self {
                code: "OPENCODE_TASK_FAILED",
                message: "OpenCode 未能完成任务。".to_string(),
            },
            AppError::OpenCodeTimedOut => Self {
                code: "OPENCODE_TIMED_OUT",
                message: "等待 OpenCode 完成任务超时。".to_string(),
            },
            AppError::ProcessProbeFailed => Self {
                code: "PROCESS_PROBE_FAILED",
                message: "无法读取本地 Agent 运行状态。".to_string(),
            },
            AppError::WorkBuddyNotInstalled => Self {
                code: "WORKBUDDY_NOT_INSTALLED",
                message: "未找到本地 WorkBuddy。".to_string(),
            },
            AppError::WorkBuddyConfigReadFailed => Self {
                code: "WORKBUDDY_CONFIG_READ_FAILED",
                message: "无法读取本地 WorkBuddy 模型配置。".to_string(),
            },
            AppError::WorkBuddyProbeFailed => Self {
                code: "WORKBUDDY_PROBE_FAILED",
                message: "无法检查本地 WorkBuddy 登录状态。".to_string(),
            },
            AppError::WorkBuddyProtocolFailed => Self {
                code: "WORKBUDDY_PROTOCOL_FAILED",
                message: "无法读取本地 WorkBuddy 事件流。".to_string(),
            },
            AppError::WorkBuddyNeedsInput => Self {
                code: "WORKBUDDY_NEEDS_INPUT",
                message: "WorkBuddy 正在等待用户回答。".to_string(),
            },
            AppError::WorkBuddyTaskFailed => Self {
                code: "WORKBUDDY_TASK_FAILED",
                message: "WorkBuddy 未能完成任务。".to_string(),
            },
            AppError::WorkBuddyTimedOut => Self {
                code: "WORKBUDDY_TIMED_OUT",
                message: "等待 WorkBuddy 完成任务超时。".to_string(),
            },
            AppError::InvalidQuery => Self {
                code: "INVALID_QUERY",
                message: "任务内容不能为空且不能超过 16000 个字符。".to_string(),
            },
            AppError::InvalidComparison => Self {
                code: "INVALID_COMPARISON",
                message: "对比记录包含无效或重复的数据。".to_string(),
            },
            AppError::ComparisonDatabaseFailed => Self {
                code: "COMPARISON_DATABASE_FAILED",
                message: "无法访问本地历史对比数据库。".to_string(),
            },
            AppError::ComparisonNotFound => Self {
                code: "COMPARISON_NOT_FOUND",
                message: "未找到对应的历史对比记录。".to_string(),
            },
            AppError::InvalidWorkspace => Self {
                code: "INVALID_WORKSPACE",
                message: "工作区名称或来源目录无效。".to_string(),
            },
            AppError::WorkspaceDatabaseFailed => Self {
                code: "WORKSPACE_DATABASE_FAILED",
                message: "无法访问本地工作区数据库。".to_string(),
            },
            AppError::WorkspaceFilesystemFailed => Self {
                code: "WORKSPACE_FILESYSTEM_FAILED",
                message: "无法准备本地工作区目录。".to_string(),
            },
            AppError::InvalidSkill => Self {
                code: "INVALID_SKILL",
                message: "技能目录或 SKILL.md 无效。".to_string(),
            },
            AppError::SkillDatabaseFailed => Self {
                code: "SKILL_DATABASE_FAILED",
                message: "无法访问本地技能库数据库。".to_string(),
            },
            AppError::SkillFilesystemFailed => Self {
                code: "SKILL_FILESYSTEM_FAILED",
                message: "无法复制本地技能目录。".to_string(),
            },
            AppError::TaskDatabaseFailed => Self {
                code: "TASK_DATABASE_FAILED",
                message: "无法访问本地任务历史数据库。".to_string(),
            },
            AppError::InvalidTask => Self {
                code: "INVALID_TASK",
                message: "任务配置无效，需包含 1 到 6 个 Agent 和有效权限。".to_string(),
            },
            AppError::TaskNotFound => Self {
                code: "TASK_NOT_FOUND",
                message: "未找到对应的任务记录。".to_string(),
            },
            AppError::TaskPreparationFailed => Self {
                code: "TASK_PREPARATION_FAILED",
                message: "无法创建安全且隔离的任务执行目录。".to_string(),
            },
            AppError::TaskResultFailed => Self {
                code: "TASK_RESULT_FAILED",
                message: "无法收集或保存 Agent 的文件变化。".to_string(),
            },
            AppError::UnsafeWorkspaceLink(path) => Self {
                code: "UNSAFE_WORKSPACE_LINK",
                message: format!("Workspace 中的符号链接超出来源目录：{}", path.display()),
            },
            AppError::WorkerFailed => Self {
                code: "WORKER_FAILED",
                message: "后台任务意外终止。".to_string(),
            },
        }
    }
}
