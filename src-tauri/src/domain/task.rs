use crate::domain::agent_kind::AgentKind;

/// Persisted lifecycle shared by Tasks and their Agent Executions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TaskStatus {
    Preparing,
    Running,
    Waiting,
    Completed,
    Failed,
    Stopped,
}

impl TaskStatus {
    /// Returns the stable SQLite and IPC identifier.
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Preparing => "preparing",
            Self::Running => "running",
            Self::Waiting => "waiting",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Stopped => "stopped",
        }
    }

    /// Parses a persisted lifecycle identifier.
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "preparing" => Some(Self::Preparing),
            "running" => Some(Self::Running),
            "waiting" => Some(Self::Waiting),
            "completed" => Some(Self::Completed),
            "failed" => Some(Self::Failed),
            "stopped" => Some(Self::Stopped),
            _ => None,
        }
    }
}

/// Immutable Task configuration and current aggregate status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Task {
    /// Stable Task identifier.
    pub(crate) id: String,
    /// Optional owning Workspace for scoped Task navigation.
    pub(crate) workspace_id: Option<String>,
    /// User-visible task title.
    pub(crate) title: String,
    /// Initial natural-language request.
    pub(crate) prompt: String,
    /// Frozen Baseline path relative to application data.
    pub(crate) baseline_relative_path: String,
    /// Aggregate execution lifecycle.
    pub(crate) status: TaskStatus,
    /// Time after which execution configuration cannot change.
    pub(crate) configuration_locked_at_ms: Option<i64>,
    /// Optional pin time used to order global Recent Tasks.
    pub(crate) pinned_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest status update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

/// One isolated Agent Execution persisted beneath a Task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskAgent {
    /// Stable Execution identifier.
    pub(crate) id: String,
    /// Parent Task identifier.
    pub(crate) task_id: String,
    /// Stable layout position from zero through five.
    pub(crate) slot_index: i64,
    /// Local Agent product used for this Execution.
    pub(crate) agent_kind: AgentKind,
    /// Model frozen at Task creation.
    pub(crate) model_snapshot: Option<String>,
    /// Mode or reasoning setting frozen at Task creation.
    pub(crate) mode_snapshot: Option<String>,
    /// Adapter session identifier used for later messages.
    pub(crate) session_id: Option<String>,
    /// Isolated workspace path relative to application data.
    pub(crate) execution_relative_path: String,
    /// Execution lifecycle.
    pub(crate) status: TaskStatus,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest status update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

/// Frozen file and command permissions for one Task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskPermissions {
    /// Whether an Agent may edit its isolated workspace.
    pub(crate) file_access: String,
    /// Whether an Agent may execute commands.
    pub(crate) command_execution: String,
}

/// Project Skill folder captured into one Task Baseline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskSkill {
    /// Folder name under `.agents/skills`.
    pub(crate) folder_name: String,
    /// Snapshot origin identifier.
    pub(crate) origin: String,
    /// Optional managed Library source identifier.
    pub(crate) library_skill_id: Option<String>,
    /// Skill path relative to application data.
    pub(crate) relative_path: String,
}

/// Persisted output collected for one terminal Agent Execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskAgentResult {
    /// Parent Execution identifier.
    pub(crate) task_agent_id: String,
    /// Terminal lifecycle.
    pub(crate) final_status: TaskStatus,
    /// Final text returned by the Agent.
    pub(crate) response_text: Option<String>,
    /// Changes artifact path relative to application data.
    pub(crate) changes_relative_path: Option<String>,
    /// Existing Comparison metrics encoded as JSON.
    pub(crate) metrics_json: String,
}

/// One preserved user/Agent exchange inside an isolated Execution session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskAgentTurn {
    /// Parent Execution identifier.
    pub(crate) task_agent_id: String,
    /// Zero-based order scoped to the parent Execution.
    pub(crate) sequence: i64,
    /// User message sent for this turn.
    pub(crate) prompt: String,
    /// Terminal lifecycle of this turn.
    pub(crate) final_status: TaskStatus,
    /// Final Agent response, when one was produced.
    pub(crate) response_text: Option<String>,
    /// Existing Comparison metrics encoded as JSON.
    pub(crate) metrics_json: String,
    /// Turn completion time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
}

/// Complete persisted Task view restored from direct Task navigation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskDetail {
    /// Immutable Task metadata.
    pub(crate) task: Task,
    /// Agent Executions in stable layout order.
    pub(crate) agents: Vec<TaskAgent>,
    /// Frozen runtime permissions.
    pub(crate) permissions: TaskPermissions,
    /// Project Skill snapshot in folder order.
    pub(crate) skills: Vec<TaskSkill>,
    /// Collected terminal results.
    pub(crate) results: Vec<TaskAgentResult>,
    /// Complete ordered turn transcript for every Agent Execution.
    pub(crate) turns: Vec<TaskAgentTurn>,
}
