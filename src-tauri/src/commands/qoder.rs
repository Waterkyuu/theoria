use crate::adapters::qoder::SystemQoderAdapter;
use crate::dto::agent::{
    AgentInitStatusResponse, AgentLoginStatusResponse, AgentRunResponse, AgentRuntimeConfigResponse,
};
use crate::error::{AppError, IpcError};
use crate::services::agent::{
    check_agent_init_status, check_agent_login, load_agent_runtime_config, run_agent_task,
};
use serde::Deserialize;

/// User input accepted by the Qoder task command.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunQoderTaskRequest {
    /// Natural-language task sent to Qoder's non-interactive runner.
    query: String,
}

/// Checks whether a locally installed Qoder CLI has an active account.
#[tauri::command]
pub async fn check_qoder_login() -> Result<AgentLoginStatusResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| check_agent_login(&SystemQoderAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns the complete first-load Qoder status from independent probes.
#[tauri::command]
pub async fn check_qoder_init_status() -> Result<AgentInitStatusResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| check_agent_init_status(&SystemQoderAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns no override when Qoder will choose its account default model at execution time.
#[tauri::command]
pub async fn get_qoder_runtime_config() -> Result<AgentRuntimeConfigResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| load_agent_runtime_config(&SystemQoderAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Sends a bounded query through Qoder's documented stream-json mode.
#[tauri::command]
pub async fn run_qoder_task(request: RunQoderTaskRequest) -> Result<AgentRunResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(move || {
        run_agent_task(&SystemQoderAdapter, &request.query)
    })
    .await
    .map_err(|_| IpcError::from(AppError::WorkerFailed))?
    .map(Into::into)
    .map_err(Into::into)
}
