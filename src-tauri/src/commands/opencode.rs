use crate::adapters::opencode::SystemOpenCodeAdapter;
use crate::dto::agent::{
    AgentInitStatusResponse, AgentLoginStatusResponse, AgentRunResponse, AgentRuntimeConfigResponse,
};
use crate::error::{AppError, IpcError};
use crate::services::agent::{
    check_agent_init_status, check_agent_login, load_agent_runtime_config, run_agent_task,
};
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
pub async fn check_opencode_login() -> Result<AgentLoginStatusResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| check_agent_login(&SystemOpenCodeAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns the complete first-load OpenCode status from independent probes.
#[tauri::command]
pub async fn check_opencode_init_status() -> Result<AgentInitStatusResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| check_agent_init_status(&SystemOpenCodeAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Reads OpenCode's effective configuration without querying provider credentials.
#[tauri::command]
pub async fn get_opencode_runtime_config() -> Result<AgentRuntimeConfigResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| load_agent_runtime_config(&SystemOpenCodeAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
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
