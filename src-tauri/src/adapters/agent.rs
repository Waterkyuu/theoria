use crate::domain::agent_run::AgentRunOutput;
use crate::domain::agent_status::{AgentLoginStatus, AgentRuntimeConfig};
use crate::error::AppError;

/// Normalized status boundary that keeps frequent login probes independent from configuration IO.
pub(crate) trait AgentStatusAdapter {
    /// Checks installation and authentication without loading model configuration.
    fn check_login(&self) -> Result<AgentLoginStatus, AppError>;

    /// Loads the effective model and reasoning settings independently from authentication.
    fn load_runtime_config(&self) -> Result<AgentRuntimeConfig, AppError>;
}

/// Normalized execution boundary shared by every locally monitored agent product.
pub(crate) trait AgentAdapter {
    /// Runs one task and returns normalized response, latency, and token metrics.
    fn run_task(&self, query: &str) -> Result<AgentRunOutput, AppError>;
}
