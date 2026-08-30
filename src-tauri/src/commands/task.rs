use crate::domain::task::{Task, TaskAgent, TaskAgentResult, TaskAgentTurn, TaskDetail, TaskSkill};
use crate::error::{AppError, IpcError};
use crate::services::cleanup::TaskCleanupService;
use crate::services::task::{CreateTaskAgentInput, CreateTaskInput, TaskService};
use crate::services::task_execution::TaskExecutionService;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Request selecting global Recent or one Workspace History.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListTasksRequest {
    /// Omitted for global Recent and present for Workspace History.
    workspace_id: Option<String>,
}

/// Request selecting one persisted Task.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetTaskRequest {
    /// Stable Task identifier from an internal route.
    task_id: String,
}

/// One ordered Agent choice submitted from the Composer.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateTaskAgentRequest {
    /// Local Agent product identifier.
    agent_kind: String,
    /// Optional explicit model choice.
    model: Option<String>,
    /// Optional mode or reasoning choice.
    mode: Option<String>,
}

/// Complete Composer payload accepted exactly once.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateTaskRequest {
    /// Optional owning Workspace.
    workspace_id: Option<String>,
    /// User-visible Task title.
    title: String,
    /// Initial natural-language request.
    prompt: String,
    /// One through six ordered Agent choices.
    agents: Vec<CreateTaskAgentRequest>,
    /// Frozen file access identifier.
    file_access: String,
    /// Frozen command execution identifier.
    command_execution: String,
    /// Managed Skill choices allowed only for normal Tasks.
    skill_ids: Vec<String>,
}

/// Request selecting one prepared Task to execute.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunTaskExecutionsRequest {
    /// Stable prepared Task identifier.
    task_id: String,
}

/// Request continuing all or selected Agent sessions with one message.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContinueTaskRequest {
    /// Stable persisted Task identifier.
    task_id: String,
    /// Follow-up message shared by the selected Agents.
    prompt: String,
    /// Empty broadcasts to every resumable Agent; otherwise selects an exact subset.
    task_agent_ids: Vec<String>,
}

/// Request selecting one Agent Execution to stop.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StopTaskAgentRequest {
    /// Stable Task Agent identifier.
    task_agent_id: String,
}

/// Task metadata shown in Recent, History, and detail headers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskResponse {
    /// Stable Task identifier.
    id: String,
    /// Optional owning Workspace.
    workspace_id: Option<String>,
    /// User-visible title.
    title: String,
    /// Frozen initial prompt.
    prompt: String,
    /// Aggregate lifecycle identifier.
    status: &'static str,
    /// Time after which configuration cannot change.
    configuration_locked_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    created_at_ms: i64,
    /// Latest status update time in Unix milliseconds.
    updated_at_ms: i64,
}

impl From<Task> for TaskResponse {
    fn from(task: Task) -> Self {
        Self {
            id: task.id,
            workspace_id: task.workspace_id,
            title: task.title,
            prompt: task.prompt,
            status: task.status.as_str(),
            configuration_locked_at_ms: task.configuration_locked_at_ms,
            created_at_ms: task.created_at_ms,
            updated_at_ms: task.updated_at_ms,
        }
    }
}

/// One isolated Agent Execution restored into a panel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskAgentResponse {
    /// Stable Execution identifier.
    id: String,
    /// Stable layout slot.
    slot_index: i64,
    /// Local Agent product identifier.
    agent_kind: &'static str,
    /// Frozen model choice.
    model_snapshot: Option<String>,
    /// Frozen mode or reasoning choice.
    mode_snapshot: Option<String>,
    /// Current Execution lifecycle.
    status: &'static str,
}

impl From<TaskAgent> for TaskAgentResponse {
    fn from(agent: TaskAgent) -> Self {
        Self {
            id: agent.id,
            slot_index: agent.slot_index,
            agent_kind: agent.agent_kind.as_str(),
            model_snapshot: agent.model_snapshot,
            mode_snapshot: agent.mode_snapshot,
            status: agent.status.as_str(),
        }
    }
}

/// Project Skill snapshot restored with Task conditions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskSkillResponse {
    /// Folder name under `.agents/skills`.
    folder_name: String,
    /// Snapshot origin identifier.
    origin: String,
    /// Optional managed Library source identifier.
    library_skill_id: Option<String>,
}

impl From<TaskSkill> for TaskSkillResponse {
    fn from(skill: TaskSkill) -> Self {
        Self {
            folder_name: skill.folder_name,
            origin: skill.origin,
            library_skill_id: skill.library_skill_id,
        }
    }
}

/// Collected terminal output for one Agent panel and Comparison table.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskAgentResultResponse {
    /// Parent Execution identifier.
    task_agent_id: String,
    /// Terminal lifecycle identifier.
    final_status: &'static str,
    /// Final Agent response.
    response_text: Option<String>,
    /// Existing Comparison metrics.
    metrics: serde_json::Value,
}

impl From<TaskAgentResult> for TaskAgentResultResponse {
    fn from(result: TaskAgentResult) -> Self {
        let metrics = match serde_json::from_str(&result.metrics_json) {
            Ok(metrics) => metrics,
            Err(_) => serde_json::json!({}),
        };
        Self {
            task_agent_id: result.task_agent_id,
            final_status: result.final_status.as_str(),
            response_text: result.response_text,
            metrics,
        }
    }
}

/// One preserved turn restored inside its owning Agent panel.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskAgentTurnResponse {
    /// Parent Execution identifier.
    task_agent_id: String,
    /// Zero-based order scoped to the Execution.
    sequence: i64,
    /// User message sent for this turn.
    prompt: String,
    /// Terminal lifecycle identifier.
    final_status: &'static str,
    /// Final Agent response, when available.
    response_text: Option<String>,
    /// Existing Comparison metrics for this turn.
    metrics: serde_json::Value,
    /// Completion time in Unix milliseconds.
    created_at_ms: i64,
}

impl From<TaskAgentTurn> for TaskAgentTurnResponse {
    fn from(turn: TaskAgentTurn) -> Self {
        let metrics = match serde_json::from_str(&turn.metrics_json) {
            Ok(metrics) => metrics,
            Err(_) => serde_json::json!({}),
        };
        Self {
            task_agent_id: turn.task_agent_id,
            sequence: turn.sequence,
            prompt: turn.prompt,
            final_status: turn.final_status.as_str(),
            response_text: turn.response_text,
            metrics,
            created_at_ms: turn.created_at_ms,
        }
    }
}

/// Complete Task detail used to restore Agent panels and locked configuration.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskDetailResponse {
    /// Immutable Task metadata.
    task: TaskResponse,
    /// Agent Executions in layout order.
    agents: Vec<TaskAgentResponse>,
    /// Frozen file access identifier.
    file_access: String,
    /// Frozen command execution identifier.
    command_execution: String,
    /// Frozen project Skills.
    skills: Vec<TaskSkillResponse>,
    /// Collected terminal results.
    results: Vec<TaskAgentResultResponse>,
    /// Complete ordered transcript for every Agent Execution.
    turns: Vec<TaskAgentTurnResponse>,
}

impl From<TaskDetail> for TaskDetailResponse {
    fn from(detail: TaskDetail) -> Self {
        Self {
            task: detail.task.into(),
            agents: detail.agents.into_iter().map(Into::into).collect(),
            file_access: detail.permissions.file_access,
            command_execution: detail.permissions.command_execution,
            skills: detail.skills.into_iter().map(Into::into).collect(),
            results: detail.results.into_iter().map(Into::into).collect(),
            turns: detail.turns.into_iter().map(Into::into).collect(),
        }
    }
}

/// Lists global Recent or one Workspace's Task History.
#[tauri::command]
pub(crate) async fn list_tasks(
    request: ListTasksRequest,
    service: State<'_, TaskService>,
) -> Result<Vec<TaskResponse>, IpcError> {
    service
        .list(request.workspace_id.as_deref())
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

/// Restores locked Task conditions, Agent panels, and terminal results.
#[tauri::command]
pub(crate) async fn get_task(
    request: GetTaskRequest,
    service: State<'_, TaskService>,
) -> Result<TaskDetailResponse, IpcError> {
    service
        .get(&request.task_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Freezes one Composer into an immutable Baseline and isolated Agent workspaces.
#[tauri::command]
pub(crate) async fn create_task(
    request: CreateTaskRequest,
    service: State<'_, TaskService>,
) -> Result<TaskDetailResponse, IpcError> {
    let agents = request
        .agents
        .into_iter()
        .map(|agent| {
            let agent_kind = crate::domain::agent_kind::AgentKind::parse(&agent.agent_kind)
                .ok_or(AppError::InvalidTask)?;
            Ok(CreateTaskAgentInput {
                agent_kind,
                model: agent.model,
                mode: agent.mode,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()
        .map_err(IpcError::from)?;
    service
        .create(CreateTaskInput {
            workspace_id: request.workspace_id,
            title: request.title,
            prompt: request.prompt,
            agents,
            file_access: request.file_access,
            command_execution: request.command_execution,
            skill_ids: request.skill_ids,
        })
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Runs every prepared Agent concurrently in its own Execution workspace.
#[tauri::command]
pub(crate) async fn run_task_executions(
    request: RunTaskExecutionsRequest,
    service: State<'_, TaskExecutionService>,
    codex_cache: State<'_, crate::adapters::codex::CodexRuntimeDefaultsCache>,
    claude_cache: State<'_, crate::adapters::claude::ClaudeRuntimeSettingsCache>,
) -> Result<TaskDetailResponse, IpcError> {
    service
        .run(
            &request.task_id,
            codex_cache.inner().clone(),
            claude_cache.inner().clone(),
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Resumes the original isolated sessions without changing frozen configuration.
#[tauri::command]
pub(crate) async fn continue_task(
    request: ContinueTaskRequest,
    service: State<'_, TaskExecutionService>,
    codex_cache: State<'_, crate::adapters::codex::CodexRuntimeDefaultsCache>,
    claude_cache: State<'_, crate::adapters::claude::ClaudeRuntimeSettingsCache>,
) -> Result<TaskDetailResponse, IpcError> {
    service
        .continue_task(
            &request.task_id,
            &request.prompt,
            &request.task_agent_ids,
            codex_cache.inner().clone(),
            claude_cache.inner().clone(),
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Stops one Agent without changing sibling Execution workspaces.
#[tauri::command]
pub(crate) async fn stop_task_agent(
    request: StopTaskAgentRequest,
    service: State<'_, TaskExecutionService>,
) -> Result<TaskDetailResponse, IpcError> {
    service
        .stop_agent(&request.task_agent_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Stops writers, removes all Task files, then cascades database records.
#[tauri::command]
pub(crate) async fn delete_task(
    request: GetTaskRequest,
    service: State<'_, TaskCleanupService>,
) -> Result<(), IpcError> {
    service
        .delete_task(&request.task_id)
        .await
        .map_err(Into::into)
}
