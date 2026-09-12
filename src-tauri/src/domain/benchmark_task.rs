use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark::{BenchmarkCase, BenchmarkDetail, BenchmarkMount};
use crate::domain::task::{Task, TaskPermissions};
use serde::{Deserialize, Serialize};

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

/// User-editable Rerun choices combined with the immutable source Task identifier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkRerunConfiguration {
    /// Terminal Benchmark Task whose version and complete Case set are reused.
    pub(crate) source_task_id: String,
    /// Unique local products selected for the new Task.
    pub(crate) agent_kinds: Vec<AgentKind>,
    /// Explicit permissions for the new Task.
    pub(crate) permissions: TaskPermissions,
    /// Whether a missing historical mount may be restored.
    pub(crate) restore_mount: bool,
}

/// Complete aggregate written atomically before a Benchmark worker is scheduled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NewBenchmarkTaskPlan {
    /// Common Task identity and lifecycle.
    pub(crate) task: Task,
    /// Immutable published version and Case content.
    pub(crate) benchmark: BenchmarkDetail,
    /// Ordered local products participating in every Case.
    pub(crate) agent_kinds: Vec<AgentKind>,
    /// Frozen file and command permissions.
    pub(crate) permissions: TaskPermissions,
    /// Client-generated retry identity.
    pub(crate) idempotency_key: String,
    /// Canonical request snapshot used to detect key conflicts.
    pub(crate) request_json: String,
    /// Historical Task that initiated this run, when applicable.
    pub(crate) rerun_of_task_id: Option<String>,
    /// Historical mount restored in the same transaction, when confirmed.
    pub(crate) restored_mount: Option<BenchmarkMount>,
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

/// One local product participating in every case of a benchmark task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskAgent {
    pub(crate) id: String,
    pub(crate) agent_kind: AgentKind,
    pub(crate) position: usize,
}

/// Immutable case snapshot kept beneath one benchmark task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskCase {
    pub(crate) id: String,
    pub(crate) case_id: String,
    pub(crate) position: usize,
    pub(crate) content: BenchmarkCase,
}

/// One cell in the complete Case × Agent execution matrix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkCaseExecution {
    pub(crate) id: String,
    pub(crate) task_case_id: String,
    pub(crate) task_agent_id: String,
    pub(crate) phase: String,
    pub(crate) termination_reason: Option<String>,
    pub(crate) session_id: Option<String>,
    pub(crate) response_text: Option<String>,
    pub(crate) metrics_json: Option<String>,
    pub(crate) started_at_ms: Option<i64>,
    pub(crate) finished_at_ms: Option<i64>,
    pub(crate) verdict: Option<String>,
    pub(crate) report_json: Option<String>,
}

/// Complete persisted launch plan and the execution state derived from it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskDetail {
    pub(crate) task: Task,
    pub(crate) benchmark_id: String,
    pub(crate) benchmark_name: String,
    pub(crate) version_id: String,
    pub(crate) version_number: i64,
    pub(crate) rerun_of_task_id: Option<String>,
    pub(crate) result_completeness: String,
    pub(crate) completion_reason: Option<String>,
    pub(crate) cancel_requested: bool,
    pub(crate) permissions: TaskPermissions,
    pub(crate) agents: Vec<BenchmarkTaskAgent>,
    pub(crate) cases: Vec<BenchmarkTaskCase>,
    pub(crate) executions: Vec<BenchmarkCaseExecution>,
}

/// Public, stable result of one fixed validation rule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkEvaluationCheck {
    pub(crate) kind: String,
    pub(crate) path: Option<String>,
    pub(crate) passed: bool,
    pub(crate) message: String,
}

/// All required checks contribute to one binary case verdict.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkEvaluationReport {
    pub(crate) passed: bool,
    pub(crate) checks: Vec<BenchmarkEvaluationCheck>,
}

/// One read-only file from a finished execution compared with its Case baseline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkArtifactFile {
    pub(crate) path: String,
    pub(crate) size_bytes: u64,
    pub(crate) change: String,
}

/// Bounded UTF-8 preview of one final execution artifact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkArtifactPreview {
    pub(crate) path: String,
    pub(crate) size_bytes: u64,
    pub(crate) text: Option<String>,
    pub(crate) truncated: bool,
}

/// Terminal values persisted together for one execution cell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkExecutionResult {
    pub(crate) session_id: Option<String>,
    pub(crate) response_text: Option<String>,
    pub(crate) metrics_json: Option<String>,
    pub(crate) termination_reason: Option<String>,
    pub(crate) report: Option<BenchmarkEvaluationReport>,
    pub(crate) finished_at_ms: i64,
}
