use crate::adapters::agent::{AgentAdapter, AgentExecutionConfig, AgentSessionRunOutput};
use crate::adapters::claude::{ClaudeRuntimeSettingsCache, SystemClaudeAdapter};
use crate::adapters::codex::{CodexRuntimeDefaultsCache, SystemCodexAdapter};
use crate::adapters::opencode::SystemOpenCodeAdapter;
use crate::adapters::workbuddy::SystemWorkBuddyAdapter;
use crate::domain::agent_kind::AgentKind;
use crate::error::AppError;
use std::path::Path;
use std::sync::atomic::AtomicBool;

/// Runtime configuration caches shared with one blocking Agent adapter call.
pub(crate) struct AgentRuntimeCaches {
    /// Cached Codex configuration monitor state.
    pub(crate) codex: CodexRuntimeDefaultsCache,
    /// Cached Claude configuration monitor state.
    pub(crate) claude: ClaudeRuntimeSettingsCache,
}

/// Dispatches one local Agent while preserving the exact prepared cwd.
pub(crate) fn run_agent_turn(
    agent_kind: AgentKind,
    prompt: &str,
    execution_directory: &Path,
    config: AgentExecutionConfig<'_>,
    caches: AgentRuntimeCaches,
    session_id: Option<&str>,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    match agent_kind {
        AgentKind::Codex => SystemCodexAdapter::new(caches.codex)
            .run_session_turn_with_config_cancellable(
                prompt,
                execution_directory,
                config,
                session_id,
                cancelled,
            ),
        AgentKind::Claude => SystemClaudeAdapter::new(caches.claude)
            .run_session_turn_with_config_cancellable(
                prompt,
                execution_directory,
                config,
                session_id,
                cancelled,
            ),
        AgentKind::OpenCode => SystemOpenCodeAdapter.run_session_turn_with_config_cancellable(
            prompt,
            execution_directory,
            config,
            session_id,
            cancelled,
        ),
        AgentKind::WorkBuddy => SystemWorkBuddyAdapter.run_session_turn_with_config_cancellable(
            prompt,
            execution_directory,
            config,
            session_id,
            cancelled,
        ),
    }
}
