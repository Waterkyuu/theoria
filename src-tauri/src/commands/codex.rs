use crate::adapters::codex::{CodexRuntimeDefaultsCache, SystemCodexAdapter};
use crate::dto::agent::{
    AgentInitStatusResponse, AgentLoginStatusResponse, AgentRunResponse, AgentRuntimeConfigResponse,
};
use crate::error::{AppError, IpcError};
use crate::services::agent::{
    check_agent_init_status, check_agent_login, load_agent_runtime_config, run_agent_task,
};
use serde::Deserialize;

/// User input accepted by the Codex task command.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCodexTaskRequest {
    /// Natural-language task sent to the local Codex runtime.
    query: String,
}

/// Checks whether a locally installed Codex CLI currently has active credentials.
#[tauri::command]
pub async fn check_codex_login(
    runtime_defaults_cache: tauri::State<'_, CodexRuntimeDefaultsCache>,
) -> Result<AgentLoginStatusResponse, IpcError> {
    let adapter = SystemCodexAdapter::new(runtime_defaults_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || check_agent_login(&adapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns the complete first-load status while keeping login and configuration probes separate.
#[tauri::command]
pub async fn check_codex_init_status(
    runtime_defaults_cache: tauri::State<'_, CodexRuntimeDefaultsCache>,
) -> Result<AgentInitStatusResponse, IpcError> {
    let adapter = SystemCodexAdapter::new(runtime_defaults_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || check_agent_init_status(&adapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Reads Codex model defaults without repeating the CLI login command.
#[tauri::command]
pub async fn get_codex_runtime_config(
    runtime_defaults_cache: tauri::State<'_, CodexRuntimeDefaultsCache>,
) -> Result<AgentRuntimeConfigResponse, IpcError> {
    let adapter = SystemCodexAdapter::new(runtime_defaults_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || load_agent_runtime_config(&adapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Sends a bounded query to local Codex and waits for its streamed turn to finish.
#[tauri::command]
pub async fn run_codex_task(
    request: RunCodexTaskRequest,
    runtime_defaults_cache: tauri::State<'_, CodexRuntimeDefaultsCache>,
) -> Result<AgentRunResponse, IpcError> {
    let adapter = SystemCodexAdapter::new(runtime_defaults_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || run_agent_task(&adapter, &request.query))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}
