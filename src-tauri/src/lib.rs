mod adapters {
    pub(crate) mod activity;
    pub(crate) mod agent;
    pub(crate) mod claude;
    pub(crate) mod codex;
    pub(crate) mod opencode;
    pub(crate) mod process;
    pub(crate) mod workbuddy;
}
mod commands {
    pub(crate) mod activity;
    pub(crate) mod agent;
    pub(crate) mod claude;
    pub(crate) mod codex;
    pub(crate) mod comparison;
    pub(crate) mod opencode;
    pub(crate) mod skill;
    pub(crate) mod task;
    pub(crate) mod workbuddy;
    pub(crate) mod workspace;
}
mod db {
    pub(crate) mod connection;
    pub(crate) mod migration;
}
mod dto {
    pub(crate) mod agent;
    pub(crate) mod comparison;
}
mod domain {
    pub(crate) mod agent_activity;
    pub(crate) mod agent_kind;
    pub(crate) mod agent_run;
    pub(crate) mod agent_status;
    pub(crate) mod comparison;
    pub(crate) mod skill;
    pub(crate) mod task;
    pub(crate) mod workspace;
}
mod error;
mod platform {
    pub(crate) mod claude_config;
    pub(crate) mod codex_config;
    pub(crate) mod opencode_config;
    pub(crate) mod process;
    pub(crate) mod workbuddy_config;
}
mod models {
    pub(crate) mod comparison;
}
mod repositories {
    pub(crate) mod comparison;
    pub(crate) mod skill;
    pub(crate) mod task;
    pub(crate) mod workspace;
}
mod services {
    pub(crate) mod activity;
    pub(crate) mod agent;
    pub(crate) mod cleanup;
    pub(crate) mod comparison;
    pub(crate) mod process;
    pub(crate) mod result;
    pub(crate) mod skill;
    pub(crate) mod snapshot;
    pub(crate) mod task;
    pub(crate) mod task_execution;
    pub(crate) mod workspace;
}
mod utils {
    pub(crate) mod debounce;
}

use crate::adapters::activity::SystemAgentActivityAdapter;
use crate::adapters::agent::AgentStatusAdapter;
use crate::adapters::claude::{ClaudeRuntimeSettingsCache, SystemClaudeAdapter};
use crate::adapters::codex::{CodexRuntimeDefaultsCache, SystemCodexAdapter};
use crate::adapters::opencode::SystemOpenCodeAdapter;
use crate::adapters::process::SystemAgentProcessAdapter;
use crate::commands::activity::AgentActivitiesResponse;
use crate::commands::agent::AgentProcessStatesResponse;
use crate::db::connection::connect_sqlite_path;
use crate::db::migration::Migrator;
use crate::dto::agent::AgentRuntimeConfigResponse;
use crate::platform::claude_config::{
    claude_settings_path, ClaudeConfigWatchEvent, ClaudeConfigWatcher,
};
use crate::platform::codex_config::{
    codex_config_paths, CodexConfigWatchEvent, CodexConfigWatcher,
};
use crate::platform::opencode_config::{
    opencode_config_paths, OpenCodeConfigWatchEvent, OpenCodeConfigWatcher,
};
use crate::platform::workbuddy_config::WorkBuddyConfigWatcherState;
use crate::repositories::comparison::ComparisonRepository;
use crate::repositories::skill::SkillRepository;
use crate::repositories::task::TaskRepository;
use crate::repositories::workspace::WorkspaceRepository;
use crate::services::activity::SystemAgentActivityMonitor;
use crate::services::cleanup::{TaskCleanupService, WorkspaceCleanupService};
use crate::services::comparison::ComparisonService;
use crate::services::process::AgentProcessMonitor;
use crate::services::result::ResultCollector;
use crate::services::skill::SkillLibraryService;
use crate::services::snapshot::SnapshotService;
use crate::services::task::TaskService;
use crate::services::task_execution::TaskExecutionService;
use crate::services::workspace::WorkspaceService;
use sea_orm_migration::MigratorTrait;
use std::time::Duration;
use tauri::{Emitter, Manager};

const AGENT_PROCESS_STATES_CHANGED_EVENT: &str = "agent-process-states-changed";
const AGENT_ACTIVITIES_CHANGED_EVENT: &str = "agent-activities-changed";
const AGENT_PROCESS_REFRESH_INTERVAL: Duration = Duration::from_secs(1);
const CODEX_CONFIG_CHANGED_EVENT: &str = "codex-config-changed";
const CLAUDE_CONFIG_CHANGED_EVENT: &str = "claude-config-changed";
const OPENCODE_CONFIG_CHANGED_EVENT: &str = "opencode-config-changed";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let claude_runtime_settings_cache = ClaudeRuntimeSettingsCache::default();
    let runtime_defaults_cache = CodexRuntimeDefaultsCache::default();
    tauri::Builder::default()
        .manage(claude_runtime_settings_cache)
        .manage(runtime_defaults_cache)
        .manage(WorkBuddyConfigWatcherState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_directory = app.path().app_data_dir()?;
            let database_path = app_data_directory.join("agent-gauge.sqlite3");
            let comparison_database = tauri::async_runtime::block_on(async {
                tokio::fs::create_dir_all(&app_data_directory).await?;
                let database = connect_sqlite_path(&database_path)
                    .await
                    .map_err(std::io::Error::other)?;
                Migrator::up(&database, None)
                    .await
                    .map_err(std::io::Error::other)?;
                Ok::<_, std::io::Error>(database)
            })?;
            app.manage(WorkspaceService::new(
                WorkspaceRepository::new(comparison_database.clone()),
                app_data_directory.clone(),
            ));
            app.manage(SkillLibraryService::new(
                SkillRepository::new(comparison_database.clone()),
                app_data_directory.clone(),
            ));
            app.manage(TaskService::new(
                TaskRepository::new(comparison_database.clone()),
                WorkspaceRepository::new(comparison_database.clone()),
                SkillRepository::new(comparison_database.clone()),
                SnapshotService::new(app_data_directory.clone()),
                app_data_directory.clone(),
            ));
            let task_execution_service = TaskExecutionService::new(
                TaskRepository::new(comparison_database.clone()),
                ResultCollector::new(app_data_directory.clone()),
                app_data_directory.clone(),
            );
            app.manage(task_execution_service.clone());
            let task_cleanup_service = TaskCleanupService::new(
                TaskRepository::new(comparison_database.clone()),
                SnapshotService::new(app_data_directory.clone()),
                task_execution_service,
            );
            app.manage(task_cleanup_service.clone());
            app.manage(WorkspaceCleanupService::new(
                WorkspaceRepository::new(comparison_database.clone()),
                TaskRepository::new(comparison_database.clone()),
                task_cleanup_service,
                app_data_directory.clone(),
            ));
            app.manage(ComparisonService::new(ComparisonRepository::new(
                comparison_database,
            )));

            let claude_runtime_settings_cache =
                app.state::<ClaudeRuntimeSettingsCache>().inner().clone();
            let runtime_defaults_cache = app.state::<CodexRuntimeDefaultsCache>().inner().clone();
            let main_window = app
                .get_webview_window("main")
                .ok_or_else(|| std::io::Error::other("main window is unavailable"))?;
            let process_window = main_window.clone();
            let activity_window = main_window.clone();
            let activity_monitor = SystemAgentActivityMonitor::start(
                SystemAgentActivityAdapter::default(),
                Default::default(),
                move |activities| {
                    // A closed window ends delivery while the retained monitor shuts down normally.
                    let _activity_event_delivered = activity_window
                        .emit(
                            AGENT_ACTIVITIES_CHANGED_EVENT,
                            AgentActivitiesResponse::from(activities),
                        )
                        .is_ok();
                },
            )
            .map_err(|_| std::io::Error::other("activity monitor failed to start"))?;
            let activity_handle = activity_monitor.handle();
            let process_activity_handle = activity_monitor.handle();
            let process_monitor = AgentProcessMonitor::start(
                SystemAgentProcessAdapter::default(),
                AGENT_PROCESS_REFRESH_INTERVAL,
                move |states| {
                    process_activity_handle.update_process_states(states);
                    // A closed window ends delivery while the retained monitor shuts down normally.
                    let _process_event_delivered = process_window
                        .emit(
                            AGENT_PROCESS_STATES_CHANGED_EVENT,
                            AgentProcessStatesResponse::from(states),
                        )
                        .is_ok();
                },
            )
            .map_err(|_| std::io::Error::other("process monitor failed to start"))?;
            activity_handle.update_process_states(
                process_monitor
                    .current_states()
                    .map_err(|_| std::io::Error::other("initial process snapshot unavailable"))?,
            );
            app.manage(activity_monitor);
            app.manage(process_monitor);

            let callback_cache = runtime_defaults_cache.clone();
            let callback_window = main_window.clone();
            let watcher = CodexConfigWatcher::start(codex_config_paths(), move |event| {
                match event {
                    CodexConfigWatchEvent::Changed => {
                        callback_cache.invalidate();
                    }
                    CodexConfigWatchEvent::Failed => {
                        callback_cache.disable();
                        return;
                    }
                }

                let adapter = SystemCodexAdapter::new(callback_cache.clone());
                let Ok(config) = adapter.load_runtime_config() else {
                    return;
                };
                if callback_window
                    .emit(
                        CODEX_CONFIG_CHANGED_EVENT,
                        AgentRuntimeConfigResponse::from(config),
                    )
                    .is_err()
                {
                    callback_cache.disable();
                }
            });

            if let Ok(Some(watcher)) = watcher {
                runtime_defaults_cache.enable();
                app.manage(watcher);
            }

            if let Some(settings_path) = claude_settings_path() {
                let callback_cache = claude_runtime_settings_cache.clone();
                let callback_window = main_window.clone();
                let watcher = ClaudeConfigWatcher::start(settings_path, move |event| {
                    match event {
                        ClaudeConfigWatchEvent::Changed => {
                            callback_cache.invalidate();
                        }
                        ClaudeConfigWatchEvent::Failed => {
                            callback_cache.disable();
                            return;
                        }
                    }

                    let adapter = SystemClaudeAdapter::new(callback_cache.clone());
                    let Ok(config) = adapter.load_runtime_config() else {
                        return;
                    };
                    if callback_window
                        .emit(
                            CLAUDE_CONFIG_CHANGED_EVENT,
                            AgentRuntimeConfigResponse::from(config),
                        )
                        .is_err()
                    {
                        callback_cache.disable();
                    }
                });

                if let Ok(Some(watcher)) = watcher {
                    claude_runtime_settings_cache.enable();
                    app.manage(watcher);
                }
            }

            let callback_window = main_window.clone();
            let watcher = OpenCodeConfigWatcher::start(opencode_config_paths(), move |event| {
                if event == OpenCodeConfigWatchEvent::Changed {
                    let Ok(config) = SystemOpenCodeAdapter.load_runtime_config() else {
                        return;
                    };
                    let _event_delivered = callback_window
                        .emit(
                            OPENCODE_CONFIG_CHANGED_EVENT,
                            AgentRuntimeConfigResponse::from(config),
                        )
                        .is_ok();
                }
            });
            if let Ok(Some(watcher)) = watcher {
                app.manage(watcher);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::activity::check_agent_activities,
            commands::agent::check_agent_processes,
            commands::claude::check_claude_init_status,
            commands::claude::check_claude_login,
            commands::claude::get_claude_runtime_config,
            commands::claude::run_claude_task,
            commands::codex::check_codex_init_status,
            commands::codex::check_codex_login,
            commands::codex::get_codex_runtime_config,
            commands::codex::run_codex_task,
            commands::comparison::get_comparison_history,
            commands::comparison::list_comparison_history,
            commands::comparison::save_comparison_history,
            commands::skill::import_local_skill,
            commands::skill::list_skills,
            commands::skill::list_workspace_skills,
            commands::skill::mount_workspace_skill,
            commands::skill::unmount_workspace_skill,
            commands::task::continue_task,
            commands::task::get_task,
            commands::task::create_task,
            commands::task::delete_task,
            commands::task::list_tasks,
            commands::task::run_task_executions,
            commands::task::stop_task_agent,
            commands::opencode::check_opencode_init_status,
            commands::opencode::check_opencode_login,
            commands::opencode::get_opencode_runtime_config,
            commands::opencode::run_opencode_task,
            commands::workbuddy::check_workbuddy_init_status,
            commands::workbuddy::check_workbuddy_login,
            commands::workbuddy::get_workbuddy_runtime_config,
            commands::workbuddy::run_workbuddy_task,
            commands::workspace::create_managed_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::remove_workspace,
            commands::workspace::register_external_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
