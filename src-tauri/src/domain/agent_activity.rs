use crate::domain::agent_kind::AgentKind;

/// User-facing lifecycle shared by every supported Agent product.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AgentActivityStatus {
    Running,
    Waiting,
    Finish,
    Error,
}

/// Privacy-safe summary of one task observed from a local Agent event source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AgentActivity {
    /// Opaque identifier derived locally without exposing the source session identifier.
    pub(crate) id: String,
    /// User-facing conversation title resolved from product-owned local metadata.
    pub(crate) title: Option<String>,
    /// Product that owns the task.
    pub(crate) agent: AgentKind,
    /// Latest lifecycle state derived from the product's own protocol.
    pub(crate) status: AgentActivityStatus,
    /// Last filesystem observation time in Unix milliseconds.
    pub(crate) updated_at_ms: u64,
}
