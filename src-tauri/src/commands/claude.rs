use crate::adapters::claude::{ClaudeRuntimeSettingsCache, SystemClaudeAdapter};
use crate::dto::agent::{
    AgentInitStatusResponse, AgentLoginStatusResponse, AgentRunResponse, AgentRuntimeConfigResponse,
};
use crate::error::{AppError, IpcError};
use crate::services::agent::{
    check_agent_init_status, check_agent_login, load_agent_runtime_config, run_agent_task,
};
use serde::Deserialize;

/// User input accepted by the Claude Code task command.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunClaudeTaskRequest {
    /// Natural-language task sent to the local Claude Code runtime.
    query: String,
}

/// Checks whether the locally installed Claude Code runtime has active credentials.
#[tauri::command]
pub async fn check_claude_login(
    runtime_settings_cache: tauri::State<'_, ClaudeRuntimeSettingsCache>,
) -> Result<AgentLoginStatusResponse, IpcError> {
    let adapter = SystemClaudeAdapter::new(runtime_settings_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || check_agent_login(&adapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns the complete first-load status while keeping the underlying probes independent.
#[tauri::command]
pub async fn check_claude_init_status(
    runtime_settings_cache: tauri::State<'_, ClaudeRuntimeSettingsCache>,
) -> Result<AgentInitStatusResponse, IpcError> {
    let adapter = SystemClaudeAdapter::new(runtime_settings_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || check_agent_init_status(&adapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Reads current Claude model settings without repeating the authentication probe.
#[tauri::command]
pub async fn get_claude_runtime_config(
    runtime_settings_cache: tauri::State<'_, ClaudeRuntimeSettingsCache>,
) -> Result<AgentRuntimeConfigResponse, IpcError> {
    let adapter = SystemClaudeAdapter::new(runtime_settings_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || load_agent_runtime_config(&adapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Sends a bounded query to Claude Code and waits for the streamed task result.
#[tauri::command]
pub async fn run_claude_task(
    request: RunClaudeTaskRequest,
    runtime_settings_cache: tauri::State<'_, ClaudeRuntimeSettingsCache>,
) -> Result<AgentRunResponse, IpcError> {
    let adapter = SystemClaudeAdapter::new(runtime_settings_cache.inner().clone());
    tauri::async_runtime::spawn_blocking(move || run_agent_task(&adapter, &request.query))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}
