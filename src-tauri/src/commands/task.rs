use crate::dto::task::{
    ContinueTaskRequest, CreateTaskRequest, GetTaskRequest, ListTasksRequest, RenameTaskRequest,
    RunTaskExecutionsRequest, SetTaskPinRequest, StopTaskAgentRequest, TaskDetailResponse,
    TaskResponse,
};
use crate::error::{AppError, IpcError};
use crate::services::cleanup::TaskCleanupService;
use crate::services::task::{CreateTaskAgentInput, CreateTaskInput, TaskService};
use crate::services::task_execution::TaskExecutionService;
use tauri::State;

/// Lists global Recent or one Workspace's Tasks.
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

/// Changes one Task title after applying the same persisted title bounds as creation.
#[tauri::command]
pub(crate) async fn rename_task(
    request: RenameTaskRequest,
    service: State<'_, TaskService>,
) -> Result<TaskResponse, IpcError> {
    service
        .rename(&request.task_id, request.title)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Changes pin state for one global Recent Task.
#[tauri::command]
pub(crate) async fn set_task_pin(
    request: SetTaskPinRequest,
    service: State<'_, TaskService>,
) -> Result<TaskResponse, IpcError> {
    service
        .set_pin(&request.task_id, request.is_pinned)
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
