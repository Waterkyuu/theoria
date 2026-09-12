use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
use crate::adapters::benchmark_verifier::BenchmarkVerifier;
use crate::domain::agent_kind::AgentKind;
use crate::domain::agent_status::AgentLoginStatus;
use crate::domain::benchmark::{safe_asset_id, safe_relative_path, BenchmarkCheck};
use crate::domain::benchmark_task::{
    BenchmarkArtifactFile, BenchmarkArtifactPreview, BenchmarkEvaluationCheck,
    BenchmarkEvaluationReport, BenchmarkExecutionResult, BenchmarkRerunConfiguration,
    BenchmarkTaskDetail, NewBenchmarkTaskPlan,
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
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

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
    execution_lock: Arc<tokio::sync::Mutex<()>>,
    /// Task identifiers paired with cancellation signals owned by this service.
    active_tasks: ActiveBenchmarkTasks,
    /// Controlled validator runtime shared by preflight and scoring.
    verifier: Arc<dyn BenchmarkVerifier>,
}

impl BenchmarkTaskService {
    /// Reads only application-owned benchmark materials during preflight.
    pub(crate) fn new(
        repository: BenchmarkRepository,
        task_repository: BenchmarkTaskRepository,
        app_data: PathBuf,
        verifier: Arc<dyn BenchmarkVerifier>,
    ) -> Self {
        Self {
            repository,
            task_repository,
            asset_directory: app_data.join("benchmark-assets"),
            app_data_directory: app_data,
            execution_lock: Arc::new(tokio::sync::Mutex::new(())),
            active_tasks: ActiveBenchmarkTasks::default(),
            verifier,
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
            .create(NewBenchmarkTaskPlan {
                task,
                benchmark,
                agent_kinds: configuration.agent_kinds,
                permissions: configuration.permissions,
                idempotency_key: idempotency_key.to_string(),
                request_json,
                rerun_of_task_id: None,
                restored_mount: None,
            })
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

    /// Preserves completed cells and marks abandoned process-owned work as interrupted.
    pub(crate) async fn recover_interrupted(&self) -> Result<u64, AppError> {
        self.task_repository
            .recover_interrupted(now_ms()?)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }

    /// Lists final regular files and their change from the immutable Case baseline.
    pub(crate) async fn execution_artifacts(
        &self,
        task_id: &str,
        execution_id: &str,
    ) -> Result<Vec<BenchmarkArtifactFile>, AppError> {
        let (baseline, workspace, finished) = self.execution_roots(task_id, execution_id).await?;
        if !finished {
            return Ok(Vec::new());
        }
        tokio::task::spawn_blocking(move || compare_artifacts(&baseline, &workspace))
            .await
            .map_err(|_| AppError::WorkerFailed)?
    }

    /// Reads only one bounded regular file owned by the selected execution.
    pub(crate) async fn execution_artifact_preview(
        &self,
        task_id: &str,
        execution_id: &str,
        path: &str,
    ) -> Result<BenchmarkArtifactPreview, AppError> {
        if !safe_relative_path(path) {
            return Err(AppError::InvalidBenchmark);
        }
        let (baseline, workspace, finished) = self.execution_roots(task_id, execution_id).await?;
        drop(baseline);
        if !finished {
            return Err(AppError::InvalidTask);
        }
        let path = path.to_string();
        tokio::task::spawn_blocking(move || preview_artifact(&workspace, &path))
            .await
            .map_err(|_| AppError::WorkerFailed)?
    }

    async fn execution_roots(
        &self,
        task_id: &str,
        execution_id: &str,
    ) -> Result<(PathBuf, PathBuf, bool), AppError> {
        let detail = self.get(task_id).await?;
        let execution = detail
            .executions
            .iter()
            .find(|execution| execution.id == execution_id)
            .ok_or(AppError::TaskNotFound)?;
        let case = detail
            .cases
            .iter()
            .find(|case| case.id == execution.task_case_id)
            .ok_or(AppError::BenchmarkDatabaseFailed)?;
        let case_root = self
            .app_data_directory
            .join("task-runs")
            .join(task_id)
            .join("cases")
            .join(&case.id);
        Ok((
            case_root.join("baseline"),
            case_root
                .join("executions")
                .join(execution_id)
                .join("workspace"),
            execution.phase == "finished",
        ))
    }

    /// Creates a new complete Task from a terminal Task's immutable published version.
    pub(crate) async fn rerun(
        &self,
        configuration: BenchmarkRerunConfiguration,
        idempotency_key: &str,
    ) -> Result<BenchmarkTaskDetail, AppError> {
        validate_rerun_configuration(&configuration)?;
        if idempotency_key.is_empty() || idempotency_key.len() > 200 {
            return Err(AppError::InvalidBenchmark);
        }
        let request_json = rerun_configuration_json(&configuration)?;
        match self
            .task_repository
            .by_idempotency_key(idempotency_key, &request_json)
            .await
        {
            Ok(Some(detail)) => return Ok(detail),
            Ok(None) => {}
            Err(_) => return Err(AppError::BenchmarkConflict),
        }
        let source = self.get(&configuration.source_task_id).await?;
        if !matches!(
            source.task.status,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped
        ) {
            return Err(AppError::InvalidTask);
        }
        let workspace_id = source
            .task
            .workspace_id
            .clone()
            .ok_or(AppError::InvalidTask)?;
        let benchmark = self
            .repository
            .detail(&source.benchmark_id, Some(&source.version_id))
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        let current_mount = self
            .task_repository
            .mount_for_benchmark(&workspace_id, &source.benchmark_id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?;
        let restored_mount = if current_mount.is_none() {
            if !configuration.restore_mount {
                return Err(AppError::BenchmarkMountRequired);
            }
            Some(crate::domain::benchmark::BenchmarkMount {
                id: next_id("mount")?,
                workspace_id: workspace_id.clone(),
                benchmark_id: source.benchmark_id.clone(),
                version_id: source.version_id.clone(),
                created_at_ms: now_ms()?,
            })
        } else {
            None
        };
        let now = now_ms()?;
        let task = Task {
            id: next_id("benchmark-task")?,
            workspace_id: Some(workspace_id),
            title: format!("{} · {now}", benchmark.document.name),
            kind: TaskKind::Benchmark,
            status: TaskStatus::Preparing,
            configuration_locked_at_ms: Some(now),
            pinned_at_ms: None,
            created_at_ms: now,
            updated_at_ms: now,
        };
        self.task_repository
            .create(NewBenchmarkTaskPlan {
                task,
                benchmark,
                agent_kinds: configuration.agent_kinds,
                permissions: configuration.permissions,
                idempotency_key: idempotency_key.to_string(),
                request_json,
                rerun_of_task_id: Some(configuration.source_task_id),
                restored_mount,
            })
            .await
            .map_err(|error| {
                if error.to_string().contains("idempotency") {
                    AppError::BenchmarkConflict
                } else {
                    AppError::BenchmarkDatabaseFailed
                }
            })
    }

    /// Stops new matrix claims and signals the one active Agent owned by this Task.
    pub(crate) async fn cancel(&self, task_id: &str) -> Result<BenchmarkTaskDetail, AppError> {
        let detail = self.get(task_id).await?;
        if matches!(
            detail.task.status,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped
        ) {
            return Ok(detail);
        }
        self.task_repository
            .request_cancel(task_id, now_ms()?)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?;
        self.active_tasks.stop(task_id);
        self.task_repository
            .refresh_status(task_id, now_ms()?)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?;
        self.get(task_id).await
    }

    /// Sequentially executes every claimed cell and immediately persists its score.
    pub(crate) async fn execute_with(
        &self,
        task_id: &str,
        runner: impl FnMut(BenchmarkAgentRequest) -> Result<AgentSessionRunOutput, AppError>
            + Send
            + 'static,
    ) -> Result<(), AppError> {
        let cancellation = self.active_tasks.register(task_id);
        let result = self.execute_plan(task_id, runner, cancellation).await;
        self.active_tasks.remove(task_id);
        result
    }

    async fn execute_plan(
        &self,
        task_id: &str,
        runner: impl FnMut(BenchmarkAgentRequest) -> Result<AgentSessionRunOutput, AppError>
            + Send
            + 'static,
        cancellation: Arc<AtomicBool>,
    ) -> Result<(), AppError> {
        let _execution_slot = self.execution_lock.lock().await;
        let runner = std::sync::Arc::new(std::sync::Mutex::new(runner));
        let detail = self.get(task_id).await?;
        if detail.task.status == TaskStatus::Stopped && detail.cancel_requested {
            return Ok(());
        }
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
                if !self
                    .task_repository
                    .mark_execution_running(&execution.id, now_ms()?)
                    .await
                    .map_err(|_| AppError::BenchmarkDatabaseFailed)?
                {
                    continue;
                }
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
                    cancellation: cancellation.clone(),
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
                        let checks = case.content.checks.clone();
                        let response = output.output.response.clone();
                        let evaluation_workspace = workspace.clone();
                        let asset_directory = self.asset_directory.clone();
                        let verifier = self.verifier.clone();
                        let report = tokio::task::spawn_blocking(move || {
                            evaluate_checks(
                                &checks,
                                &response,
                                &evaluation_workspace,
                                &asset_directory,
                                verifier.as_ref(),
                            )
                        })
                        .await
                        .map_err(|_| AppError::WorkerFailed)?;
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
                    Ok(_) if cancellation.load(Ordering::Acquire) => {
                        self.finish_cancelled(&execution.id).await?;
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
                    Err(error) if agent_timed_out(&error) => {
                        self.finish_error(&execution.id, &error).await?;
                    }
                    Err(_) if cancellation.load(Ordering::Acquire) => {
                        self.finish_cancelled(&execution.id).await?;
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

    async fn finish_cancelled(&self, execution_id: &str) -> Result<(), AppError> {
        self.task_repository
            .finish_execution(
                execution_id,
                BenchmarkExecutionResult {
                    session_id: None,
                    response_text: None,
                    metrics_json: None,
                    termination_reason: Some("cancelled".into()),
                    report: None,
                    finished_at_ms: now_ms()?,
                },
            )
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
        let uses_python = benchmark.document.cases.iter().any(|case| {
            case.checks
                .iter()
                .any(|check| matches!(check, BenchmarkCheck::Python { .. }))
        });
        let verifier_available = if uses_python {
            let verifier = self.verifier.clone();
            tokio::task::spawn_blocking(move || verifier.available())
                .await
                .map_err(|_| AppError::WorkerFailed)?
        } else {
            true
        };
        let mut issues = Vec::new();
        for (position, case) in benchmark.document.cases.iter().enumerate() {
            let mut missing_asset = false;
            for file in case
                .input_files
                .iter()
                .chain(case.checks.iter().filter_map(|check| match check {
                    BenchmarkCheck::Python { script } => Some(script),
                    _ => None,
                }))
            {
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
            if !verifier_available
                && case
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

fn validate_rerun_configuration(
    configuration: &BenchmarkRerunConfiguration,
) -> Result<(), AppError> {
    if configuration.source_task_id.is_empty()
        || configuration.source_task_id.len() > 200
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

/// Keeps a Case deadline distinct from a user-requested Task cancellation.
fn agent_timed_out(error: &AppError) -> bool {
    matches!(
        error,
        AppError::ClaudeTimedOut
            | AppError::CodexTimedOut
            | AppError::OpenCodeTimedOut
            | AppError::WorkBuddyTimedOut
    )
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

fn rerun_configuration_json(
    configuration: &BenchmarkRerunConfiguration,
) -> Result<String, AppError> {
    serde_json::to_string(&serde_json::json!({
        "sourceTaskId": configuration.source_task_id,
        "agentKinds": configuration.agent_kinds.iter().map(|kind| kind.as_str()).collect::<Vec<_>>(),
        "fileAccess": configuration.permissions.file_access,
        "commandExecution": configuration.permissions.command_execution,
        "restoreMount": configuration.restore_mount,
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
    asset_directory: &std::path::Path,
    verifier: &dyn BenchmarkVerifier,
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
            BenchmarkCheck::Python { script } => {
                if !safe_asset_id(&script.asset_id) {
                    return Err(AppError::BenchmarkAssetUnavailable);
                }
                let report =
                    verifier.evaluate(&asset_directory.join(&script.asset_id), workspace)?;
                results.extend(report.checks);
                continue;
            }
        };
        results.push(result);
    }
    Ok(BenchmarkEvaluationReport {
        passed: results.iter().all(|check| check.passed),
        checks: results,
    })
}

const MAX_ARTIFACT_FILES: usize = 2_000;
const MAX_ARTIFACT_PREVIEW_BYTES: u64 = 256 * 1024;

fn compare_artifacts(
    baseline: &Path,
    workspace: &Path,
) -> Result<Vec<BenchmarkArtifactFile>, AppError> {
    let baseline_files = list_regular_files(baseline)?;
    let workspace_files = list_regular_files(workspace)?;
    let mut artifacts = workspace_files
        .iter()
        .map(|(path, size)| {
            let change = match baseline_files.get(path) {
                None => "added",
                Some(_) if files_equal(&baseline.join(path), &workspace.join(path))? => "unchanged",
                Some(_) => "modified",
            };
            Ok(BenchmarkArtifactFile {
                path: path.clone(),
                size_bytes: *size,
                change: change.to_string(),
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    artifacts.extend(
        baseline_files
            .iter()
            .filter(|(path, _)| !workspace_files.contains_key(*path))
            .map(|(path, size)| BenchmarkArtifactFile {
                path: path.clone(),
                size_bytes: *size,
                change: "deleted".to_string(),
            }),
    );
    artifacts.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(artifacts)
}

fn list_regular_files(root: &Path) -> Result<HashMap<String, u64>, AppError> {
    if !root.exists() {
        return Ok(HashMap::new());
    }
    let root = std::fs::canonicalize(root).map_err(|_| AppError::TaskResultFailed)?;
    let mut directories = vec![root.clone()];
    let mut files = HashMap::new();
    while let Some(directory) = directories.pop() {
        for entry in std::fs::read_dir(&directory).map_err(|_| AppError::TaskResultFailed)? {
            let entry = entry.map_err(|_| AppError::TaskResultFailed)?;
            let metadata =
                std::fs::symlink_metadata(entry.path()).map_err(|_| AppError::TaskResultFailed)?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                directories.push(entry.path());
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            let relative = entry
                .path()
                .strip_prefix(&root)
                .map_err(|_| AppError::TaskResultFailed)?
                .to_str()
                .ok_or(AppError::TaskResultFailed)?
                .replace(std::path::MAIN_SEPARATOR, "/");
            if !safe_relative_path(&relative) || files.len() >= MAX_ARTIFACT_FILES {
                return Err(AppError::TaskResultFailed);
            }
            files.insert(relative, metadata.len());
        }
    }
    Ok(files)
}

fn files_equal(left: &Path, right: &Path) -> Result<bool, AppError> {
    let left_metadata = std::fs::metadata(left).map_err(|_| AppError::TaskResultFailed)?;
    let right_metadata = std::fs::metadata(right).map_err(|_| AppError::TaskResultFailed)?;
    if left_metadata.len() != right_metadata.len() {
        return Ok(false);
    }
    let mut left = std::fs::File::open(left).map_err(|_| AppError::TaskResultFailed)?;
    let mut right = std::fs::File::open(right).map_err(|_| AppError::TaskResultFailed)?;
    let mut left_chunk = [0_u8; 64 * 1024];
    let mut right_chunk = [0_u8; 64 * 1024];
    loop {
        let left_read = left
            .read(&mut left_chunk)
            .map_err(|_| AppError::TaskResultFailed)?;
        let right_read = right
            .read(&mut right_chunk)
            .map_err(|_| AppError::TaskResultFailed)?;
        if left_read != right_read || left_chunk[..left_read] != right_chunk[..right_read] {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
    }
}

fn preview_artifact(root: &Path, path: &str) -> Result<BenchmarkArtifactPreview, AppError> {
    let root = std::fs::canonicalize(root).map_err(|_| AppError::TaskResultFailed)?;
    let candidate = root.join(path);
    let metadata =
        std::fs::symlink_metadata(&candidate).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(AppError::BenchmarkAssetUnavailable);
    }
    let candidate =
        std::fs::canonicalize(candidate).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    if !candidate.starts_with(&root) {
        return Err(AppError::BenchmarkAssetUnavailable);
    }
    let mut bytes = Vec::new();
    std::fs::File::open(candidate)
        .map_err(|_| AppError::BenchmarkAssetUnavailable)?
        .take(MAX_ARTIFACT_PREVIEW_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    let truncated = bytes.len() as u64 > MAX_ARTIFACT_PREVIEW_BYTES;
    bytes.truncate(MAX_ARTIFACT_PREVIEW_BYTES as usize);
    Ok(BenchmarkArtifactPreview {
        path: path.to_string(),
        size_bytes: metadata.len(),
        text: String::from_utf8(bytes).ok(),
        truncated,
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

/// Thread-safe registry shared by background execution and Cancel IPC calls.
#[derive(Clone, Default)]
struct ActiveBenchmarkTasks {
    /// Task identifiers paired with cooperative cancellation flags.
    items: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ActiveBenchmarkTasks {
    /// Registers a Task before it waits for the global execution slot.
    fn register(&self, task_id: &str) -> Arc<AtomicBool> {
        let cancellation = Arc::new(AtomicBool::new(false));
        self.lock()
            .insert(task_id.to_string(), cancellation.clone());
        cancellation
    }

    /// Signals an active or queued Task if its worker is still registered.
    fn stop(&self, task_id: &str) -> bool {
        let cancellation = self.lock().get(task_id).cloned();
        if let Some(cancellation) = cancellation {
            cancellation.store(true, Ordering::Release);
            true
        } else {
            false
        }
    }

    /// Removes the signal only after the background worker has returned.
    fn remove(&self, task_id: &str) {
        self.lock().remove(task_id);
    }

    /// Recovers a poisoned lock because losing cancellation could strand a child process.
    fn lock(&self) -> MutexGuard<'_, HashMap<String, Arc<AtomicBool>>> {
        match self.items.lock() {
            Ok(items) => items,
            Err(poisoned) => poisoned.into_inner(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::benchmark_verifier::SystemBenchmarkVerifier;
    use crate::db::{connection::connect_sqlite, migration::Migrator};
    use crate::domain::benchmark::{
        BenchmarkCase, BenchmarkCheck, BenchmarkDocument, BenchmarkFile,
    };
    use crate::domain::task::TaskPermissions;
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::models::{benchmark::evaluation as benchmark_evaluation, task as task_model};
    use crate::repositories::{task::TaskRepository, workspace::WorkspaceRepository};
    use crate::services::benchmark::BenchmarkService;
    use sea_orm::{EntityTrait, PaginatorTrait};
    use sea_orm_migration::MigratorTrait;

    fn verifier() -> Arc<dyn BenchmarkVerifier> {
        Arc::new(SystemBenchmarkVerifier)
    }

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
            let catalog = BenchmarkService::new(repository.clone(), PathBuf::new(), verifier());
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
            let catalog = BenchmarkService::new(repository.clone(), directory.clone(), verifier());
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
                .save_draft(None, None, None, document.clone())
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
                verifier(),
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
            let catalog = BenchmarkService::new(repository.clone(), PathBuf::new(), verifier());
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
                .save_draft(None, None, None, document)
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
                verifier(),
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
            let rows = task_model::Entity::find()
                .count(&database)
                .await
                .expect("task count");
            assert_eq!(rows, 1);
            service
                .recover_interrupted()
                .await
                .expect("restart recovery");
            let recovered = service.get(&first.task.id).await.expect("recovered task");
            assert_eq!(recovered.task.status, TaskStatus::Failed);
            assert_eq!(recovered.result_completeness, "incomplete");
            assert_eq!(recovered.completion_reason.as_deref(), Some("interrupted"));
            assert!(recovered.executions.iter().all(|execution| {
                execution.phase == "finished"
                    && execution.termination_reason.as_deref() == Some("interrupted")
            }));
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

        let verifier = verifier();
        let passed = super::evaluate_checks(&checks, " 42\n", &root, &root, verifier.as_ref())
            .expect("evaluation");
        assert!(passed.passed);
        assert_eq!(passed.checks.len(), 4);
        let failed = super::evaluate_checks(&checks, "forty-two", &root, &root, verifier.as_ref())
            .expect("evaluation");
        assert!(!failed.passed);
        assert!(!failed.checks[0].passed);

        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn executor_runs_every_planned_cell_with_permissions_and_without_model_overrides() {
        tauri::async_runtime::block_on(async {
            use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
            use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput};
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
            let catalog = BenchmarkService::new(repository.clone(), root.clone(), verifier());
            let tag = catalog.create_tag("Coding", "Code").await.expect("tag");
            let draft = catalog
                .save_draft(
                    None,
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
                verifier(),
            );
            let planned = service
                .start(
                    BenchmarkTaskConfiguration {
                        workspace_id: "workspace".into(),
                        mount_id: mount.id.clone(),
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
                    std::fs::write(request.working_directory.join("result.txt"), "42")
                        .expect("result artifact");
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
            let selected = &completed.executions[0];
            let artifacts = service
                .execution_artifacts(&completed.task.id, &selected.id)
                .await
                .expect("artifact list");
            assert!(artifacts.iter().any(|artifact| {
                artifact.path == "result.txt"
                    && artifact.change == "added"
                    && artifact.size_bytes == 2
            }));
            let preview = service
                .execution_artifact_preview(&completed.task.id, &selected.id, "result.txt")
                .await
                .expect("artifact preview");
            assert_eq!(preview.text.as_deref(), Some("42"));
            catalog
                .unmount("workspace", &mount.id)
                .await
                .expect("remove source mount");
            let rerun_configuration = BenchmarkRerunConfiguration {
                source_task_id: completed.task.id.clone(),
                agent_kinds: vec![AgentKind::Codex],
                permissions: TaskPermissions {
                    file_access: "allow_edits".into(),
                    command_execution: "ask".into(),
                },
                restore_mount: false,
            };
            assert_eq!(
                service
                    .rerun(rerun_configuration.clone(), "rerun-request")
                    .await,
                Err(AppError::BenchmarkMountRequired)
            );
            let rerun = service
                .rerun(
                    BenchmarkRerunConfiguration {
                        restore_mount: true,
                        ..rerun_configuration
                    },
                    "rerun-request",
                )
                .await
                .expect("confirmed rerun");
            assert_ne!(rerun.task.id, completed.task.id);
            assert_eq!(rerun.rerun_of_task_id, Some(completed.task.id));
            assert_eq!(rerun.version_id, completed.version_id);
            assert_eq!(rerun.cases.len(), completed.cases.len());
            assert_eq!(rerun.executions.len(), completed.cases.len());
            assert_eq!(
                catalog
                    .mounts("workspace", 0)
                    .await
                    .expect("restored mount")[0]
                    .version_id,
                completed.version_id
            );
            let count = benchmark_evaluation::Entity::find()
                .count(&database)
                .await
                .expect("evaluation count");
            assert_eq!(count, 4);
            database.close().await.expect("close");
            std::fs::remove_dir_all(root).expect("cleanup");
        });
    }

    #[test]
    fn cancel_stops_the_active_execution_and_finishes_the_remaining_matrix() {
        tauri::async_runtime::block_on(async {
            use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
            use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput};
            use std::sync::atomic::Ordering;
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
            let root = std::env::temp_dir().join(super::next_id("cancel").expect("id"));
            std::fs::create_dir_all(&root).expect("app data");
            let repository = BenchmarkRepository::new(database.clone());
            let catalog = BenchmarkService::new(repository.clone(), root.clone(), verifier());
            let tag = catalog.create_tag("Coding", "Code").await.expect("tag");
            let draft = catalog
                .save_draft(
                    None,
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
                verifier(),
            );
            let planned = service
                .start(
                    BenchmarkTaskConfiguration {
                        workspace_id: "workspace".into(),
                        mount_id: mount.id,
                        expected_version_id: published.version_id,
                        agent_kinds: vec![AgentKind::Codex],
                        permissions: TaskPermissions {
                            file_access: "read_only".into(),
                            command_execution: "deny".into(),
                        },
                    },
                    "cancel-request",
                )
                .await
                .expect("plan");
            let task_id = planned.task.id.clone();
            let worker = service.clone();
            let (started_sender, started_receiver) = std::sync::mpsc::channel();
            let handle = tauri::async_runtime::spawn(async move {
                worker
                    .execute_with(&task_id, move |request| {
                        started_sender.send(()).expect("announce active execution");
                        while !request.cancellation.load(Ordering::Acquire) {
                            std::thread::yield_now();
                        }
                        Ok(AgentSessionRunOutput {
                            output: AgentRunOutput {
                                response: String::new(),
                                metrics: AgentRunMetricsCollector::default()
                                    .finish(Duration::from_millis(1)),
                            },
                            session_id: None,
                            outcome: AgentTurnOutcome::Waiting,
                        })
                    })
                    .await
            });
            tokio::task::spawn_blocking(move || {
                started_receiver.recv().expect("execution should start")
            })
            .await
            .expect("wait worker");

            let cancelled = service.cancel(&planned.task.id).await.expect("cancel task");
            assert!(cancelled.cancel_requested);
            handle
                .await
                .expect("join executor")
                .expect("finish executor");

            let stopped = service.get(&planned.task.id).await.expect("stopped task");
            assert_eq!(stopped.task.status, TaskStatus::Stopped);
            assert_eq!(stopped.result_completeness, "incomplete");
            assert_eq!(stopped.executions.len(), 2);
            assert!(stopped.executions.iter().all(|execution| {
                execution.phase == "finished"
                    && execution.termination_reason.as_deref() == Some("cancelled")
            }));

            database.close().await.expect("close database");
            std::fs::remove_dir_all(root).expect("cleanup");
        });
    }
}
