use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark_task::{
    BenchmarkPreflightIssueKind, BenchmarkTaskConfiguration, BenchmarkTaskPreview,
};
use crate::domain::task::TaskPermissions;
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
}
