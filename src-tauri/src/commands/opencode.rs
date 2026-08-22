use crate::adapters::opencode::SystemOpenCodeAdapter;
use crate::dto::agent::AgentRunResponse;
use crate::dto::opencode::OpenCodeLoginStatus;
use crate::error::{AppError, IpcError};
use crate::services::agent::run_agent_task;
use crate::services::opencode::check_opencode_login as load_opencode_login;
use serde::Deserialize;

/// User input accepted by the OpenCode task command.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOpenCodeTaskRequest {
    /// Natural-language task sent to OpenCode's documented non-interactive runner.
    query: String,
}

/// Checks whether a locally installed OpenCode CLI has any usable provider credentials.
#[tauri::command]
pub async fn check_opencode_login() -> Result<OpenCodeLoginStatus, IpcError> {
    tauri::async_runtime::spawn_blocking(|| load_opencode_login(&SystemOpenCodeAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map_err(Into::into)
}

/// Sends a bounded query through `opencode run --format json` and returns normalized metrics.
#[tauri::command]
pub async fn run_opencode_task(
    request: RunOpenCodeTaskRequest,
) -> Result<AgentRunResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(move || {
        run_agent_task(&SystemOpenCodeAdapter, &request.query)
    })
    .await
    .map_err(|_| IpcError::from(AppError::WorkerFailed))?
    .map(Into::into)
    .map_err(Into::into)
}
