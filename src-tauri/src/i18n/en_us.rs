use super::ErrorMessageKey;

pub(super) fn message(key: ErrorMessageKey) -> &'static str {
    match key {
        ErrorMessageKey::ClaudeNotInstalled => "Claude Code was not found on this device",
        ErrorMessageKey::ClaudeProbeFailed => {
            "The local Claude Code login status could not be checked"
        }
        ErrorMessageKey::ClaudeProtocolFailed => {
            "The local Claude Code event stream could not be read"
        }
        ErrorMessageKey::ClaudeNeedsInput => "Claude Code is waiting for user input",
        ErrorMessageKey::ClaudeTaskFailed => "Claude Code could not complete the task",
        ErrorMessageKey::ClaudeTimedOut => "Timed out while waiting for Claude Code",
        ErrorMessageKey::CodexProbeFailed => "The local Codex login status could not be checked",
        ErrorMessageKey::CodexProtocolFailed => "The local Codex event stream could not be read",
        ErrorMessageKey::CodexNeedsInput => "Codex is waiting for user input",
        ErrorMessageKey::CodexTaskFailed => "Codex could not complete the task",
        ErrorMessageKey::CodexTimedOut => "Timed out while waiting for Codex",
        ErrorMessageKey::OpenCodeNotInstalled => "OpenCode was not found on this device",
        ErrorMessageKey::OpenCodeProbeFailed => {
            "The local OpenCode login status could not be checked"
        }
        ErrorMessageKey::OpenCodeProtocolFailed => {
            "The local OpenCode event stream could not be read"
        }
        ErrorMessageKey::OpenCodeNeedsInput => "OpenCode is waiting for user input",
        ErrorMessageKey::OpenCodeTaskFailed => "OpenCode could not complete the task",
        ErrorMessageKey::OpenCodeTimedOut => "Timed out while waiting for OpenCode",
        ErrorMessageKey::QoderNotInstalled => "Qoder CLI was not found on this device",
        ErrorMessageKey::QoderProbeFailed => {
            "The local Qoder CLI login status could not be checked"
        }
        ErrorMessageKey::QoderProtocolFailed => {
            "The local Qoder CLI event stream could not be read"
        }
        ErrorMessageKey::QoderNeedsInput => "Qoder CLI is waiting for user input",
        ErrorMessageKey::QoderTaskFailed => "Qoder CLI could not complete the task",
        ErrorMessageKey::QoderTimedOut => "Timed out while waiting for Qoder CLI",
        ErrorMessageKey::ProcessProbeFailed => "The local Agent status could not be read",
        ErrorMessageKey::WorkBuddyNotInstalled => "WorkBuddy was not found on this device",
        ErrorMessageKey::WorkBuddyConfigReadFailed => {
            "The local WorkBuddy model configuration could not be read"
        }
        ErrorMessageKey::WorkBuddyProbeFailed => {
            "The local WorkBuddy login status could not be checked"
        }
        ErrorMessageKey::WorkBuddyProtocolFailed => {
            "The local WorkBuddy event stream could not be read"
        }
        ErrorMessageKey::WorkBuddyNeedsInput => "WorkBuddy is waiting for user input",
        ErrorMessageKey::WorkBuddyTaskFailed => "WorkBuddy could not complete the task",
        ErrorMessageKey::WorkBuddyTimedOut => "Timed out while waiting for WorkBuddy",
        ErrorMessageKey::InvalidQuery => {
            "The task must not be empty or longer than 16,000 characters"
        }
        ErrorMessageKey::InvalidComparison => "The comparison contains invalid or duplicate data",
        ErrorMessageKey::ComparisonDatabaseFailed => {
            "The local comparison history database could not be accessed"
        }
        ErrorMessageKey::ComparisonNotFound => {
            "The requested comparison history record was not found"
        }
        ErrorMessageKey::InvalidWorkspace => "The workspace name or source directory is invalid",
        ErrorMessageKey::WorkspaceDatabaseFailed => {
            "The local workspace database could not be accessed"
        }
        ErrorMessageKey::WorkspaceFilesystemFailed => {
            "The local workspace directory could not be prepared"
        }
        ErrorMessageKey::InvalidSkill => "The skill directory or SKILL.md is invalid",
        ErrorMessageKey::SkillDatabaseFailed => {
            "The local skill library database could not be accessed"
        }
        ErrorMessageKey::SkillFilesystemFailed => "The local skill directory could not be copied",
        ErrorMessageKey::TaskDatabaseFailed => {
            "The local task history database could not be accessed"
        }
        ErrorMessageKey::InvalidTask => {
            "The task configuration must contain 1 to 6 Agents and valid permissions"
        }
        ErrorMessageKey::TaskNotFound => "The requested task was not found",
        ErrorMessageKey::TaskPreparationFailed => {
            "A secure, isolated task directory could not be created"
        }
        ErrorMessageKey::TaskResultFailed => "Agent file changes could not be collected or saved",
        ErrorMessageKey::UnsafeWorkspaceLink => {
            "A symbolic link in the workspace points outside its source directory:"
        }
        ErrorMessageKey::WorkerFailed => "A background task stopped unexpectedly",
    }
}
