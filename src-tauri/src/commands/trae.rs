use crate::adapters::trae::SystemTraeAdapter;
use crate::dto::agent::{
    AgentInitStatusResponse, AgentLoginStatusResponse, AgentRunResponse, AgentRuntimeConfigResponse,
};
use crate::error::{AppError, IpcError};
use crate::services::agent::{
    check_agent_init_status, check_agent_login, load_agent_runtime_config, run_agent_task,
};
use serde::Deserialize;

/// User input accepted by the TraeCode CLI task command.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTraeTaskRequest {
    /// Natural-language task sent to TraeCode CLI's non-interactive runner.
    query: String,
}

/// Checks whether a locally installed TraeCode CLI has an active account.
#[tauri::command]
pub async fn check_trae_login() -> Result<AgentLoginStatusResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| check_agent_login(&SystemTraeAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns the complete first-load TraeCode CLI status from independent probes.
#[tauri::command]
pub async fn check_trae_init_status() -> Result<AgentInitStatusResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| check_agent_init_status(&SystemTraeAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns no override when TraeCode CLI will choose its account default model.
#[tauri::command]
pub async fn get_trae_runtime_config() -> Result<AgentRuntimeConfigResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| load_agent_runtime_config(&SystemTraeAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Sends a bounded query through TraeCode CLI's documented JSON mode.
#[tauri::command]
pub async fn run_trae_task(request: RunTraeTaskRequest) -> Result<AgentRunResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(move || run_agent_task(&SystemTraeAdapter, &request.query))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}
