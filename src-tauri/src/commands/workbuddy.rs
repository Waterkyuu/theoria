use crate::adapters::workbuddy::{
    read_workbuddy_config, workbuddy_local_storage_path, SystemWorkBuddyAdapter,
};
use crate::domain::agent_status::{AgentInitStatus, AgentRuntimeConfig};
use crate::dto::agent::{
    AgentInitStatusResponse, AgentLoginStatusResponse, AgentRunResponse, AgentRuntimeConfigResponse,
};
use crate::error::{AppError, IpcError};
use crate::platform::workbuddy_config::{WorkBuddyConfigWatchEvent, WorkBuddyConfigWatcherState};
use crate::services::agent::{check_agent_login, load_agent_runtime_config, run_agent_task};
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

const WORKBUDDY_CONFIG_CHANGED_EVENT: &str = "workbuddy-config-changed";

/// User input accepted by the WorkBuddy task command.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunWorkBuddyTaskRequest {
    /// Natural-language task sent to the local WorkBuddy runtime.
    query: String,
}

/// Checks whether the locally installed WorkBuddy runtime has an active account.
#[tauri::command]
pub async fn check_workbuddy_login() -> Result<AgentLoginStatusResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(|| check_agent_login(&SystemWorkBuddyAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Returns the complete first-load WorkBuddy status and activates configuration monitoring.
#[tauri::command]
pub async fn check_workbuddy_init_status(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, WorkBuddyConfigWatcherState>,
) -> Result<AgentInitStatusResponse, IpcError> {
    start_workbuddy_config_watcher(&app, &watcher_state)?;
    let login = tauri::async_runtime::spawn_blocking(|| check_agent_login(&SystemWorkBuddyAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map_err(IpcError::from)?;
    let config = if login.logged_in {
        tauri::async_runtime::spawn_blocking(|| load_agent_runtime_config(&SystemWorkBuddyAdapter))
            .await
            .map_err(|_| IpcError::from(AppError::WorkerFailed))?
            .map_err(IpcError::from)?
    } else {
        Default::default()
    };

    Ok(AgentInitStatusResponse::from(AgentInitStatus {
        login,
        config,
    }))
}

/// Reads WorkBuddy model settings and ensures later LevelDB changes are monitored.
#[tauri::command]
pub async fn get_workbuddy_runtime_config(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, WorkBuddyConfigWatcherState>,
) -> Result<AgentRuntimeConfigResponse, IpcError> {
    start_workbuddy_config_watcher(&app, &watcher_state)?;
    tauri::async_runtime::spawn_blocking(|| load_agent_runtime_config(&SystemWorkBuddyAdapter))
        .await
        .map_err(|_| IpcError::from(AppError::WorkerFailed))?
        .map(Into::into)
        .map_err(Into::into)
}

/// Starts the watcher lazily because WorkBuddy's LevelDB directory may appear after app startup.
fn start_workbuddy_config_watcher(
    app: &tauri::AppHandle,
    watcher_state: &WorkBuddyConfigWatcherState,
) -> Result<(), IpcError> {
    let Some(local_storage_path) = workbuddy_local_storage_path() else {
        return Ok(());
    };
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| IpcError::from(AppError::WorkerFailed))?;
    let previous_config = Arc::new(Mutex::new(None::<AgentRuntimeConfigResponse>));
    watcher_state
        .start_if_available(local_storage_path, move |event| {
            if event == WorkBuddyConfigWatchEvent::Failed {
                if let Ok(mut previous) = previous_config.lock() {
                    *previous = None;
                }
                return;
            }

            let Ok(config) = read_workbuddy_config().map(|config| {
                AgentRuntimeConfigResponse::from(AgentRuntimeConfig {
                    model: config.model,
                    reasoning_effort: config.reasoning_effort,
                })
            }) else {
                return;
            };
            let Ok(mut previous) = previous_config.lock() else {
                return;
            };
            if previous.as_ref() == Some(&config) {
                return;
            }
            *previous = Some(config.clone());
            drop(previous);

            if window.emit(WORKBUDDY_CONFIG_CHANGED_EVENT, config).is_err() {
                // A later snapshot still recovers the current configuration after remounting.
            }
        })
        .map_err(|_| IpcError::from(AppError::WorkBuddyConfigReadFailed))
}

/// Sends a bounded query to WorkBuddy and waits for the streamed task result.
#[tauri::command]
pub async fn run_workbuddy_task(
    request: RunWorkBuddyTaskRequest,
) -> Result<AgentRunResponse, IpcError> {
    tauri::async_runtime::spawn_blocking(move || {
        run_agent_task(&SystemWorkBuddyAdapter, &request.query)
    })
    .await
    .map_err(|_| IpcError::from(AppError::WorkerFailed))?
    .map(Into::into)
    .map_err(Into::into)
}
