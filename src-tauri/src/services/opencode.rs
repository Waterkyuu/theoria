use crate::adapters::opencode::OpenCodeAdapter;
use crate::dto::opencode::OpenCodeLoginStatus;
use crate::error::AppError;

/// Converts the adapter probe into the stable IPC login contract used by the comparison page.
pub(crate) fn check_opencode_login(
    adapter: &impl OpenCodeAdapter,
) -> Result<OpenCodeLoginStatus, AppError> {
    let authentication = adapter.check_authentication()?;
    Ok(OpenCodeLoginStatus {
        installed: authentication.installed,
        logged_in: authentication.logged_in,
        authentication_method: authentication.authentication_method,
        model: authentication.model,
        reasoning_effort: authentication.reasoning_effort,
    })
}

#[cfg(test)]
mod tests {
    use super::check_opencode_login;
    use crate::adapters::opencode::{OpenCodeAdapter, OpenCodeAuthentication};
    use crate::error::AppError;

    struct FakeOpenCodeAdapter {
        /// Authentication snapshot returned by this test double.
        authentication: OpenCodeAuthentication,
    }

    impl OpenCodeAdapter for FakeOpenCodeAdapter {
        fn check_authentication(&self) -> Result<OpenCodeAuthentication, AppError> {
            Ok(self.authentication.clone())
        }
    }

    #[test]
    fn reports_the_local_opencode_authentication_state() {
        let adapter = FakeOpenCodeAdapter {
            authentication: OpenCodeAuthentication {
                installed: true,
                logged_in: true,
                authentication_method: Some("configured provider".to_string()),
                model: Some("anthropic/claude-sonnet-4-6".to_string()),
                reasoning_effort: Some("high".to_string()),
            },
        };

        let status = check_opencode_login(&adapter).expect("authentication probe should pass");

        assert!(status.installed);
        assert!(status.logged_in);
        assert_eq!(
            status.authentication_method.as_deref(),
            Some("configured provider")
        );
        assert_eq!(status.model.as_deref(), Some("anthropic/claude-sonnet-4-6"));
        assert_eq!(status.reasoning_effort.as_deref(), Some("high"));
    }
}
