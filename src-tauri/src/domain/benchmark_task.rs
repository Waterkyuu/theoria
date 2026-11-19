use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark::{BenchmarkCase, BenchmarkDetail, BenchmarkMount};
use crate::domain::task::{Task, TaskPermissions};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;

/// Explicit, portable settings frozen before a benchmark starts; credentials never belong here.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BenchmarkAgentProfile {
    /// Product identifier; validated before it reaches the runtime.
    pub(crate) agent_kind: String,
    /// Distinguishes configurations of the same product.
    #[serde(default)]
    pub(crate) label: String,
    /// Explicit model, or unknown when inheriting a historical local default.
    #[serde(default)]
    pub(crate) model: Option<String>,
    /// Reasoning effort or product mode.
    #[serde(default)]
    pub(crate) mode: Option<String>,
    /// Requested CLI version; external runners can pin it during installation.
    #[serde(default)]
    pub(crate) version: Option<String>,
}

/// External datasets retain their own environments and verifier protocol.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum BenchmarkRunner {
    #[default]
    Native,
    Harbor {
        /// Registry dataset name, never a shell command or arbitrary local path.
        dataset: String,
        /// Fixed dataset release rather than a moving alias.
        version: String,
    },
}

impl BenchmarkRunner {
    /// Only tested, fixed releases may launch external code.
    pub(crate) fn validate(&self) -> Result<(), crate::error::AppError> {
        match self {
            Self::Native => Ok(()),
            Self::Harbor { dataset, version }
                if matches!(
                    (dataset.as_str(), version.as_str()),
                    ("terminal-bench", "2.0") | ("swebench-verified", "1.0")
                ) =>
            {
                Ok(())
            }
            _ => Err(crate::error::AppError::InvalidBenchmark),
        }
    }
}

/// Immutable experiment inputs, also embedded in the idempotent request snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub(crate) struct BenchmarkRunOptions {
    /// Published zero-based case positions; null means the whole suite.
    pub(crate) case_positions: Option<Vec<usize>>,
    /// Independent trials per case and profile, never automatic retries.
    pub(crate) repetitions: u32,
    /// Explicit configurations; empty preserves the legacy product selection.
    pub(crate) profiles: Vec<BenchmarkAgentProfile>,
    /// Owns environment preparation and scoring for this experiment.
    pub(crate) runner: BenchmarkRunner,
}

impl Default for BenchmarkRunOptions {
    fn default() -> Self {
        Self {
            case_positions: None,
            repetitions: 1,
            profiles: Vec::new(),
            runner: BenchmarkRunner::Native,
        }
    }
}

impl BenchmarkRunOptions {
    /// Bounds the complete experiment before any rows or child processes are created.
    pub(crate) fn validate(&self, case_count: usize) -> Result<(), crate::error::AppError> {
        use crate::error::AppError;
        let selected = self.case_positions.as_ref().map_or(case_count, Vec::len);
        if !(1..=10).contains(&self.repetitions)
            || self.profiles.len() > 8
            || selected == 0
            || selected > 100
            || self.case_positions.as_ref().is_some_and(|positions| {
                positions.iter().any(|position| *position >= case_count)
                    || positions
                        .iter()
                        .collect::<std::collections::HashSet<_>>()
                        .len()
                        != positions.len()
            })
            || selected * self.profiles.len().max(4) * self.repetitions as usize > 4000
        {
            return Err(AppError::InvalidBenchmark);
        }
        for profile in &self.profiles {
            if AgentKind::parse(&profile.agent_kind).is_none()
                || profile.label.len() > 120
                || profile.version.as_ref().is_some_and(|version| {
                    !version.starts_with(|character: char| character.is_ascii_digit())
                        || !version
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || b".-".contains(&byte))
                })
                || [&profile.model, &profile.mode, &profile.version]
                    .into_iter()
                    .flatten()
                    .any(|value| {
                        value.trim().is_empty()
                            || value.len() > 200
                            || value.chars().any(char::is_control)
                    })
            {
                return Err(AppError::InvalidBenchmark);
            }
        }
        self.runner.validate()?;
        if matches!(self.runner, BenchmarkRunner::Harbor { .. })
            && (self.profiles.is_empty()
                || self
                    .profiles
                    .iter()
                    .any(|profile| profile.model.is_none() || profile.agent_kind == "workbuddy"))
        {
            return Err(AppError::InvalidBenchmark);
        }
        Ok(())
    }

    /// Materializes legacy selections so execution and history use the same profile representation.
    pub(crate) fn agent_profiles(&self, kinds: &[AgentKind]) -> Vec<BenchmarkAgentProfile> {
        if self.profiles.is_empty() {
            kinds
                .iter()
                .map(|kind| BenchmarkAgentProfile {
                    agent_kind: kind.as_str().into(),
                    ..Default::default()
                })
                .collect()
        } else {
            self.profiles.clone()
        }
    }
}

/// Complete owned invocation passed from the Benchmark orchestrator to the Agent runtime.
#[derive(Debug, Clone)]
pub(crate) struct BenchmarkAgentInvocation {
    /// Local product selected for this matrix column.
    pub(crate) agent_kind: AgentKind,
    /// Immutable Case prompt.
    pub(crate) prompt: String,
    /// Isolated workspace owned by this execution cell.
    pub(crate) working_directory: PathBuf,
    /// Optional product model override; Benchmark calls always leave this empty.
    pub(crate) model: Option<String>,
    /// Optional product mode override; Benchmark calls always leave this empty.
    pub(crate) mode: Option<String>,
    /// Frozen file access policy.
    pub(crate) file_access: String,
    /// Frozen command execution policy.
    pub(crate) command_execution: String,
    /// Optional prior product session; each V1 Case starts without one.
    pub(crate) session_id: Option<String>,
    /// Case-owned execution deadline.
    pub(crate) timeout: Duration,
    /// Task-owned signal shared with the Agent runtime and deadline watcher.
    pub(crate) cancellation: Arc<AtomicBool>,
}

/// Explicit choices for a complete mounted benchmark; models belong to the local product.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskConfiguration {
    /// Workspace that owns the mount and the future Task.
    pub(crate) workspace_id: String,
    /// Selected workspace mount.
    pub(crate) mount_id: String,
    /// Version displayed when the user opened the configuration form.
    pub(crate) expected_version_id: String,
    /// Frozen subset, profiles, repetitions, and runner protocol.
    pub(crate) run_options: BenchmarkRunOptions,
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
    /// New experiment choices; absent reuses the historical experiment.
    pub(crate) run_options: Option<BenchmarkRunOptions>,
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
    /// Validated experiment inputs persisted with the request snapshot.
    pub(crate) run_options: BenchmarkRunOptions,
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
    /// Stable Task Agent row identifier.
    pub(crate) id: String,
    /// Local Agent product selected for this matrix column.
    pub(crate) agent_kind: AgentKind,
    /// Stable matrix column order.
    pub(crate) position: usize,
    /// Immutable requested model, mode, and CLI version.
    pub(crate) profile: BenchmarkAgentProfile,
}

/// Immutable case snapshot kept beneath one benchmark task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskCase {
    /// Stable Task Case row identifier.
    pub(crate) id: String,
    /// Published immutable Case identifier.
    pub(crate) case_id: String,
    /// Stable matrix row order.
    pub(crate) position: usize,
    /// Frozen Case content executed by every selected Agent.
    pub(crate) content: BenchmarkCase,
}

/// One cell in the complete Case × Agent execution matrix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkCaseExecution {
    /// Stable execution cell identifier.
    pub(crate) id: String,
    /// Frozen Task Case row used by this cell.
    pub(crate) task_case_id: String,
    /// Frozen Task Agent row used by this cell.
    pub(crate) task_agent_id: String,
    /// One-based independent repetition.
    pub(crate) attempt: u32,
    /// Lifecycle phase constrained by persistence to queued, preparing, running,
    /// waiting_permission, collecting, evaluating, stopping, or finished.
    pub(crate) phase: String,
    /// Terminal reason when no evaluation verdict exists.
    pub(crate) termination_reason: Option<String>,
    /// Agent session identifier retained for diagnostics.
    pub(crate) session_id: Option<String>,
    /// Final Agent response when one was produced.
    pub(crate) response_text: Option<String>,
    /// Normalized execution metrics when the Agent reported them.
    pub(crate) metrics: Option<BenchmarkExecutionMetrics>,
    /// Execution start time in Unix milliseconds.
    pub(crate) started_at_ms: Option<i64>,
    /// Execution completion time in Unix milliseconds.
    pub(crate) finished_at_ms: Option<i64>,
    /// Passed or failed evaluation verdict.
    pub(crate) verdict: Option<String>,
    /// Complete bounded evaluation report when scoring completed.
    pub(crate) report: Option<BenchmarkEvaluationReport>,
}

/// Normalized metrics retained independently from any source Agent protocol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkExecutionMetrics {
    /// Full Agent execution duration in milliseconds.
    pub(crate) total_duration_ms: u64,
    /// Provider-reported charge in billionths of USD; missing is never zero.
    #[serde(default)]
    pub(crate) cost_nano_usd: Option<u64>,
    /// Runtime metadata actually reported by an external runner.
    #[serde(default)]
    pub(crate) runtime: Option<BenchmarkAgentProfile>,
    /// Delay until the first non-empty Agent response delta.
    pub(crate) time_to_first_token_ms: Option<u64>,
    /// Token categories when the source Agent reports them.
    pub(crate) token_usage: Option<BenchmarkTokenUsage>,
    /// Number of recorded tool calls.
    pub(crate) tool_call_count: u64,
    /// Tool calls retained in source start order.
    pub(crate) tool_calls: Vec<BenchmarkToolCall>,
}

/// Token categories normalized from one source Agent response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkTokenUsage {
    /// Total input and output tokens.
    pub(crate) total_tokens: u64,
    /// Tokens included in model input.
    pub(crate) input_tokens: u64,
    /// Input tokens served from cache.
    pub(crate) cached_input_tokens: u64,
    /// Input tokens written into cache.
    pub(crate) cache_write_input_tokens: u64,
    /// Tokens included in model output.
    pub(crate) output_tokens: u64,
    /// Output tokens consumed by reasoning when reported.
    pub(crate) reasoning_output_tokens: Option<u64>,
}

/// One measured tool invocation normalized from a source Agent event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkToolCall {
    /// Stable tool name supplied by the source protocol.
    pub(crate) name: String,
    /// Structured parameters supplied to the tool.
    pub(crate) arguments: Option<serde_json::Value>,
    /// Structured terminal output or error returned by the tool.
    pub(crate) result: Option<serde_json::Value>,
    /// Normalized terminal state, absent on historical results.
    pub(crate) status: Option<String>,
    /// Wall-clock execution duration in milliseconds.
    pub(crate) duration_ms: u64,
}

/// Complete persisted launch plan and the execution state derived from it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTaskDetail {
    /// Common Task identity and lifecycle.
    pub(crate) task: Task,
    /// Published definition used by the Task.
    pub(crate) benchmark_id: String,
    /// Display name captured for the result header.
    pub(crate) benchmark_name: String,
    /// Immutable published version executed by the Task.
    pub(crate) version_id: String,
    /// User-visible version number.
    pub(crate) version_number: i64,
    /// Historical Task that initiated this Rerun, when present.
    pub(crate) rerun_of_task_id: Option<String>,
    /// Whether every planned cell has a complete normal result.
    pub(crate) result_completeness: String,
    /// Stable reason for an incomplete result matrix.
    pub(crate) completion_reason: Option<String>,
    /// Whether the user requested cancellation.
    pub(crate) cancel_requested: bool,
    /// Immutable experiment inputs, with defaults for pre-experiment history.
    pub(crate) run_options: BenchmarkRunOptions,
    /// Frozen file and command permissions.
    pub(crate) permissions: TaskPermissions,
    /// Matrix columns in user-selected order.
    pub(crate) agents: Vec<BenchmarkTaskAgent>,
    /// Matrix rows in published Case order.
    pub(crate) cases: Vec<BenchmarkTaskCase>,
    /// Complete Case × Agent matrix.
    pub(crate) executions: Vec<BenchmarkCaseExecution>,
}

/// Public, stable result of one fixed validation rule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkEvaluationCheck {
    /// Stable check kind used by the result UI.
    pub(crate) kind: String,
    /// Relative artifact path addressed by the check, when applicable.
    pub(crate) path: Option<String>,
    /// Whether this individual check succeeded.
    pub(crate) passed: bool,
    /// Stable safe result message identifier.
    pub(crate) message: String,
}

/// All required checks contribute to one binary case verdict.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkEvaluationReport {
    /// Whether every required check succeeded.
    pub(crate) passed: bool,
    /// Unmodified numeric rewards supplied by the upstream verifier.
    #[serde(default)]
    pub(crate) rewards: Option<std::collections::BTreeMap<String, serde_json::Number>>,
    /// Exact harness release used to interpret the upstream protocol.
    #[serde(default)]
    pub(crate) runner_version: Option<String>,
    /// Content checksum of the exact upstream task used by the trial.
    #[serde(default)]
    pub(crate) task_checksum: Option<String>,
    /// Ordered public check results.
    pub(crate) checks: Vec<BenchmarkEvaluationCheck>,
}

/// One read-only file from a finished execution compared with its Case baseline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkArtifactFile {
    /// Portable path within the final execution workspace.
    pub(crate) path: String,
    /// Final size, or baseline size for a deleted file.
    pub(crate) size_bytes: u64,
    /// Exact comparison against the immutable Case baseline.
    pub(crate) change: String,
}

/// Bounded UTF-8 preview of one final execution artifact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkArtifactPreview {
    /// Portable path within the final execution workspace.
    pub(crate) path: String,
    /// Complete file size before preview truncation.
    pub(crate) size_bytes: u64,
    /// UTF-8 prefix, or absent for binary content.
    pub(crate) text: Option<String>,
    /// Whether trailing bytes were omitted.
    pub(crate) truncated: bool,
}

/// Terminal values persisted together for one execution cell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkExecutionResult {
    /// Agent session identifier retained for diagnostics.
    pub(crate) session_id: Option<String>,
    /// Final Agent response when one was produced.
    pub(crate) response_text: Option<String>,
    /// Normalized execution metrics when the Agent reported them.
    pub(crate) metrics: Option<BenchmarkExecutionMetrics>,
    /// Terminal reason when the cell has no verdict.
    pub(crate) termination_reason: Option<String>,
    /// Deterministic evaluation report when scoring completed.
    pub(crate) report: Option<BenchmarkEvaluationReport>,
    /// Execution completion time in Unix milliseconds.
    pub(crate) finished_at_ms: i64,
}
