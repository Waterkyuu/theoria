use crate::domain::agent_run::AgentRunOutput;
use crate::domain::agent_status::{AgentLoginStatus, AgentRuntimeConfig};
use crate::error::AppError;
use std::path::Path;

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
    ) -> Result<AgentRunOutput, AppError>;
}

/// Rejects relative, missing, or non-directory execution locations before spawning a CLI.
pub(crate) fn validate_execution_directory(path: &Path) -> Result<(), AppError> {
    if path.is_absolute() && path.is_dir() {
        Ok(())
    } else {
        Err(AppError::TaskPreparationFailed)
    }
}
