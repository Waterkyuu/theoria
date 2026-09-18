use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark_task::{
    BenchmarkArtifactFile, BenchmarkArtifactPreview, BenchmarkEvaluationReport,
    BenchmarkExecutionMetrics, BenchmarkPreflightIssueKind, BenchmarkRerunConfiguration,
    BenchmarkTaskConfiguration, BenchmarkTaskDetail, BenchmarkTaskPreview,
};
use crate::domain::task::TaskPermissions;
use crate::dto::task::TaskResponse;
use crate::error::AppError;
use serde::{Deserialize, Serialize};

/// A complete suite and explicit permissions; model overrides and case subsets are not accepted.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreviewBenchmarkTaskRequest {
    /// Owning workspace.
    pub(crate) workspace_id: String,
    /// Mount selected inside that workspace.
    pub(crate) mount_id: String,
    /// Fixed version shown by the form.
    pub(crate) expected_version_id: String,
    /// Ordered unique local product identifiers.
    pub(crate) agent_kinds: Vec<String>,
    /// Explicit file permission.
    pub(crate) file_access: String,
    /// Explicit command permission.
    pub(crate) command_execution: String,
}

impl TryFrom<PreviewBenchmarkTaskRequest> for BenchmarkTaskConfiguration {
    type Error = AppError;

    fn try_from(request: PreviewBenchmarkTaskRequest) -> Result<Self, Self::Error> {
        let agent_kinds = request
            .agent_kinds
            .iter()
            .map(|kind| AgentKind::parse(kind).ok_or(AppError::InvalidBenchmark))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            workspace_id: request.workspace_id,
            mount_id: request.mount_id,
            expected_version_id: request.expected_version_id,
            agent_kinds,
            permissions: TaskPermissions {
                file_access: request.file_access,
                command_execution: request.command_execution,
            },
        })
    }
}

/// Launch request adds only retry identity to the exact previewed configuration.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct StartBenchmarkTaskRequest {
    /// Owning workspace.
    pub(crate) workspace_id: String,
    /// Mount selected inside that workspace.
    pub(crate) mount_id: String,
    /// Fixed version shown by the form.
    pub(crate) expected_version_id: String,
    /// Ordered unique local product identifiers.
    pub(crate) agent_kinds: Vec<String>,
    /// Explicit file permission.
    pub(crate) file_access: String,
    /// Explicit command permission.
    pub(crate) command_execution: String,
    /// Client retry identity for this exact launch request.
    pub(crate) idempotency_key: String,
}

impl TryFrom<&StartBenchmarkTaskRequest> for BenchmarkTaskConfiguration {
    type Error = AppError;

    fn try_from(request: &StartBenchmarkTaskRequest) -> Result<Self, Self::Error> {
        PreviewBenchmarkTaskRequest {
            workspace_id: request.workspace_id.clone(),
            mount_id: request.mount_id.clone(),
            expected_version_id: request.expected_version_id.clone(),
            agent_kinds: request.agent_kinds.clone(),
            file_access: request.file_access.clone(),
            command_execution: request.command_execution.clone(),
        }
        .try_into()
    }
}

/// Exact benchmark Task selected by the unified task header route.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GetBenchmarkTaskRequest {
    /// Benchmark Task selected by the shared workspace route.
    pub(crate) task_id: String,
}

/// Selects one execution whose files belong to the requested Benchmark Task.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ListBenchmarkExecutionArtifactsRequest {
    /// Benchmark Task that owns the execution cell.
    pub(crate) task_id: String,
    /// Finished execution whose final files are requested.
    pub(crate) execution_id: String,
}

/// Selects one safe relative final-artifact path for bounded preview.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreviewBenchmarkExecutionArtifactRequest {
    /// Benchmark Task that owns the execution cell.
    pub(crate) task_id: String,
    /// Finished execution that owns the requested file.
    pub(crate) execution_id: String,
    /// Portable final-workspace path selected by the user.
    pub(crate) path: String,
}

/// Rerun request changes only products and permissions while preserving the source version.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RerunBenchmarkTaskRequest {
    /// Terminal Benchmark Task used as the immutable source.
    pub(crate) source_task_id: String,
    /// Ordered unique local product identifiers.
    pub(crate) agent_kinds: Vec<String>,
    /// Explicit file permission for the new Task.
    pub(crate) file_access: String,
    /// Explicit command permission for the new Task.
    pub(crate) command_execution: String,
    /// User confirmation to restore an absent historical mount.
    pub(crate) restore_mount: bool,
    /// Retry identity for exactly this Rerun submission.
    pub(crate) idempotency_key: String,
}

impl TryFrom<&RerunBenchmarkTaskRequest> for BenchmarkRerunConfiguration {
    type Error = AppError;

    fn try_from(request: &RerunBenchmarkTaskRequest) -> Result<Self, Self::Error> {
        let agent_kinds = request
            .agent_kinds
            .iter()
            .map(|kind| AgentKind::parse(kind).ok_or(AppError::InvalidBenchmark))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            source_task_id: request.source_task_id.clone(),
            agent_kinds,
            permissions: TaskPermissions {
                file_access: request.file_access.clone(),
                command_execution: request.command_execution.clone(),
            },
            restore_mount: request.restore_mount,
        })
    }
}

/// Lightweight launch configuration preview, without prompts, expected answers or asset paths.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkTaskPreviewResponse {
    /// Selected fixed version.
    version_id: String,
    /// Display version number.
    version_number: i64,
    /// Benchmark display name.
    name: String,
    /// All cases in published order.
    cases: Vec<BenchmarkTaskCasePreviewResponse>,
    /// Product choices in display order.
    agent_kinds: Vec<&'static str>,
    /// Number of planned Case × Agent executions.
    execution_count: usize,
    /// Echoed explicit file policy.
    file_access: String,
    /// Echoed explicit command policy.
    command_execution: String,
    /// Known prerequisites requiring attention; an empty list does not reserve execution resources.
    issues: Vec<BenchmarkPreflightIssueResponse>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkTaskCasePreviewResponse {
    /// Zero-based position in the immutable suite.
    position: usize,
    /// Human-readable case name.
    name: String,
    /// Per-execution time limit, excluding queue time.
    timeout_minutes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkPreflightIssueResponse {
    /// Stable localization key suffix.
    code: &'static str,
    /// Affected local product, when applicable.
    agent_kind: Option<&'static str>,
    /// Affected case, when applicable.
    case_position: Option<usize>,
}

impl From<BenchmarkTaskPreview> for BenchmarkTaskPreviewResponse {
    fn from(preview: BenchmarkTaskPreview) -> Self {
        let configuration = preview.configuration;
        Self {
            version_id: preview.benchmark.version_id,
            version_number: preview.benchmark.version_number,
            name: preview.benchmark.document.name,
            execution_count: preview.benchmark.document.cases.len()
                * configuration.agent_kinds.len(),
            cases: preview
                .benchmark
                .document
                .cases
                .into_iter()
                .enumerate()
                .map(|(position, case)| BenchmarkTaskCasePreviewResponse {
                    position,
                    name: case.name,
                    timeout_minutes: case.timeout_minutes,
                })
                .collect(),
            agent_kinds: configuration
                .agent_kinds
                .into_iter()
                .map(AgentKind::as_str)
                .collect(),
            file_access: configuration.permissions.file_access,
            command_execution: configuration.permissions.command_execution,
            issues: preview
                .issues
                .into_iter()
                .map(|issue| BenchmarkPreflightIssueResponse {
                    code: match issue.kind {
                        BenchmarkPreflightIssueKind::AgentNotInstalled => "agent_not_installed",
                        BenchmarkPreflightIssueKind::AgentNotAuthenticated => {
                            "agent_not_authenticated"
                        }
                        BenchmarkPreflightIssueKind::AgentCheckFailed => "agent_check_failed",
                        BenchmarkPreflightIssueKind::AssetUnavailable => "asset_unavailable",
                        BenchmarkPreflightIssueKind::VerifierUnavailable => "verifier_unavailable",
                    },
                    agent_kind: issue.agent_kind.map(AgentKind::as_str),
                    case_position: issue.case_position,
                })
                .collect(),
        }
    }
}

/// Full bounded V1 result view; individual files remain represented by managed paths.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkTaskDetailResponse {
    /// Common Task identity and lifecycle.
    task: TaskResponse,
    /// Published definition used by the Task.
    benchmark_id: String,
    /// Display name captured for the result header.
    benchmark_name: String,
    /// Immutable published version executed by the Task.
    version_id: String,
    /// User-visible version number.
    version_number: i64,
    /// Historical Task that initiated this Rerun, when present.
    rerun_of_task_id: Option<String>,
    /// Whether every planned cell has a complete normal result.
    result_completeness: String,
    /// Stable reason for an incomplete result matrix.
    completion_reason: Option<String>,
    /// Whether the user requested cancellation.
    cancel_requested: bool,
    /// Frozen file access policy.
    file_access: String,
    /// Frozen command execution policy.
    command_execution: String,
    /// Aggregate matrix completion counts.
    progress: BenchmarkTaskProgressResponse,
    /// Matrix columns and per-Agent aggregates.
    agents: Vec<BenchmarkTaskAgentResponse>,
    /// Frozen matrix rows in published order.
    cases: Vec<BenchmarkTaskCaseResponse>,
    /// Complete Case × Agent result matrix.
    executions: Vec<BenchmarkCaseExecutionResponse>,
}

/// One final artifact with its comparison against the Case baseline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkArtifactFileResponse {
    /// Portable path within the final execution workspace.
    path: String,
    /// Final size, or baseline size for a deleted file.
    size_bytes: u64,
    /// Exact comparison against the immutable Case baseline.
    change: String,
}

impl From<BenchmarkArtifactFile> for BenchmarkArtifactFileResponse {
    fn from(file: BenchmarkArtifactFile) -> Self {
        Self {
            path: file.path,
            size_bytes: file.size_bytes,
            change: file.change,
        }
    }
}

/// Bounded text preview that never exposes a native file path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkArtifactPreviewResponse {
    /// Portable path within the final execution workspace.
    path: String,
    /// Complete file size before preview truncation.
    size_bytes: u64,
    /// UTF-8 prefix, or absent for binary content.
    text: Option<String>,
    /// Whether trailing bytes were omitted.
    truncated: bool,
}

impl From<BenchmarkArtifactPreview> for BenchmarkArtifactPreviewResponse {
    fn from(preview: BenchmarkArtifactPreview) -> Self {
        Self {
            path: preview.path,
            size_bytes: preview.size_bytes,
            text: preview.text,
            truncated: preview.truncated,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkTaskProgressResponse {
    /// Number of planned matrix cells.
    total: usize,
    /// Number of terminal matrix cells.
    finished: usize,
    /// Number of passing evaluations.
    passed: usize,
    /// Number of failing evaluations.
    failed: usize,
    /// Number of terminal cells without an evaluation verdict.
    errors: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkTaskAgentResponse {
    /// Stable Task Agent row identifier.
    id: String,
    /// Local Agent product selected for this column.
    agent_kind: &'static str,
    /// Stable matrix column order.
    position: usize,
    /// Number of passing evaluations for this Agent.
    passed: usize,
    /// Number of failing evaluations for this Agent.
    failed: usize,
    /// Number of planned Cases for this Agent.
    total: usize,
    /// Complete pass rate, absent until every Case is countable.
    pass_rate: Option<f64>,
    /// Sum of reported execution durations.
    total_duration_ms: u64,
    /// Number of executions contributing duration data.
    duration_coverage: usize,
    /// Sum of reported token totals.
    total_tokens: u64,
    /// Number of executions contributing token data.
    token_coverage: usize,
    /// Sum of reported tool-call counts.
    tool_call_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkTaskCaseResponse {
    /// Stable Task Case row identifier.
    id: String,
    /// Published immutable Case identifier.
    case_id: String,
    /// Stable matrix row order.
    position: usize,
    /// User-visible Case name.
    name: String,
    /// Complete requirements sent to every selected Agent.
    prompt: String,
    /// Per-execution deadline in minutes.
    timeout_minutes: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkCaseExecutionResponse {
    /// Stable execution cell identifier.
    id: String,
    /// Frozen Task Case row used by this cell.
    task_case_id: String,
    /// Frozen Task Agent row used by this cell.
    task_agent_id: String,
    /// Stable preparation, running, or finished phase.
    phase: String,
    /// Verdict, terminal reason, or current phase displayed in the matrix.
    result: String,
    /// Terminal reason when the cell has no verdict.
    termination_reason: Option<String>,
    /// Final Agent response when one was produced.
    response_text: Option<String>,
    /// Typed normalized metrics when the Agent reported them.
    metrics: Option<BenchmarkExecutionMetrics>,
    /// Execution start time in Unix milliseconds.
    started_at_ms: Option<i64>,
    /// Execution completion time in Unix milliseconds.
    finished_at_ms: Option<i64>,
    /// Passed or failed evaluation verdict.
    verdict: Option<String>,
    /// Typed deterministic evaluation report.
    report: Option<BenchmarkEvaluationReport>,
}

impl From<BenchmarkTaskDetail> for BenchmarkTaskDetailResponse {
    fn from(detail: BenchmarkTaskDetail) -> Self {
        let total = detail.executions.len();
        let finished = detail
            .executions
            .iter()
            .filter(|execution| execution.phase == "finished")
            .count();
        let passed = detail
            .executions
            .iter()
            .filter(|execution| execution.verdict.as_deref() == Some("passed"))
            .count();
        let failed = detail
            .executions
            .iter()
            .filter(|execution| execution.verdict.as_deref() == Some("failed"))
            .count();
        let errors = finished.saturating_sub(passed + failed);
        let agents = detail
            .agents
            .iter()
            .map(|agent| {
                let cells = detail
                    .executions
                    .iter()
                    .filter(|execution| execution.task_agent_id == agent.id)
                    .collect::<Vec<_>>();
                let passed = cells
                    .iter()
                    .filter(|execution| execution.verdict.as_deref() == Some("passed"))
                    .count();
                let failed = cells
                    .iter()
                    .filter(|execution| {
                        execution.verdict.as_deref() == Some("failed")
                            || matches!(
                                execution.termination_reason.as_deref(),
                                Some("timed_out" | "agent_error")
                            )
                    })
                    .count();
                let metrics = cells
                    .iter()
                    .filter_map(|execution| execution.metrics.as_ref())
                    .collect::<Vec<_>>();
                let total_duration_ms = metrics.iter().map(|metric| metric.total_duration_ms).sum();
                let duration_coverage = metrics.len();
                let total_tokens = metrics
                    .iter()
                    .filter_map(|metric| metric.token_usage.as_ref())
                    .map(|usage| usage.total_tokens)
                    .sum();
                let token_coverage = metrics
                    .iter()
                    .filter(|metric| metric.token_usage.is_some())
                    .count();
                let tool_call_count = metrics.iter().map(|metric| metric.tool_call_count).sum();
                let countable = passed + failed;
                BenchmarkTaskAgentResponse {
                    id: agent.id.clone(),
                    agent_kind: agent.agent_kind.as_str(),
                    position: agent.position,
                    passed,
                    failed,
                    total: detail.cases.len(),
                    pass_rate: (countable == detail.cases.len())
                        .then(|| passed as f64 / detail.cases.len() as f64),
                    total_duration_ms,
                    duration_coverage,
                    total_tokens,
                    token_coverage,
                    tool_call_count,
                }
            })
            .collect();
        Self {
            task: detail.task.into(),
            benchmark_id: detail.benchmark_id,
            benchmark_name: detail.benchmark_name,
            version_id: detail.version_id,
            version_number: detail.version_number,
            rerun_of_task_id: detail.rerun_of_task_id,
            result_completeness: detail.result_completeness,
            completion_reason: detail.completion_reason,
            cancel_requested: detail.cancel_requested,
            file_access: detail.permissions.file_access,
            command_execution: detail.permissions.command_execution,
            progress: BenchmarkTaskProgressResponse {
                total,
                finished,
                passed,
                failed,
                errors,
            },
            agents,
            cases: detail
                .cases
                .into_iter()
                .map(|case| BenchmarkTaskCaseResponse {
                    id: case.id,
                    case_id: case.case_id,
                    position: case.position,
                    name: case.content.name,
                    prompt: case.content.prompt,
                    timeout_minutes: case.content.timeout_minutes,
                })
                .collect(),
            executions: detail
                .executions
                .into_iter()
                .map(|execution| {
                    let result = execution
                        .verdict
                        .clone()
                        .or_else(|| execution.termination_reason.clone())
                        .unwrap_or_else(|| execution.phase.clone());
                    BenchmarkCaseExecutionResponse {
                        id: execution.id,
                        task_case_id: execution.task_case_id,
                        task_agent_id: execution.task_agent_id,
                        phase: execution.phase,
                        result,
                        termination_reason: execution.termination_reason,
                        response_text: execution.response_text,
                        metrics: execution.metrics,
                        started_at_ms: execution.started_at_ms,
                        finished_at_ms: execution.finished_at_ms,
                        verdict: execution.verdict,
                        report: execution.report,
                    }
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::PreviewBenchmarkTaskRequest;

    #[test]
    fn launch_contract_requires_permissions_and_rejects_model_overrides() {
        let payload = r#"{"workspaceId":"workspace","mountId":"mount","expectedVersionId":"version","agentKinds":["codex"],"fileAccess":"allow_edits","commandExecution":"allow"}"#;
        assert!(serde_json::from_str::<PreviewBenchmarkTaskRequest>(payload).is_ok());
        for forbidden in [r#", "model":"override""#, r#", "caseIds":["subset"]"#] {
            let request = format!("{}{}{}", &payload[..payload.len() - 1], forbidden, "}");
            assert!(serde_json::from_str::<PreviewBenchmarkTaskRequest>(&request).is_err());
        }
        let missing = payload.replace(r#","fileAccess":"allow_edits""#, "");
        assert!(serde_json::from_str::<PreviewBenchmarkTaskRequest>(&missing).is_err());
    }

    #[test]
    fn start_contract_requires_an_idempotency_key_and_rejects_model_overrides() {
        let payload = r#"{"workspaceId":"workspace","mountId":"mount","expectedVersionId":"version","agentKinds":["codex"],"fileAccess":"allow_edits","commandExecution":"allow","idempotencyKey":"request-1"}"#;
        assert!(serde_json::from_str::<super::StartBenchmarkTaskRequest>(payload).is_ok());
        let forbidden = payload.replace(
            r#","idempotencyKey":"request-1"}"#,
            r#","model":"override","idempotencyKey":"request-1"}"#,
        );
        assert!(serde_json::from_str::<super::StartBenchmarkTaskRequest>(&forbidden).is_err());
    }
}
