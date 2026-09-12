use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
use crate::domain::agent_kind::AgentKind;
use crate::domain::agent_status::AgentLoginStatus;
use crate::domain::benchmark::{safe_asset_id, safe_relative_path, BenchmarkCheck};
use crate::domain::benchmark_task::{
    BenchmarkEvaluationCheck, BenchmarkEvaluationReport, BenchmarkExecutionResult,
    BenchmarkTaskDetail,
};
use crate::domain::benchmark_task::{
    BenchmarkPreflightIssue, BenchmarkPreflightIssueKind, BenchmarkTaskConfiguration,
    BenchmarkTaskPreview,
};
use crate::domain::task::{Task, TaskKind, TaskStatus};
use crate::dto::benchmark_task::BenchmarkAgentRequest;
use crate::error::AppError;
use crate::repositories::benchmark::BenchmarkRepository;
use crate::repositories::benchmark_task::BenchmarkTaskRepository;
use std::collections::HashSet;
use std::path::PathBuf;

/// Benchmark execution configuration is independent of catalog editing and work Task inputs.
#[derive(Clone)]
pub(crate) struct BenchmarkTaskService {
    /// Published definitions and workspace mounts.
    repository: BenchmarkRepository,
    /// Atomic benchmark Task plans and result queries.
    task_repository: BenchmarkTaskRepository,
    /// Root of the immutable input assets.
    asset_directory: PathBuf,
    /// Root of Task-owned baselines and execution artifacts.
    app_data_directory: PathBuf,
    /// V1 uses one global execution slot regardless of page lifecycle.
    execution_lock: std::sync::Arc<tokio::sync::Mutex<()>>,
}

impl BenchmarkTaskService {
    /// Reads only application-owned benchmark materials during preflight.
    pub(crate) fn new(
        repository: BenchmarkRepository,
        task_repository: BenchmarkTaskRepository,
        app_data: PathBuf,
    ) -> Self {
        Self {
            repository,
            task_repository,
            asset_directory: app_data.join("benchmark-assets"),
            app_data_directory: app_data,
            execution_lock: std::sync::Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    /// Creates the complete immutable plan; execution is scheduled separately by the command.
    pub(crate) async fn start(
        &self,
        configuration: BenchmarkTaskConfiguration,
        idempotency_key: &str,
    ) -> Result<BenchmarkTaskDetail, AppError> {
        validate_configuration(&configuration)?;
        if idempotency_key.is_empty() || idempotency_key.len() > 200 {
            return Err(AppError::InvalidBenchmark);
        }
        let request_json = configuration_json(&configuration)?;
        match self
            .task_repository
            .by_idempotency_key(idempotency_key, &request_json)
            .await
        {
            Ok(Some(detail)) => return Ok(detail),
            Ok(None) => {}
            Err(_) => return Err(AppError::BenchmarkConflict),
        }
        let mount = self
            .repository
            .workspace_mount(&configuration.workspace_id, &configuration.mount_id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        if mount.version_id != configuration.expected_version_id {
            return Err(AppError::BenchmarkConflict);
        }
        let benchmark = self
            .repository
            .detail(&mount.benchmark_id, Some(&mount.version_id))
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        if !benchmark.document.publication_issues().is_empty() {
            return Err(AppError::InvalidBenchmark);
        }
        let now = now_ms()?;
        let task = Task {
            id: next_id("benchmark-task")?,
            workspace_id: Some(configuration.workspace_id.clone()),
            title: format!("{} · {now}", benchmark.document.name),
            kind: TaskKind::Benchmark,
            status: TaskStatus::Preparing,
            configuration_locked_at_ms: Some(now),
            pinned_at_ms: None,
            created_at_ms: now,
            updated_at_ms: now,
        };
        self.task_repository
            .create(
                task,
                &configuration,
                &benchmark,
                idempotency_key,
                &request_json,
            )
            .await
            .map_err(|error| {
                if error.to_string().contains("idempotency") {
                    AppError::BenchmarkConflict
                } else {
                    AppError::BenchmarkDatabaseFailed
                }
            })
    }

    /// Restores a benchmark result without using the work-task repository path.
    pub(crate) async fn get(&self, task_id: &str) -> Result<BenchmarkTaskDetail, AppError> {
        self.task_repository
            .get(task_id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)
    }

    /// Sequentially executes every claimed cell and immediately persists its score.
    pub(crate) async fn execute_with(
        &self,
        task_id: &str,
        runner: impl FnMut(BenchmarkAgentRequest) -> Result<AgentSessionRunOutput, AppError>
            + Send
            + 'static,
    ) -> Result<(), AppError> {
        let _execution_slot = self.execution_lock.lock().await;
        let runner = std::sync::Arc::new(std::sync::Mutex::new(runner));
        let detail = self.get(task_id).await?;
        if detail.task.status != TaskStatus::Preparing {
            return Err(AppError::InvalidTask);
        }
        self.task_repository
            .mark_running(task_id, now_ms()?)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?;
        for case in &detail.cases {
            for agent in &detail.agents {
                let execution = detail
                    .executions
                    .iter()
                    .find(|execution| {
                        execution.task_case_id == case.id && execution.task_agent_id == agent.id
                    })
                    .ok_or(AppError::BenchmarkDatabaseFailed)?;
                if !self
                    .task_repository
                    .claim_execution(&execution.id)
                    .await
                    .map_err(|_| AppError::BenchmarkDatabaseFailed)?
                {
                    continue;
                }
                let workspace = match self.prepare_execution(task_id, case, execution).await {
                    Ok(workspace) => workspace,
                    Err(error) => {
                        self.finish_error(&execution.id, &error).await?;
                        continue;
                    }
                };
                self.task_repository
                    .mark_execution_running(&execution.id, now_ms()?)
                    .await
                    .map_err(|_| AppError::BenchmarkDatabaseFailed)?;
                let request = BenchmarkAgentRequest {
                    agent_kind: agent.agent_kind,
                    prompt: case.content.prompt.clone(),
                    working_directory: workspace.clone(),
                    file_access: detail.permissions.file_access.clone(),
                    command_execution: detail.permissions.command_execution.clone(),
                    model: None,
                    mode: None,
                    session_id: None,
                    timeout: std::time::Duration::from_secs(
                        u64::from(case.content.timeout_minutes) * 60,
                    ),
                };
                let call = runner.clone();
                let output = tokio::task::spawn_blocking(move || {
                    let mut call = match call.lock() {
                        Ok(call) => call,
                        Err(poisoned) => poisoned.into_inner(),
                    };
                    call(request)
                })
                .await
                .map_err(|_| AppError::WorkerFailed)?;
                match output {
                    Ok(output) if output.outcome == AgentTurnOutcome::Completed => {
                        let report = evaluate_checks(
                            &case.content.checks,
                            &output.output.response,
                            &workspace,
                        );
                        let metrics = metrics_json(&output.output.metrics);
                        match report {
                            Ok(report) => self
                                .task_repository
                                .finish_execution(
                                    &execution.id,
                                    BenchmarkExecutionResult {
                                        session_id: output.session_id,
                                        response_text: Some(output.output.response),
                                        metrics_json: Some(metrics),
                                        termination_reason: None,
                                        report: Some(report),
                                        finished_at_ms: now_ms()?,
                                    },
                                )
                                .await
                                .map_err(|_| AppError::BenchmarkDatabaseFailed)?,
                            Err(error) => self.finish_error(&execution.id, &error).await?,
                        }
                    }
                    Ok(output) => {
                        let metrics = metrics_json(&output.output.metrics);
                        self.task_repository
                            .finish_execution(
                                &execution.id,
                                BenchmarkExecutionResult {
                                    session_id: output.session_id,
                                    response_text: Some(output.output.response),
                                    metrics_json: Some(metrics),
                                    termination_reason: Some("interaction_required".into()),
                                    report: None,
                                    finished_at_ms: now_ms()?,
                                },
                            )
                            .await
                            .map_err(|_| AppError::BenchmarkDatabaseFailed)?;
                    }
                    Err(error) => self.finish_error(&execution.id, &error).await?,
                }
                self.task_repository
                    .refresh_status(task_id, now_ms()?)
                    .await
                    .map_err(|_| AppError::BenchmarkDatabaseFailed)?;
            }
        }
        self.task_repository
            .refresh_status(task_id, now_ms()?)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }

    async fn finish_error(&self, execution_id: &str, error: &AppError) -> Result<(), AppError> {
        let reason = match error {
            AppError::ClaudeTimedOut
            | AppError::CodexTimedOut
            | AppError::OpenCodeTimedOut
            | AppError::WorkBuddyTimedOut => "timed_out",
            AppError::ClaudeTaskFailed
            | AppError::CodexTaskFailed
            | AppError::OpenCodeTaskFailed
            | AppError::WorkBuddyTaskFailed => "agent_error",
            _ => "evaluation_error",
        };
        let ipc = crate::error::IpcError::from(error.clone());
        self.task_repository
            .finish_execution(
                execution_id,
                BenchmarkExecutionResult {
                    session_id: None,
                    response_text: Some(ipc.message),
                    metrics_json: None,
                    termination_reason: Some(reason.into()),
                    report: None,
                    finished_at_ms: now_ms()?,
                },
            )
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }

    async fn prepare_execution(
        &self,
        task_id: &str,
        case: &crate::domain::benchmark_task::BenchmarkTaskCase,
        execution: &crate::domain::benchmark_task::BenchmarkCaseExecution,
    ) -> Result<PathBuf, AppError> {
        let app_data = self.app_data_directory.clone();
        let assets = self.asset_directory.clone();
        let task_id = task_id.to_string();
        let case = case.clone();
        let execution_id = execution.id.clone();
        tokio::task::spawn_blocking(move || {
            let case_root = app_data
                .join("task-runs")
                .join(&task_id)
                .join("cases")
                .join(&case.id);
            let baseline = case_root.join("baseline");
            if !baseline.exists() {
                std::fs::create_dir_all(&baseline).map_err(|_| AppError::TaskPreparationFailed)?;
                for file in &case.content.input_files {
                    if !safe_relative_path(&file.path) || !safe_asset_id(&file.asset_id) {
                        return Err(AppError::TaskPreparationFailed);
                    }
                    let source = assets.join(&file.asset_id);
                    let metadata = std::fs::symlink_metadata(&source)
                        .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
                    if !metadata.is_file() || metadata.file_type().is_symlink() {
                        return Err(AppError::BenchmarkAssetUnavailable);
                    }
                    let destination = baseline.join(&file.path);
                    if let Some(parent) = destination.parent() {
                        std::fs::create_dir_all(parent)
                            .map_err(|_| AppError::TaskPreparationFailed)?;
                    }
                    std::fs::copy(source, destination)
                        .map_err(|_| AppError::TaskPreparationFailed)?;
                }
            }
            let workspace = case_root
                .join("executions")
                .join(execution_id)
                .join("workspace");
            copy_directory(&baseline, &workspace)?;
            Ok(workspace)
        })
        .await
        .map_err(|_| AppError::WorkerFailed)?
    }

    /// Probes the external product boundary on a blocking worker without loading model settings.
    pub(crate) async fn preview(
        &self,
        configuration: BenchmarkTaskConfiguration,
        mut probe: impl FnMut(AgentKind) -> Result<AgentLoginStatus, AppError> + Send + 'static,
    ) -> Result<BenchmarkTaskPreview, AppError> {
        validate_configuration(&configuration)?;
        let mount = self
            .repository
            .workspace_mount(&configuration.workspace_id, &configuration.mount_id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        if mount.version_id != configuration.expected_version_id {
            return Err(AppError::BenchmarkConflict);
        }
        let benchmark = self
            .repository
            .detail(&mount.benchmark_id, Some(&mount.version_id))
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        // A deleted tag may become Uncategorized; that metadata change does not invalidate a published version.
        if benchmark.document.schema_version != 1
            || benchmark.document.cases.is_empty()
            || benchmark.document.cases.len() > 100
        {
            return Err(AppError::InvalidBenchmark);
        }
        let mut issues = Vec::new();
        for (position, case) in benchmark.document.cases.iter().enumerate() {
            let mut missing_asset = false;
            for file in &case.input_files {
                if !safe_asset_id(&file.asset_id) {
                    missing_asset = true;
                    break;
                }
                match tokio::fs::symlink_metadata(self.asset_directory.join(&file.asset_id)).await {
                    Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
                    _ => {
                        missing_asset = true;
                        break;
                    }
                }
            }
            if missing_asset {
                issues.push(BenchmarkPreflightIssue {
                    kind: BenchmarkPreflightIssueKind::AssetUnavailable,
                    agent_kind: None,
                    case_position: Some(position),
                });
            }
            if case
                .checks
                .iter()
                .any(|check| matches!(check, BenchmarkCheck::Python { .. }))
            {
                issues.push(BenchmarkPreflightIssue {
                    kind: BenchmarkPreflightIssueKind::VerifierUnavailable,
                    agent_kind: None,
                    case_position: Some(position),
                });
            }
        }
        let agent_kinds = configuration.agent_kinds.clone();
        let agent_issues = tokio::task::spawn_blocking(move || {
            agent_kinds
                .into_iter()
                .filter_map(|agent_kind| {
                    let kind = match probe(agent_kind) {
                        Ok(login) if !login.installed => {
                            BenchmarkPreflightIssueKind::AgentNotInstalled
                        }
                        Ok(login) if !login.logged_in => {
                            BenchmarkPreflightIssueKind::AgentNotAuthenticated
                        }
                        Err(_) => BenchmarkPreflightIssueKind::AgentCheckFailed,
                        Ok(_) => return None,
                    };
                    Some(BenchmarkPreflightIssue {
                        kind,
                        agent_kind: Some(agent_kind),
                        case_position: None,
                    })
                })
                .collect::<Vec<_>>()
        })
        .await
        .map_err(|_| AppError::WorkerFailed)?;
        issues.extend(agent_issues);
        Ok(BenchmarkTaskPreview {
            configuration,
            benchmark,
            issues,
        })
    }
}

fn validate_configuration(configuration: &BenchmarkTaskConfiguration) -> Result<(), AppError> {
    if [
        &configuration.workspace_id,
        &configuration.mount_id,
        &configuration.expected_version_id,
    ]
    .iter()
    .any(|id| id.is_empty() || id.len() > 200)
        || configuration.agent_kinds.is_empty()
        || configuration.agent_kinds.len() > 4
        || configuration
            .agent_kinds
            .iter()
            .collect::<HashSet<_>>()
            .len()
            != configuration.agent_kinds.len()
        || !matches!(
            configuration.permissions.file_access.as_str(),
            "read_only" | "allow_edits"
        )
        || !matches!(
            configuration.permissions.command_execution.as_str(),
            "deny" | "ask" | "allow"
        )
    {
        Err(AppError::InvalidBenchmark)
    } else {
        Ok(())
    }
}

fn configuration_json(configuration: &BenchmarkTaskConfiguration) -> Result<String, AppError> {
    serde_json::to_string(&serde_json::json!({
        "workspaceId": configuration.workspace_id,
        "mountId": configuration.mount_id,
        "expectedVersionId": configuration.expected_version_id,
        "agentKinds": configuration.agent_kinds.iter().map(|kind| kind.as_str()).collect::<Vec<_>>(),
        "fileAccess": configuration.permissions.file_access,
        "commandExecution": configuration.permissions.command_execution,
    }))
    .map_err(|_| AppError::InvalidBenchmark)
}

fn next_id(prefix: &str) -> Result<String, AppError> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQUENCE: AtomicU64 = AtomicU64::new(1);
    Ok(format!(
        "{prefix}-{}-{}",
        now_ms()?,
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn now_ms() -> Result<i64, AppError> {
    use std::time::{SystemTime, UNIX_EPOCH};
    i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AppError::InvalidBenchmark)?
            .as_millis(),
    )
    .map_err(|_| AppError::InvalidBenchmark)
}

/// Runs deterministic built-in checks against one immutable execution workspace.
fn evaluate_checks(
    checks: &[BenchmarkCheck],
    response: &str,
    workspace: &std::path::Path,
) -> Result<BenchmarkEvaluationReport, AppError> {
    let mut results = Vec::with_capacity(checks.len());
    for check in checks {
        let result = match check {
            BenchmarkCheck::Answer { expected } => BenchmarkEvaluationCheck {
                kind: "answer".into(),
                path: None,
                passed: response.trim() == expected.trim(),
                message: if response.trim() == expected.trim() {
                    "answer_matched"
                } else {
                    "answer_mismatch"
                }
                .into(),
            },
            BenchmarkCheck::FileExists { path } => {
                let exists = checked_output_file(workspace, path)?.is_some();
                BenchmarkEvaluationCheck {
                    kind: "file_exists".into(),
                    path: Some(path.clone()),
                    passed: exists,
                    message: if exists {
                        "file_exists"
                    } else {
                        "file_missing"
                    }
                    .into(),
                }
            }
            BenchmarkCheck::FileText { path, expected } => {
                let actual = checked_output_file(workspace, path)?
                    .map(std::fs::read_to_string)
                    .transpose()
                    .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
                let passed = actual.as_deref() == Some(expected);
                BenchmarkEvaluationCheck {
                    kind: "file_text".into(),
                    path: Some(path.clone()),
                    passed,
                    message: if passed {
                        "text_matched"
                    } else {
                        "text_mismatch"
                    }
                    .into(),
                }
            }
            BenchmarkCheck::FileJson { path, expected } => {
                let expected: serde_json::Value =
                    serde_json::from_str(expected).map_err(|_| AppError::InvalidBenchmark)?;
                let actual = checked_output_file(workspace, path)?
                    .map(std::fs::read_to_string)
                    .transpose()
                    .map_err(|_| AppError::BenchmarkAssetUnavailable)?
                    .map(|value| serde_json::from_str::<serde_json::Value>(&value))
                    .transpose()
                    .ok()
                    .flatten();
                let passed = actual.as_ref() == Some(&expected);
                BenchmarkEvaluationCheck {
                    kind: "file_json".into(),
                    path: Some(path.clone()),
                    passed,
                    message: if passed {
                        "json_matched"
                    } else {
                        "json_mismatch"
                    }
                    .into(),
                }
            }
            BenchmarkCheck::Python { .. } => return Err(AppError::BenchmarkVerifierUnavailable),
        };
        results.push(result);
    }
    Ok(BenchmarkEvaluationReport {
        passed: results.iter().all(|check| check.passed),
        checks: results,
    })
}

/// Resolves only regular files contained by the execution workspace.
fn checked_output_file(
    workspace: &std::path::Path,
    relative: &str,
) -> Result<Option<PathBuf>, AppError> {
    if !safe_relative_path(relative) {
        return Err(AppError::InvalidBenchmark);
    }
    let path = workspace.join(relative);
    let metadata = match std::fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(AppError::BenchmarkAssetUnavailable),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 1024 * 1024 {
        return Err(AppError::BenchmarkAssetUnavailable);
    }
    let root = std::fs::canonicalize(workspace).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    let canonical =
        std::fs::canonicalize(&path).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    if !canonical.starts_with(root) {
        return Err(AppError::BenchmarkAssetUnavailable);
    }
    Ok(Some(canonical))
}

fn copy_directory(source: &std::path::Path, target: &std::path::Path) -> Result<(), AppError> {
    if target.exists() {
        return Err(AppError::TaskPreparationFailed);
    }
    std::fs::create_dir_all(target).map_err(|_| AppError::TaskPreparationFailed)?;
    for entry in std::fs::read_dir(source).map_err(|_| AppError::TaskPreparationFailed)? {
        let entry = entry.map_err(|_| AppError::TaskPreparationFailed)?;
        let file_type = entry
            .file_type()
            .map_err(|_| AppError::TaskPreparationFailed)?;
        let destination = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory(&entry.path(), &destination)?;
        } else if file_type.is_file() && !file_type.is_symlink() {
            std::fs::copy(entry.path(), destination)
                .map_err(|_| AppError::TaskPreparationFailed)?;
        } else {
            return Err(AppError::TaskPreparationFailed);
        }
    }
    Ok(())
}

fn metrics_json(metrics: &crate::domain::agent_run::AgentRunMetrics) -> String {
    serde_json::json!({
        "totalDurationMs": u64::try_from(metrics.total_duration.as_millis()).unwrap_or(u64::MAX),
        "timeToFirstTokenMs": metrics.time_to_first_token.map(|value| u64::try_from(value.as_millis()).unwrap_or(u64::MAX)),
        "tokenUsage": metrics.token_usage.as_ref().map(|usage| serde_json::json!({
            "totalTokens": usage.total_tokens,
            "inputTokens": usage.input_tokens,
            "cachedInputTokens": usage.cached_input_tokens,
            "cacheWriteInputTokens": usage.cache_write_input_tokens,
            "outputTokens": usage.output_tokens,
            "reasoningOutputTokens": usage.reasoning_output_tokens,
        })),
        "toolCallCount": metrics.tool_calls.len(),
        "toolCalls": metrics.tool_calls.iter().map(|call| serde_json::json!({
            "name": call.name,
            "durationMs": u64::try_from(call.duration.as_millis()).unwrap_or(u64::MAX),
        })).collect::<Vec<_>>(),
    }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::connect_sqlite, migration::Migrator};
    use crate::domain::benchmark::{
        BenchmarkCase, BenchmarkCheck, BenchmarkDocument, BenchmarkFile,
    };
    use crate::domain::task::TaskPermissions;
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::repositories::{task::TaskRepository, workspace::WorkspaceRepository};
    use crate::services::benchmark::BenchmarkService;
    use sea_orm_migration::MigratorTrait;

    #[test]
    fn preview_keeps_all_cases_and_permissions_without_creating_tasks() {
        tauri::async_runtime::block_on(async {
            let database = connect_sqlite("sqlite::memory:").await.expect("database");
            Migrator::up(&database, None).await.expect("schema");
            WorkspaceRepository::new(database.clone())
                .create(NewWorkspace {
                    id: "workspace".into(),
                    name: "Workspace".into(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: PathBuf::from("unused-workspace-input"),
                    created_at_ms: 1,
                })
                .await
                .expect("workspace");
            let repository = BenchmarkRepository::new(database.clone());
            let catalog = BenchmarkService::new(repository.clone(), PathBuf::new());
            let tag = catalog.create_tag("Coding", "Code").await.expect("tag");
            let directory =
                std::env::temp_dir().join(format!("theoria-benchmark-preflight-{}", tag.id));
            tokio::fs::create_dir(&directory)
                .await
                .expect("owned fixture directory");
            tokio::fs::create_dir(directory.join("benchmark-assets"))
                .await
                .expect("asset directory");
            let asset = directory.join("benchmark-assets").join("fixture-input");
            tokio::fs::write(&asset, "starting material")
                .await
                .expect("input asset");
            let catalog = BenchmarkService::new(repository.clone(), directory.clone());
            let document = BenchmarkDocument {
                schema_version: 1,
                name: "Two cases".into(),
                description: "Fixed suite".into(),
                tag_id: Some(tag.id),
                source: None,
                cases: ["First", "Second"]
                    .into_iter()
                    .map(|name| BenchmarkCase {
                        name: name.into(),
                        prompt: "Return 42".into(),
                        timeout_minutes: 1,
                        input_files: vec![BenchmarkFile {
                            path: "input.txt".into(),
                            asset_id: "fixture-input".into(),
                        }],
                        checks: vec![BenchmarkCheck::Answer {
                            expected: "42".into(),
                        }],
                    })
                    .collect(),
            };
            let draft = catalog
                .save_draft(None, None, document.clone())
                .await
                .expect("draft");
            let detail = catalog
                .publish(&draft.id, draft.revision)
                .await
                .expect("publish");
            let mount = catalog
                .mount(
                    "workspace".into(),
                    detail.summary.id.clone(),
                    detail.version_id.clone(),
                )
                .await
                .expect("mount");
            let configuration = BenchmarkTaskConfiguration {
                workspace_id: "workspace".into(),
                mount_id: mount.id,
                expected_version_id: detail.version_id,
                agent_kinds: vec![AgentKind::Claude, AgentKind::Codex],
                permissions: TaskPermissions {
                    file_access: "read_only".into(),
                    command_execution: "deny".into(),
                },
            };
            let service = BenchmarkTaskService::new(
                repository,
                BenchmarkTaskRepository::new(database.clone()),
                directory.clone(),
            );
            let preview = service
                .preview(configuration.clone(), |_| {
                    Ok(AgentLoginStatus {
                        installed: true,
                        logged_in: true,
                        authentication_method: None,
                    })
                })
                .await
                .expect("valid mount should produce a preview");
            assert_eq!(preview.configuration, configuration);
            assert_eq!(preview.benchmark.document.cases, document.cases);
            assert!(preview.issues.is_empty());
            let response = serde_json::to_string(
                &crate::dto::benchmark_task::BenchmarkTaskPreviewResponse::from(preview),
            )
            .expect("IPC preview");
            assert!(response.contains("\"executionCount\":4"));
            assert!(!response.contains("Return 42"));
            assert!(!response.contains("fixture-input"));
            assert!(TaskRepository::new(database.clone())
                .list(Some("workspace"))
                .await
                .expect("tasks")
                .is_empty());

            let mut stale = configuration.clone();
            stale.expected_version_id = "stale-version".into();
            assert!(matches!(
                service
                    .preview(stale, |_| panic!("stale request must not probe agents"))
                    .await,
                Err(AppError::BenchmarkConflict)
            ));
            let mut foreign = configuration.clone();
            foreign.workspace_id = "another-workspace".into();
            assert!(matches!(
                service
                    .preview(foreign, |_| panic!("foreign mount must not probe agents"))
                    .await,
                Err(AppError::BenchmarkNotFound)
            ));
            let mut duplicate = configuration.clone();
            duplicate.agent_kinds = vec![AgentKind::Codex, AgentKind::Codex];
            assert!(matches!(
                service
                    .preview(duplicate, |_| panic!("duplicate products must be rejected"))
                    .await,
                Err(AppError::InvalidBenchmark)
            ));
            let unavailable = service
                .preview(configuration.clone(), |kind| match kind {
                    AgentKind::Claude => Ok(AgentLoginStatus::default()),
                    _ => Err(AppError::WorkerFailed),
                })
                .await
                .expect("probe failures should remain displayable");
            assert_eq!(unavailable.issues.len(), 2);
            assert_eq!(unavailable.benchmark.document.cases.len(), 2);
            tokio::fs::remove_file(&asset)
                .await
                .expect("remove published input");
            let missing = service
                .preview(configuration, |_| {
                    Ok(AgentLoginStatus {
                        installed: true,
                        logged_in: true,
                        authentication_method: None,
                    })
                })
                .await
                .expect("missing materials must remain visible");
            assert_eq!(
                missing
                    .issues
                    .iter()
                    .map(|issue| (issue.kind, issue.case_position))
                    .collect::<Vec<_>>(),
                vec![
                    (BenchmarkPreflightIssueKind::AssetUnavailable, Some(0)),
                    (BenchmarkPreflightIssueKind::AssetUnavailable, Some(1)),
                ]
            );
            database.close().await.expect("close database");
            tokio::fs::remove_dir_all(directory)
                .await
                .expect("clean fixture");
        });
    }

    #[test]
    fn start_atomically_creates_one_task_and_the_complete_execution_matrix() {
        tauri::async_runtime::block_on(async {
            use sea_orm::{ConnectionTrait, Statement};

            let database = connect_sqlite("sqlite::memory:").await.expect("database");
            Migrator::up(&database, None).await.expect("schema");
            WorkspaceRepository::new(database.clone())
                .create(NewWorkspace {
                    id: "workspace".into(),
                    name: "Workspace".into(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: PathBuf::from("unused-workspace-input"),
                    created_at_ms: 1,
                })
                .await
                .expect("workspace");
            let repository = BenchmarkRepository::new(database.clone());
            let catalog = BenchmarkService::new(repository.clone(), PathBuf::new());
            let tag = catalog.create_tag("Coding", "Code").await.expect("tag");
            let document = BenchmarkDocument {
                schema_version: 1,
                name: "Two cases".into(),
                description: "Fixed suite".into(),
                tag_id: Some(tag.id),
                source: None,
                cases: ["First", "Second"]
                    .into_iter()
                    .map(|name| BenchmarkCase {
                        name: name.into(),
                        prompt: "Return 42".into(),
                        timeout_minutes: 1,
                        input_files: Vec::new(),
                        checks: vec![BenchmarkCheck::Answer {
                            expected: "42".into(),
                        }],
                    })
                    .collect(),
            };
            let draft = catalog
                .save_draft(None, None, document)
                .await
                .expect("draft");
            let detail = catalog
                .publish(&draft.id, draft.revision)
                .await
                .expect("publish");
            let mount = catalog
                .mount(
                    "workspace".into(),
                    detail.summary.id,
                    detail.version_id.clone(),
                )
                .await
                .expect("mount");
            let configuration = BenchmarkTaskConfiguration {
                workspace_id: "workspace".into(),
                mount_id: mount.id,
                expected_version_id: detail.version_id,
                agent_kinds: vec![AgentKind::Claude, AgentKind::Codex],
                permissions: TaskPermissions {
                    file_access: "read_only".into(),
                    command_execution: "deny".into(),
                },
            };
            let service = BenchmarkTaskService::new(
                repository,
                BenchmarkTaskRepository::new(database.clone()),
                PathBuf::new(),
            );

            let first = service
                .start(configuration.clone(), "request-1")
                .await
                .expect("task plan");
            let repeated = service
                .start(configuration, "request-1")
                .await
                .expect("idempotent task plan");

            assert_eq!(first.task.id, repeated.task.id);
            assert_eq!(first.task.kind, crate::domain::task::TaskKind::Benchmark);
            assert_eq!(first.agents.len(), 2);
            assert_eq!(first.cases.len(), 2);
            assert_eq!(first.executions.len(), 4);
            let rows = database
                .query_one_raw(Statement::from_string(
                    sea_orm::DatabaseBackend::Sqlite,
                    "SELECT COUNT(*) AS count FROM tasks".to_string(),
                ))
                .await
                .expect("task count")
                .expect("count row")
                .try_get::<i64>("", "count")
                .expect("count");
            assert_eq!(rows, 1);
            database.close().await.expect("close database");
        });
    }

    #[test]
    fn built_in_evaluator_requires_every_answer_file_text_and_json_check() {
        let root = std::env::temp_dir().join(format!(
            "theoria-benchmark-evaluator-{}",
            super::next_id("fixture").expect("fixture id")
        ));
        std::fs::create_dir_all(&root).expect("workspace");
        std::fs::write(root.join("report.txt"), "complete\n").expect("text output");
        std::fs::write(root.join("report.json"), "{\"items\":[1,2],\"ok\":true}")
            .expect("json output");
        let checks = vec![
            BenchmarkCheck::Answer {
                expected: "42".into(),
            },
            BenchmarkCheck::FileExists {
                path: "report.txt".into(),
            },
            BenchmarkCheck::FileText {
                path: "report.txt".into(),
                expected: "complete\n".into(),
            },
            BenchmarkCheck::FileJson {
                path: "report.json".into(),
                expected: "{\"ok\":true,\"items\":[1,2]}".into(),
            },
        ];

        let passed = super::evaluate_checks(&checks, " 42\n", &root).expect("evaluation");
        assert!(passed.passed);
        assert_eq!(passed.checks.len(), 4);
        let failed = super::evaluate_checks(&checks, "forty-two", &root).expect("evaluation");
        assert!(!failed.passed);
        assert!(!failed.checks[0].passed);

        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn executor_runs_every_planned_cell_with_permissions_and_without_model_overrides() {
        tauri::async_runtime::block_on(async {
            use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
            use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput};
            use sea_orm::{ConnectionTrait, Statement};
            use std::time::Duration;

            let database = connect_sqlite("sqlite::memory:").await.expect("database");
            Migrator::up(&database, None).await.expect("schema");
            WorkspaceRepository::new(database.clone())
                .create(NewWorkspace {
                    id: "workspace".into(),
                    name: "Workspace".into(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: PathBuf::from("unused"),
                    created_at_ms: 1,
                })
                .await
                .expect("workspace");
            let root = std::env::temp_dir().join(super::next_id("executor").expect("id"));
            std::fs::create_dir_all(&root).expect("app data");
            let repository = BenchmarkRepository::new(database.clone());
            let catalog = BenchmarkService::new(repository.clone(), root.clone());
            let tag = catalog.create_tag("Coding", "Code").await.expect("tag");
            let draft = catalog
                .save_draft(
                    None,
                    None,
                    BenchmarkDocument {
                        schema_version: 1,
                        name: "Two cases".into(),
                        description: "Fixed suite".into(),
                        tag_id: Some(tag.id),
                        source: None,
                        cases: ["First", "Second"]
                            .into_iter()
                            .map(|name| BenchmarkCase {
                                name: name.into(),
                                prompt: "Return 42".into(),
                                timeout_minutes: 1,
                                input_files: Vec::new(),
                                checks: vec![BenchmarkCheck::Answer {
                                    expected: "42".into(),
                                }],
                            })
                            .collect(),
                    },
                )
                .await
                .expect("draft");
            let published = catalog
                .publish(&draft.id, draft.revision)
                .await
                .expect("publish");
            let mount = catalog
                .mount(
                    "workspace".into(),
                    published.summary.id,
                    published.version_id.clone(),
                )
                .await
                .expect("mount");
            let service = BenchmarkTaskService::new(
                repository,
                BenchmarkTaskRepository::new(database.clone()),
                root.clone(),
            );
            let planned = service
                .start(
                    BenchmarkTaskConfiguration {
                        workspace_id: "workspace".into(),
                        mount_id: mount.id,
                        expected_version_id: published.version_id,
                        agent_kinds: vec![AgentKind::Claude, AgentKind::Codex],
                        permissions: TaskPermissions {
                            file_access: "read_only".into(),
                            command_execution: "deny".into(),
                        },
                    },
                    "execution-request",
                )
                .await
                .expect("plan");
            let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let runner_calls = calls.clone();
            service
                .execute_with(&planned.task.id, move |request| {
                    let call = runner_calls.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                    assert_eq!(request.file_access, "read_only");
                    assert_eq!(request.command_execution, "deny");
                    assert!(request.model.is_none());
                    assert!(request.session_id.is_none());
                    Ok(AgentSessionRunOutput {
                        output: AgentRunOutput {
                            response: "42".into(),
                            metrics: AgentRunMetricsCollector::default()
                                .finish(Duration::from_millis(5)),
                        },
                        session_id: Some(format!("session-{call}")),
                        outcome: AgentTurnOutcome::Completed,
                    })
                })
                .await
                .expect("execution");

            assert_eq!(calls.load(std::sync::atomic::Ordering::Relaxed), 4);
            let completed = service.get(&planned.task.id).await.expect("detail");
            assert_eq!(completed.task.status, TaskStatus::Completed);
            assert_eq!(completed.result_completeness, "complete");
            assert!(completed
                .executions
                .iter()
                .all(|execution| execution.verdict.as_deref() == Some("passed")));
            let count = database
                .query_one_raw(Statement::from_string(
                    sea_orm::DatabaseBackend::Sqlite,
                    "SELECT COUNT(*) AS count FROM benchmark_evaluations",
                ))
                .await
                .expect("query")
                .expect("row")
                .try_get::<i64>("", "count")
                .expect("count");
            assert_eq!(count, 4);
            database.close().await.expect("close");
            std::fs::remove_dir_all(root).expect("cleanup");
        });
    }
}
