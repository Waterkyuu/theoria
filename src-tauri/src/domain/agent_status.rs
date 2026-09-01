/// Authentication-only snapshot used by periodic login probes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct AgentLoginStatus {
    /// Indicates whether a usable local agent executable was found.
    pub(crate) installed: bool,
    /// Indicates whether the local agent reports active credentials.
    pub(crate) logged_in: bool,
    /// Safe authentication category suitable for display.
    pub(crate) authentication_method: Option<String>,
}

/// Effective model settings used when a new agent task starts.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct AgentRuntimeConfig {
    /// Effective model selected for new tasks.
    pub(crate) model: Option<String>,
    /// Effective reasoning effort selected for new tasks.
    pub(crate) reasoning_effort: Option<String>,
}

/// Complete first-load snapshot composed from independent login and configuration probes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct AgentInitStatus {
    /// Authentication state captured during initialization.
    pub(crate) login: AgentLoginStatus,
    /// Runtime configuration captured only when the agent is logged in.
    pub(crate) config: AgentRuntimeConfig,
}
