use crate::adapters::agent::{AgentAdapter, AgentStatusAdapter};
use crate::domain::agent_run::AgentRunOutput;
use crate::domain::agent_status::{AgentInitStatus, AgentLoginStatus, AgentRuntimeConfig};
use crate::error::AppError;

/// Checks only installation and authentication so periodic polling never loads model settings.
pub(crate) fn check_agent_login(
    adapter: &impl AgentStatusAdapter,
) -> Result<AgentLoginStatus, AppError> {
    adapter.check_login()
}

/// Loads the effective runtime configuration without repeating an authentication probe.
pub(crate) fn load_agent_runtime_config(
    adapter: &impl AgentStatusAdapter,
) -> Result<AgentRuntimeConfig, AppError> {
    adapter.load_runtime_config()
}

/// Composes the complete first-load snapshot while avoiding configuration IO for logged-out agents.
pub(crate) fn check_agent_init_status(
    adapter: &impl AgentStatusAdapter,
) -> Result<AgentInitStatus, AppError> {
    let login = check_agent_login(adapter)?;
    let config = if login.logged_in {
        load_agent_runtime_config(adapter)?
    } else {
        AgentRuntimeConfig::default()
    };

    Ok(AgentInitStatus { login, config })
}

/// Runs one local agent task after enforcing the bounded query contract.
pub(crate) fn run_agent_task(
    adapter: &impl AgentAdapter,
    query: &str,
) -> Result<AgentRunOutput, AppError> {
    if query.trim().is_empty() || query.len() > 16_000 {
        return Err(AppError::InvalidQuery);
    }

    adapter.run_task(query)
}

#[cfg(test)]
mod tests {
    use super::{check_agent_init_status, check_agent_login, run_agent_task};
    use crate::adapters::agent::{AgentAdapter, AgentStatusAdapter};
    use crate::domain::agent_run::AgentRunOutput;
    use crate::domain::agent_status::{AgentLoginStatus, AgentRuntimeConfig};
    use crate::error::AppError;

    struct FakeAgentAdapter;

    impl AgentAdapter for FakeAgentAdapter {
        fn run_task(&self, _query: &str) -> Result<AgentRunOutput, AppError> {
            Err(AppError::CodexTaskFailed)
        }
    }

    struct LoggedInStatusAdapter;

    impl AgentStatusAdapter for LoggedInStatusAdapter {
        fn check_login(&self) -> Result<AgentLoginStatus, AppError> {
            Ok(AgentLoginStatus {
                installed: true,
                logged_in: true,
                authentication_method: Some("account".to_string()),
            })
        }

        fn load_runtime_config(&self) -> Result<AgentRuntimeConfig, AppError> {
            Ok(AgentRuntimeConfig {
                model: Some("runtime-model".to_string()),
                reasoning_effort: Some("high".to_string()),
            })
        }
    }

    struct LoggedOutStatusAdapter;

    impl AgentStatusAdapter for LoggedOutStatusAdapter {
        fn check_login(&self) -> Result<AgentLoginStatus, AppError> {
            Ok(AgentLoginStatus {
                installed: true,
                logged_in: false,
                authentication_method: None,
            })
        }

        fn load_runtime_config(&self) -> Result<AgentRuntimeConfig, AppError> {
            Err(AppError::CodexProtocolFailed)
        }
    }

    #[test]
    fn rejects_empty_and_oversized_queries_before_calling_an_agent() {
        assert_eq!(
            run_agent_task(&FakeAgentAdapter, "  "),
            Err(AppError::InvalidQuery)
        );
        assert_eq!(
            run_agent_task(&FakeAgentAdapter, &"a".repeat(16_001)),
            Err(AppError::InvalidQuery)
        );
    }

    #[test]
    fn login_checks_do_not_load_runtime_configuration() {
        let login = check_agent_login(&LoggedOutStatusAdapter)
            .expect("login probe should not request runtime configuration");

        assert!(login.installed);
        assert!(!login.logged_in);
    }

    #[test]
    fn initial_status_combines_login_and_runtime_configuration() {
        let status = check_agent_init_status(&LoggedInStatusAdapter)
            .expect("initial status should combine both snapshots");

        assert!(status.login.logged_in);
        assert_eq!(status.config.model.as_deref(), Some("runtime-model"));
        assert_eq!(status.config.reasoning_effort.as_deref(), Some("high"));
    }

    #[test]
    fn initial_status_skips_runtime_configuration_while_logged_out() {
        let status = check_agent_init_status(&LoggedOutStatusAdapter)
            .expect("logged-out initialization should not request configuration");

        assert!(!status.login.logged_in);
        assert_eq!(status.config, AgentRuntimeConfig::default());
    }
}
