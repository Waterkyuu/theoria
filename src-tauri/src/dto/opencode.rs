use serde::Serialize;

/// Describes whether the local OpenCode CLI can run provider-backed tasks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeLoginStatus {
    /// Indicates whether a usable OpenCode executable was discovered.
    pub(crate) installed: bool,
    /// Indicates whether stored or environment-backed provider credentials were reported.
    pub(crate) logged_in: bool,
    /// Contains only the safe credential category reported to the UI.
    pub(crate) authentication_method: Option<String>,
    /// Contains the effective model selected by OpenCode's resolved configuration.
    pub(crate) model: Option<String>,
    /// Contains the default agent's provider-specific model variant.
    pub(crate) reasoning_effort: Option<String>,
}
