use crate::domain::agent_run::AgentRunOutput;
use crate::domain::agent_status::{AgentLoginStatus, AgentRuntimeConfig};
use crate::error::AppError;
use std::path::Path;
use std::sync::atomic::AtomicBool;

/// Immutable model settings captured when a Task is created.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct AgentExecutionConfig<'a> {
    /// Exact model identifier selected for this Agent Execution.
    pub(crate) model: Option<&'a str>,
    /// Exact reasoning effort, thinking mode, or provider variant.
    pub(crate) mode: Option<&'a str>,
}

/// Normalized status boundary that keeps frequent login probes independent from configuration IO.
pub(crate) trait AgentStatusAdapter {
    /// Checks installation and authentication without loading model configuration.
    fn check_login(&self) -> Result<AgentLoginStatus, AppError>;

    /// Loads the effective model and reasoning settings independently from authentication.
    fn load_runtime_config(&self) -> Result<AgentRuntimeConfig, AppError>;
}

/// Normalized execution boundary shared by every locally monitored agent product.
pub(crate) trait AgentAdapter {
    /// Runs one task in the exact isolated Execution directory supplied by Task preparation.
    fn run_task_in(
        &self,
        query: &str,
        execution_directory: &Path,
    ) -> Result<AgentRunOutput, AppError> {
        self.run_task_with_config_cancellable(
            query,
            execution_directory,
            AgentExecutionConfig::default(),
            &AtomicBool::new(false),
        )
    }

    /// Runs one task while allowing the owning Task Agent to request cooperative termination.
    fn run_task_cancellable(
        &self,
        query: &str,
        execution_directory: &Path,
        cancelled: &AtomicBool,
    ) -> Result<AgentRunOutput, AppError> {
        self.run_task_with_config_cancellable(
            query,
            execution_directory,
            AgentExecutionConfig::default(),
            cancelled,
        )
    }

    /// Runs one task using the frozen model settings stored with its Task Agent row.
    fn run_task_with_config_cancellable(
        &self,
        query: &str,
        execution_directory: &Path,
        _config: AgentExecutionConfig<'_>,
        cancelled: &AtomicBool,
    ) -> Result<AgentRunOutput, AppError> {
        self.run_task_cancellable(query, execution_directory, cancelled)
    }
}

/// Rejects relative, missing, or non-directory execution locations before spawning a CLI.
pub(crate) fn validate_execution_directory(path: &Path) -> Result<(), AppError> {
    if path.is_absolute() && path.is_dir() {
        Ok(())
    } else {
        Err(AppError::TaskPreparationFailed)
    }
}
