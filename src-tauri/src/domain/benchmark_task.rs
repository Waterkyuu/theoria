use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark::BenchmarkDetail;
use crate::domain::task::TaskPermissions;

/// Explicit choices for a complete mounted benchmark; models belong to the local product.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskConfiguration {
    /// Workspace that owns the mount and the future Task.
    pub(crate) workspace_id: String,
    /// Selected workspace mount.
    pub(crate) mount_id: String,
    /// Version displayed when the user opened the configuration form.
    pub(crate) expected_version_id: String,
    /// Unique local products in user-selected order.
    pub(crate) agent_kinds: Vec<AgentKind>,
    /// Explicit file and command choices, with no backend default substitution.
    pub(crate) permissions: TaskPermissions,
}

/// Missing prerequisite reported without exposing local paths or adapter errors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BenchmarkPreflightIssueKind {
    AgentNotInstalled,
    AgentNotAuthenticated,
    AgentCheckFailed,
    AssetUnavailable,
    VerifierUnavailable,
}

/// Identifies which product or case needs attention before execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkPreflightIssue {
    /// Stable reason for the configuration UI to localize.
    pub(crate) kind: BenchmarkPreflightIssueKind,
    /// Product affected by an installation or authentication problem.
    pub(crate) agent_kind: Option<AgentKind>,
    /// Zero-based case position for material or verifier problems.
    pub(crate) case_position: Option<usize>,
}

/// Read-only preflight snapshot; successful checks do not reserve resources or start a Task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskPreview {
    /// Choices checked in this request.
    pub(crate) configuration: BenchmarkTaskConfiguration,
    /// All cases from the mount's fixed published version.
    pub(crate) benchmark: BenchmarkDetail,
    /// Known missing prerequisites; execution must recheck mutable conditions.
    pub(crate) issues: Vec<BenchmarkPreflightIssue>,
}
