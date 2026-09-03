use crate::adapters::process::AgentProcessStates;
use crate::error::IpcError;
use crate::services::process::AgentProcessMonitor;
use serde::Serialize;
use tauri::State;

/// Running-state snapshot for every supported local Agent product.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProcessStatesResponse {
    /// Indicates whether a Claude Code process is currently running.
    claude: bool,
    /// Indicates whether a Codex process is currently running.
    codex: bool,
    /// Indicates whether an OpenCode process is currently running.
    opencode: bool,
    /// Indicates whether a WorkBuddy process is currently running.
    workbuddy: bool,
    /// Indicates whether a Qoder CLI process is currently running.
    qoder: bool,
    /// Indicates whether a TraeCode CLI process is currently running.
    traecode: bool,
}

impl From<AgentProcessStates> for AgentProcessStatesResponse {
    fn from(states: AgentProcessStates) -> Self {
        Self {
            claude: states.claude,
            codex: states.codex,
            opencode: states.opencode,
            workbuddy: states.workbuddy,
            qoder: states.qoder,
            traecode: states.traecode,
        }
    }
}

/// Reads the latest process snapshot retained by the application-wide monitor.
#[tauri::command]
pub fn check_agent_processes(
    monitor: State<'_, AgentProcessMonitor>,
) -> Result<AgentProcessStatesResponse, IpcError> {
    monitor.current_states().map(Into::into).map_err(Into::into)
}
