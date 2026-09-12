use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark_task::{
    BenchmarkPreflightIssueKind, BenchmarkTaskConfiguration, BenchmarkTaskDetail,
    BenchmarkTaskPreview,
};
use crate::domain::task::TaskPermissions;
use crate::dto::task::TaskResponse;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;

/// Complete owned request passed from the Benchmark orchestrator to the Agent runtime.
#[derive(Debug, Clone)]
pub(crate) struct BenchmarkAgentRequest {
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
    pub(crate) workspace_id: String,
    pub(crate) mount_id: String,
    pub(crate) expected_version_id: String,
    pub(crate) agent_kinds: Vec<String>,
    pub(crate) file_access: String,
    pub(crate) command_execution: String,
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
    pub(crate) task_id: String,
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
    task: TaskResponse,
    benchmark_id: String,
    benchmark_name: String,
    version_id: String,
    version_number: i64,
    rerun_of_task_id: Option<String>,
    result_completeness: String,
    completion_reason: Option<String>,
    cancel_requested: bool,
    file_access: String,
    command_execution: String,
    progress: BenchmarkTaskProgressResponse,
    agents: Vec<BenchmarkTaskAgentResponse>,
    cases: Vec<BenchmarkTaskCaseResponse>,
    executions: Vec<BenchmarkCaseExecutionResponse>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkTaskProgressResponse {
    total: usize,
    finished: usize,
    passed: usize,
    failed: usize,
    errors: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkTaskAgentResponse {
    id: String,
    agent_kind: &'static str,
    position: usize,
    passed: usize,
    failed: usize,
    total: usize,
    pass_rate: Option<f64>,
    total_duration_ms: u64,
    duration_coverage: usize,
    total_tokens: u64,
    token_coverage: usize,
    tool_call_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkTaskCaseResponse {
    id: String,
    case_id: String,
    position: usize,
    name: String,
    prompt: String,
    timeout_minutes: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkCaseExecutionResponse {
    id: String,
    task_case_id: String,
    task_agent_id: String,
    phase: String,
    result: String,
    termination_reason: Option<String>,
    response_text: Option<String>,
    metrics: Option<serde_json::Value>,
    started_at_ms: Option<i64>,
    finished_at_ms: Option<i64>,
    verdict: Option<String>,
    report: Option<serde_json::Value>,
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
                    .filter_map(|execution| execution.metrics_json.as_deref())
                    .filter_map(|value| serde_json::from_str::<serde_json::Value>(value).ok())
                    .collect::<Vec<_>>();
                let total_duration_ms = metrics
                    .iter()
                    .filter_map(|metric| metric["totalDurationMs"].as_u64())
                    .sum();
                let duration_coverage = metrics
                    .iter()
                    .filter(|metric| metric["totalDurationMs"].is_u64())
                    .count();
                let total_tokens = metrics
                    .iter()
                    .filter_map(|metric| metric["tokenUsage"]["totalTokens"].as_u64())
                    .sum();
                let token_coverage = metrics
                    .iter()
                    .filter(|metric| metric["tokenUsage"]["totalTokens"].is_u64())
                    .count();
                let tool_call_count = metrics
                    .iter()
                    .filter_map(|metric| metric["toolCallCount"].as_u64())
                    .sum();
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
                        metrics: execution
                            .metrics_json
                            .and_then(|value| serde_json::from_str(&value).ok()),
                        started_at_ms: execution.started_at_ms,
                        finished_at_ms: execution.finished_at_ms,
                        verdict: execution.verdict,
                        report: execution
                            .report_json
                            .and_then(|value| serde_json::from_str(&value).ok()),
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
