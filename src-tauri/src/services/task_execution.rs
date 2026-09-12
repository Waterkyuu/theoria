use crate::adapters::agent::AgentExecutionConfig;
use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
use crate::adapters::claude::ClaudeRuntimeSettingsCache;
use crate::adapters::codex::CodexRuntimeDefaultsCache;
use crate::domain::agent_run::{AgentRunMetrics, AgentRunOutput, TokenUsage, ToolCallMetric};
use crate::domain::task::{TaskAgent, TaskAgentResult, TaskDetail, TaskStatus};
use crate::error::{AppError, IpcError};
use crate::repositories::task::TaskRepository;
use crate::services::agent_runtime::{run_agent_turn, AgentRuntimeCaches};
use crate::services::result::{CollectedChanges, ResultCollector};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const STOP_WAIT_TIMEOUT: Duration = Duration::from_secs(30);

/// Runs every prepared Agent in its own workspace and persists independent results.
#[derive(Clone)]
pub(crate) struct TaskExecutionService {
    /// Persisted Task lifecycle and result boundary.
    repository: TaskRepository,
    /// Baseline-relative file result boundary.
    result_collector: ResultCollector,
    /// Root used to expand persisted Execution paths.
    app_data_directory: PathBuf,
    /// Cancellation tokens for currently running Task Agents.
    active_executions: ActiveExecutions,
}

/// Identifies one owned worker and the cancellation signal used by Stop.
struct PendingExecution {
    /// Frozen Agent metadata used to save this worker's result.
    agent: TaskAgent,
    /// Shared signal checked by the running adapter.
    cancellation: Arc<AtomicBool>,
    /// Owned blocking worker whose completion precedes result collection.
    handle: tokio::task::JoinHandle<Result<AgentSessionRunOutput, AppError>>,
}

impl TaskExecutionService {
    /// Creates a Task execution coordinator over local storage.
    pub(crate) fn new(
        repository: TaskRepository,
        result_collector: ResultCollector,
        app_data_directory: PathBuf,
    ) -> Self {
        Self {
            repository,
            result_collector,
            app_data_directory,
            active_executions: ActiveExecutions::default(),
        }
    }

    /// Stops one active or waiting Agent while leaving sibling Executions unchanged.
    pub(crate) async fn stop_agent(&self, task_agent_id: &str) -> Result<TaskDetail, AppError> {
        let task_id = self
            .repository
            .task_id_for_agent(task_agent_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)?;
        let detail = self
            .repository
            .get(&task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)?;
        let agent = detail
            .agents
            .iter()
            .find(|agent| agent.id == task_agent_id)
            .ok_or(AppError::TaskNotFound)?;
        if matches!(
            agent.status,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped
        ) {
            return Ok(detail);
        }
        self.active_executions.stop(task_agent_id);
        let updated_at_ms = current_time_ms()?;
        self.repository
            .finish_agent(
                TaskAgentResult {
                    task_agent_id: task_agent_id.to_string(),
                    final_status: TaskStatus::Stopped,
                    response_text: Some("Execution stopped by user.".to_string()),
                    changes_relative_path: None,
                    metrics_json: serde_json::json!({"stopped": true}).to_string(),
                },
                updated_at_ms,
            )
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        self.repository
            .refresh_task_status(&task_id, updated_at_ms)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        self.repository
            .get(&task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)
    }

    /// Stops every active Agent and waits until no child process can write into Task files.
    pub(crate) async fn stop_task_and_wait(&self, task_id: &str) -> Result<(), AppError> {
        let Some(detail) = self
            .repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
        else {
            return Ok(());
        };
        for agent in &detail.agents {
            self.active_executions.stop(&agent.id);
        }
        let started_at = std::time::Instant::now();
        while detail
            .agents
            .iter()
            .any(|agent| self.active_executions.is_active(&agent.id))
        {
            if started_at.elapsed() >= STOP_WAIT_TIMEOUT {
                return Err(AppError::TaskPreparationFailed);
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let refreshed = self
            .repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)?;
        let updated_at_ms = current_time_ms()?;
        for agent in refreshed.agents.iter().filter(|agent| {
            matches!(
                agent.status,
                TaskStatus::Preparing | TaskStatus::Running | TaskStatus::Waiting
            )
        }) {
            self.repository
                .finish_agent(
                    TaskAgentResult {
                        task_agent_id: agent.id.clone(),
                        final_status: TaskStatus::Stopped,
                        response_text: Some("Execution stopped during Task cleanup.".to_string()),
                        changes_relative_path: None,
                        metrics_json: serde_json::json!({"stopped": true}).to_string(),
                    },
                    updated_at_ms,
                )
                .await
                .map_err(|_| AppError::TaskDatabaseFailed)?;
        }
        self.repository
            .refresh_task_status(task_id, updated_at_ms)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        Ok(())
    }

    /// Runs all prepared Agents concurrently and restores the completed Task view.
    pub(crate) async fn run(
        &self,
        task_id: &str,
        codex_cache: CodexRuntimeDefaultsCache,
        claude_cache: ClaudeRuntimeSettingsCache,
    ) -> Result<TaskDetail, AppError> {
        let detail = self
            .repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)?;
        if detail.task.status != TaskStatus::Preparing
            || detail
                .agents
                .iter()
                .any(|agent| agent.status != TaskStatus::Preparing)
        {
            return Err(AppError::InvalidTask);
        }
        validate_frozen_paths(&detail)?;
        self.repository
            .mark_running(task_id, current_time_ms()?)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        let mut executions = Vec::with_capacity(detail.agents.len());
        for agent in detail.agents.clone() {
            let prompt = detail.prompt.clone();
            let execution_directory = self.app_data_directory.join(&agent.execution_relative_path);
            let model_snapshot = agent.model_snapshot.clone();
            let mode_snapshot = agent.mode_snapshot.clone();
            let file_access = detail.permissions.file_access.clone();
            let command_execution = detail.permissions.command_execution.clone();
            let codex_cache = codex_cache.clone();
            let claude_cache = claude_cache.clone();
            let cancellation = self.active_executions.register(&agent.id);
            let runner_cancellation = cancellation.clone();
            let handle = tokio::task::spawn_blocking(move || {
                run_agent_turn(
                    agent.agent_kind,
                    &prompt,
                    &execution_directory,
                    AgentExecutionConfig {
                        model: model_snapshot.as_deref(),
                        mode: mode_snapshot.as_deref(),
                        file_access: Some(&file_access),
                        command_execution: Some(&command_execution),
                    },
                    AgentRuntimeCaches {
                        codex: codex_cache,
                        claude: claude_cache,
                    },
                    None,
                    &runner_cancellation,
                )
            });
            executions.push(PendingExecution {
                agent,
                cancellation,
                handle,
            });
        }
        let final_statuses = self
            .collect_executions(&detail, &detail.prompt, executions)
            .await?;
        let task_status = aggregate_status(&final_statuses);
        self.repository
            .set_task_status(task_id, task_status, current_time_ms()?)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        self.repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)
    }

    /// Sends one follow-up message to all or selected resumable Agent sessions.
    pub(crate) async fn continue_task(
        &self,
        task_id: &str,
        prompt: &str,
        task_agent_ids: &[String],
        codex_cache: CodexRuntimeDefaultsCache,
        claude_cache: ClaudeRuntimeSettingsCache,
    ) -> Result<TaskDetail, AppError> {
        let prompt = validate_follow_up(prompt)?;
        let detail = self
            .repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)?;
        validate_frozen_paths(&detail)?;
        let agents = select_resumable_agents(&detail, task_agent_ids)?;
        let selected_ids = agents
            .iter()
            .map(|agent| agent.id.clone())
            .collect::<Vec<_>>();
        if !self
            .repository
            .begin_agent_turns(task_id, &selected_ids, current_time_ms()?)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
        {
            return Err(AppError::InvalidTask);
        }

        let mut executions = Vec::with_capacity(agents.len());
        for agent in agents {
            let execution_directory = self.app_data_directory.join(&agent.execution_relative_path);
            let model_snapshot = agent.model_snapshot.clone();
            let mode_snapshot = agent.mode_snapshot.clone();
            let session_id = agent.session_id.clone();
            let file_access = detail.permissions.file_access.clone();
            let command_execution = detail.permissions.command_execution.clone();
            let prompt = prompt.clone();
            let codex_cache = codex_cache.clone();
            let claude_cache = claude_cache.clone();
            let cancellation = self.active_executions.register(&agent.id);
            let runner_cancellation = cancellation.clone();
            let handle = tokio::task::spawn_blocking(move || {
                run_agent_turn(
                    agent.agent_kind,
                    &prompt,
                    &execution_directory,
                    AgentExecutionConfig {
                        model: model_snapshot.as_deref(),
                        mode: mode_snapshot.as_deref(),
                        file_access: Some(&file_access),
                        command_execution: Some(&command_execution),
                    },
                    AgentRuntimeCaches {
                        codex: codex_cache,
                        claude: claude_cache,
                    },
                    session_id.as_deref(),
                    &runner_cancellation,
                )
            });
            executions.push(PendingExecution {
                agent,
                cancellation,
                handle,
            });
        }

        self.collect_executions(&detail, &prompt, executions)
            .await?;
        self.repository
            .refresh_task_status(task_id, current_time_ms()?)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        self.repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)
    }

    /// Drains every execution independently before reporting an infrastructure failure.
    async fn collect_executions(
        &self,
        detail: &TaskDetail,
        prompt: &str,
        executions: Vec<PendingExecution>,
    ) -> Result<Vec<TaskStatus>, AppError> {
        let mut completions = tokio::task::JoinSet::new();
        for PendingExecution {
            agent,
            cancellation,
            handle,
        } in executions
        {
            let service = self.clone();
            let detail = detail.clone();
            let prompt = prompt.to_string();
            completions.spawn(async move {
                let (output, worker_error) = match handle.await {
                    Ok(output) => (output, None),
                    Err(_) => (Err(AppError::WorkerFailed), Some(AppError::WorkerFailed)),
                };
                let persisted = service
                    .persist_agent_turn(&detail, &agent, &prompt, &cancellation, &output)
                    .await;
                // Cleanup must wait for both the worker and result-file writes, including failures.
                service.active_executions.remove(&agent.id);
                let status = persisted?;
                match worker_error {
                    Some(error) => Err(error),
                    None => Ok(status),
                }
            });
        }
        let mut statuses = Vec::with_capacity(completions.len());
        let mut first_error = None;
        while let Some(completion) = completions.join_next().await {
            match completion.unwrap_or(Err(AppError::WorkerFailed)) {
                Ok(status) => statuses.push(status),
                Err(error) => {
                    first_error.get_or_insert(error);
                }
            }
        }
        if let Some(error) = first_error {
            // A failed result write may leave an Agent row Running; the Task must not stay Running.
            self.repository
                .set_task_status(&detail.task.id, TaskStatus::Failed, current_time_ms()?)
                .await
                .map_err(|_| AppError::TaskDatabaseFailed)?;
            return Err(error);
        }
        Ok(statuses)
    }

    /// Collects file changes and persists the Waiting or terminal result of one Agent turn.
    async fn persist_agent_turn(
        &self,
        detail: &TaskDetail,
        agent: &TaskAgent,
        prompt: &str,
        cancellation: &AtomicBool,
        output: &Result<AgentSessionRunOutput, AppError>,
    ) -> Result<TaskStatus, AppError> {
        let updated_at_ms = current_time_ms()?;
        let changes = self
            .result_collector
            .collect(
                &detail.task.id,
                &agent.id,
                Path::new(&detail.baseline_relative_path),
                Path::new(&agent.execution_relative_path),
            )
            .await;
        let waiting_session = output
            .as_ref()
            .ok()
            .filter(|run| run.outcome == AgentTurnOutcome::Waiting)
            .and_then(|run| {
                run.session_id
                    .as_deref()
                    .map(|session_id| (run, session_id))
            });
        if !cancellation.load(Ordering::Acquire) {
            if let Some((run, session_id)) = waiting_session {
                self.repository
                    .wait_agent_turn(
                        &agent.id,
                        prompt,
                        non_empty_response(&run.output.response),
                        &metrics_json(&run.output.metrics, changes.as_ref().ok(), None),
                        session_id,
                        updated_at_ms,
                    )
                    .await
                    .map_err(|_| AppError::TaskDatabaseFailed)?;
                return Ok(TaskStatus::Waiting);
            }
        }
        let (status, response_text, metrics_json) = if cancellation.load(Ordering::Acquire) {
            (
                TaskStatus::Stopped,
                Some("Execution stopped by user.".to_string()),
                serde_json::json!({"files": changes.as_ref().ok().map(changes_json)}).to_string(),
            )
        } else if waiting_without_session(output) {
            missing_session_payload(changes.as_ref())
        } else {
            result_payload(output.as_ref().map(|run| &run.output), changes.as_ref())
        };
        self.repository
            .finish_agent_turn(
                TaskAgentResult {
                    task_agent_id: agent.id.clone(),
                    final_status: status,
                    response_text,
                    changes_relative_path: changes
                        .ok()
                        .map(|changes| changes.changes_relative_path),
                    metrics_json,
                },
                prompt,
                output
                    .as_ref()
                    .ok()
                    .and_then(|run| run.session_id.as_deref()),
                updated_at_ms,
            )
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        Ok(status)
    }
}

/// Trims one follow-up prompt while enforcing the shared request bound.
fn validate_follow_up(prompt: &str) -> Result<String, AppError> {
    let prompt = prompt.trim();
    if prompt.is_empty() || prompt.len() > 16_000 {
        return Err(AppError::InvalidQuery);
    }
    Ok(prompt.to_string())
}

/// Rejects persisted paths that could route an adapter outside its exact isolated Execution.
fn validate_frozen_paths(detail: &TaskDetail) -> Result<(), AppError> {
    let expected_baseline = PathBuf::from("task-runs")
        .join(&detail.task.id)
        .join("baseline");
    if Path::new(&detail.baseline_relative_path) != expected_baseline {
        return Err(AppError::TaskPreparationFailed);
    }
    for agent in &detail.agents {
        let expected_execution = PathBuf::from("task-runs")
            .join(&detail.task.id)
            .join("executions")
            .join(&agent.id)
            .join("workspace");
        if agent.task_id != detail.task.id
            || Path::new(&agent.execution_relative_path) != expected_execution
        {
            return Err(AppError::TaskPreparationFailed);
        }
    }
    Ok(())
}

/// Resolves an all-Agent broadcast or an exact resumable subset in layout order.
fn select_resumable_agents(
    detail: &TaskDetail,
    requested_ids: &[String],
) -> Result<Vec<TaskAgent>, AppError> {
    if !matches!(
        detail.task.status,
        TaskStatus::Waiting | TaskStatus::Completed | TaskStatus::Failed
    ) {
        return Err(AppError::InvalidTask);
    }
    let requested = requested_ids.iter().collect::<HashSet<_>>();
    if requested.len() != requested_ids.len() {
        return Err(AppError::InvalidTask);
    }
    let agents = detail
        .agents
        .iter()
        .filter(|agent| {
            (requested.is_empty() || requested.contains(&agent.id))
                && agent.session_id.is_some()
                && matches!(agent.status, TaskStatus::Waiting | TaskStatus::Completed)
        })
        .cloned()
        .collect::<Vec<_>>();
    if agents.is_empty() || (!requested.is_empty() && agents.len() != requested.len()) {
        return Err(AppError::InvalidTask);
    }
    Ok(agents)
}

/// Thread-safe registry shared by run and Stop IPC calls.
#[derive(Clone, Default)]
struct ActiveExecutions {
    /// Task Agent identifiers paired with cooperative cancellation flags.
    items: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ActiveExecutions {
    /// Registers one Agent before its blocking process starts.
    fn register(&self, task_agent_id: &str) -> Arc<AtomicBool> {
        let cancellation = Arc::new(AtomicBool::new(false));
        self.lock()
            .insert(task_agent_id.to_string(), cancellation.clone());
        cancellation
    }

    /// Signals one active Agent if its blocking process is still registered.
    fn stop(&self, task_agent_id: &str) -> bool {
        let cancellation = self.lock().get(task_agent_id).cloned();
        if let Some(cancellation) = cancellation {
            cancellation.store(true, Ordering::Release);
            true
        } else {
            false
        }
    }

    /// Reports whether cleanup still needs to wait for one Agent process.
    fn is_active(&self, task_agent_id: &str) -> bool {
        self.lock().contains_key(task_agent_id)
    }

    /// Removes one completed Agent token.
    fn remove(&self, task_agent_id: &str) {
        self.lock().remove(task_agent_id);
    }

    /// Recovers a poisoned lock because losing cancellation would strand a child process.
    fn lock(&self) -> MutexGuard<'_, HashMap<String, Arc<AtomicBool>>> {
        match self.items.lock() {
            Ok(items) => items,
            Err(poisoned) => poisoned.into_inner(),
        }
    }
}

/// Omits an empty partial response while retaining meaningful Waiting output.
fn non_empty_response(response: &str) -> Option<&str> {
    (!response.trim().is_empty()).then_some(response)
}

/// Detects a protocol bug that would make a Waiting turn impossible to resume.
fn waiting_without_session(output: &Result<AgentSessionRunOutput, AppError>) -> bool {
    output
        .as_ref()
        .is_ok_and(|run| run.outcome == AgentTurnOutcome::Waiting && run.session_id.is_none())
}

/// Converts an unresumable Waiting outcome into a persisted terminal failure.
fn missing_session_payload(
    changes: Result<&CollectedChanges, &AppError>,
) -> (TaskStatus, Option<String>, String) {
    let error = IpcError::from(AppError::WorkerFailed);
    (
        TaskStatus::Failed,
        Some(error.message.clone()),
        serde_json::json!({
            "error": {"code": "MISSING_AGENT_SESSION", "message": error.message},
            "files": changes.ok().map(changes_json),
        })
        .to_string(),
    )
}

/// Builds one terminal database payload from Agent output and collected file changes.
fn result_payload(
    output: Result<&AgentRunOutput, &AppError>,
    changes: Result<&CollectedChanges, &AppError>,
) -> (TaskStatus, Option<String>, String) {
    match output {
        Ok(output) if changes.is_ok() => (
            TaskStatus::Completed,
            Some(output.response.clone()),
            metrics_json(&output.metrics, changes.ok(), None),
        ),
        Ok(output) => (
            TaskStatus::Failed,
            Some(output.response.clone()),
            metrics_json(&output.metrics, None, Some("Result collection failed")),
        ),
        Err(error) => {
            let ipc_error = IpcError::from(error.clone());
            (
                TaskStatus::Failed,
                Some(ipc_error.message.clone()),
                serde_json::json!({
                    "error": {"code": ipc_error.code, "message": ipc_error.message},
                    "files": changes.ok().map(changes_json),
                })
                .to_string(),
            )
        }
    }
}

/// Encodes the existing Comparison metrics plus file counters without inventing a score.
fn metrics_json(
    metrics: &AgentRunMetrics,
    changes: Option<&CollectedChanges>,
    error: Option<&str>,
) -> String {
    serde_json::json!({
        "totalDurationMs": duration_millis(metrics.total_duration),
        "timeToFirstTokenMs": metrics.time_to_first_token.map(duration_millis),
        "tokenUsage": metrics.token_usage.as_ref().map(token_usage_json),
        "thinkingDurationMs": duration_millis(metrics.thinking_duration),
        "compactionCount": metrics.compaction_count,
        "toolCallCount": metrics.tool_calls.len(),
        "toolCalls": metrics.tool_calls.iter().map(tool_call_json).collect::<Vec<_>>(),
        "files": changes.map(changes_json),
        "error": error,
    })
    .to_string()
}

/// Encodes the normalized token snapshot already used by Comparison.
fn token_usage_json(usage: &TokenUsage) -> serde_json::Value {
    serde_json::json!({
        "totalTokens": usage.total_tokens,
        "inputTokens": usage.input_tokens,
        "cachedInputTokens": usage.cached_input_tokens,
        "cacheWriteInputTokens": usage.cache_write_input_tokens,
        "outputTokens": usage.output_tokens,
        "reasoningOutputTokens": usage.reasoning_output_tokens,
    })
}

/// Encodes one existing tool timing without changing its metric definition.
fn tool_call_json(call: &ToolCallMetric) -> serde_json::Value {
    serde_json::json!({
        "name": call.name,
        "durationMs": duration_millis(call.duration),
    })
}

/// Encodes file counters and the retained machine-readable summary location.
fn changes_json(changes: &CollectedChanges) -> serde_json::Value {
    serde_json::json!({
        "added": changes.added,
        "modified": changes.modified,
        "deleted": changes.deleted,
        "summaryRelativePath": changes.summary_relative_path,
    })
}

/// Derives the Task lifecycle from independent Agent outcomes without ranking them.
fn aggregate_status(statuses: &[TaskStatus]) -> TaskStatus {
    if statuses.contains(&TaskStatus::Failed) {
        TaskStatus::Failed
    } else if statuses.contains(&TaskStatus::Waiting) {
        TaskStatus::Waiting
    } else if statuses.contains(&TaskStatus::Stopped) {
        TaskStatus::Stopped
    } else {
        TaskStatus::Completed
    }
}

/// Saturates duration values at the persisted JSON integer boundary.
fn duration_millis(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

/// Returns a positive Unix millisecond timestamp for lifecycle persistence.
fn current_time_ms() -> Result<i64, AppError> {
    let milliseconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::WorkerFailed)?
        .as_millis();
    i64::try_from(milliseconds).map_err(|_| AppError::WorkerFailed)
}

#[cfg(test)]
mod tests {
    use super::{
        aggregate_status, select_resumable_agents, validate_follow_up, validate_frozen_paths,
        PendingExecution, TaskExecutionService,
    };
    use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
    use crate::db::{connection::connect_sqlite_path, migration::Migrator};
    use crate::domain::agent_kind::AgentKind;
    use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput};
    use crate::domain::task::{Task, TaskAgent, TaskDetail, TaskPermissions, TaskStatus};
    use crate::error::AppError;
    use crate::repositories::task::TaskRepository;
    use crate::services::result::ResultCollector;
    use sea_orm::{ConnectionTrait, DatabaseConnection};
    use sea_orm_migration::MigratorTrait;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    static EXECUTION_TEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    /// Owns a real database and isolated workspaces for execution lifecycle tests.
    struct ExecutionFixture {
        /// Temporary application data root.
        root: PathBuf,
        /// Database used to verify saved results and inject a scoped write failure.
        database: DatabaseConnection,
        /// Service under test with its real collector and registry.
        service: TaskExecutionService,
        /// Two running Agents with stable slot identities.
        detail: TaskDetail,
    }

    impl ExecutionFixture {
        async fn new() -> Self {
            let sequence = EXECUTION_TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-execution-test-{}-{sequence}",
                std::process::id()
            ));
            std::fs::create_dir_all(&root).expect("create fixture root");
            let database = connect_sqlite_path(&root.join("test.sqlite3"))
                .await
                .expect("open database");
            Migrator::up(&database, None)
                .await
                .expect("migrate database");
            let repository = TaskRepository::new(database.clone());
            let mut detail = resumable_task_detail();
            detail.task.status = TaskStatus::Running;
            detail.agents.truncate(2);
            for (slot, agent) in detail.agents.iter_mut().enumerate() {
                agent.slot_index = slot as i64;
                agent.status = TaskStatus::Running;
                std::fs::create_dir_all(root.join(&agent.execution_relative_path))
                    .expect("create workspace");
            }
            std::fs::create_dir_all(root.join(&detail.baseline_relative_path))
                .expect("create baseline");
            let detail = repository.create(detail).await.expect("save task");
            let service = TaskExecutionService::new(
                repository,
                ResultCollector::new(root.clone()),
                root.clone(),
            );
            Self {
                root,
                database,
                service,
                detail,
            }
        }

        fn execution(
            &self,
            slot: usize,
            handle: tokio::task::JoinHandle<Result<AgentSessionRunOutput, AppError>>,
        ) -> PendingExecution {
            let agent = self.detail.agents[slot].clone();
            let cancellation = self.service.active_executions.register(&agent.id);
            PendingExecution {
                agent,
                cancellation,
                handle,
            }
        }

        async fn saved(&self) -> TaskDetail {
            self.service
                .repository
                .get(&self.detail.task.id)
                .await
                .expect("read task")
                .expect("task exists")
        }

        async fn close(self) {
            drop(self.service);
            self.database.close().await.expect("close database");
            std::fs::remove_dir_all(self.root).expect("remove fixture");
        }
    }

    fn successful_turn(outcome: AgentTurnOutcome) -> Result<AgentSessionRunOutput, AppError> {
        Ok(AgentSessionRunOutput {
            output: AgentRunOutput {
                response: "Agent response".to_string(),
                metrics: AgentRunMetricsCollector::default().finish(Duration::ZERO),
            },
            session_id: Some("session".to_string()),
            outcome,
        })
    }

    #[test]
    fn execution_completion_saves_fast_agent_while_first_worker_is_blocked() {
        tauri::async_runtime::block_on(async {
            let fixture = ExecutionFixture::new().await;
            let (release, blocked) = tokio::sync::oneshot::channel();
            let slow = fixture.execution(
                0,
                tokio::task::spawn_blocking(move || {
                    blocked.blocking_recv().expect("release slow worker");
                    successful_turn(AgentTurnOutcome::Completed)
                }),
            );
            let fast = fixture.execution(
                1,
                tokio::task::spawn_blocking(|| successful_turn(AgentTurnOutcome::Waiting)),
            );
            let service = fixture.service.clone();
            let detail = fixture.detail.clone();
            let collection = tokio::spawn(async move {
                service
                    .collect_executions(&detail, "Follow up", vec![slow, fast])
                    .await
            });
            // The deadline is only a deadlock watchdog; the first worker cannot finish until released.
            let observed = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let saved = fixture.saved().await;
                    if saved.agents[1].status == TaskStatus::Waiting
                        && !fixture.service.active_executions.is_active("agent-2")
                    {
                        break saved;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await;
            let slow_still_active = fixture.service.active_executions.is_active("agent-1");
            release.send(()).expect("release worker");
            let result = collection.await.expect("join collector");
            let saved = fixture.saved().await;
            let all_removed = fixture
                .detail
                .agents
                .iter()
                .all(|agent| !fixture.service.active_executions.is_active(&agent.id));
            fixture.close().await;
            let observed =
                observed.expect("fast Agent must be saved before the slow worker finishes");
            assert_eq!(observed.agents[0].status, TaskStatus::Running);
            assert!(slow_still_active);
            assert_eq!(observed.turns.len(), 1);
            assert_eq!(observed.turns[0].task_agent_id, "agent-2");
            assert_eq!(observed.turns[0].prompt, "Follow up");
            assert!(result.is_ok());
            assert_eq!(saved.agents[0].status, TaskStatus::Completed);
            assert!(all_removed);
        });
    }

    #[test]
    fn execution_completion_persists_panic_and_drains_sibling_before_reporting_error() {
        tauri::async_runtime::block_on(async {
            let fixture = ExecutionFixture::new().await;
            let broken = fixture.execution(
                0,
                tokio::task::spawn_blocking(|| panic!("simulated worker panic")),
            );
            let sibling = fixture.execution(
                1,
                tokio::task::spawn_blocking(|| successful_turn(AgentTurnOutcome::Completed)),
            );
            let result = fixture
                .service
                .collect_executions(&fixture.detail, "Initial", vec![broken, sibling])
                .await;
            let saved = fixture.saved().await;
            let all_removed = fixture
                .detail
                .agents
                .iter()
                .all(|agent| !fixture.service.active_executions.is_active(&agent.id));
            fixture.close().await;
            assert_eq!(result, Err(AppError::WorkerFailed));
            assert!(all_removed, "panic must not strand registry entries");
            assert_eq!(saved.agents[0].status, TaskStatus::Failed);
            assert_eq!(saved.agents[1].status, TaskStatus::Completed);
            assert_eq!(saved.results.len(), 2);
            assert_eq!(saved.turns.len(), 2);
            assert_eq!(saved.task.status, TaskStatus::Failed);
        });
    }

    #[test]
    fn execution_completion_drains_siblings_after_one_result_write_fails() {
        tauri::async_runtime::block_on(async {
            let fixture = ExecutionFixture::new().await;
            fixture
                .database
                .execute_unprepared(
                    "CREATE TRIGGER reject_first_result BEFORE INSERT ON task_agent_results
                 WHEN NEW.task_agent_id = 'agent-1'
                 BEGIN SELECT RAISE(FAIL, 'simulated result write failure'); END",
                )
                .await
                .expect("inject scoped database failure");
            let first = fixture.execution(
                0,
                tokio::task::spawn_blocking(|| successful_turn(AgentTurnOutcome::Completed)),
            );
            let sibling = fixture.execution(
                1,
                tokio::task::spawn_blocking(|| successful_turn(AgentTurnOutcome::Completed)),
            );
            let result = fixture
                .service
                .collect_executions(&fixture.detail, "Initial", vec![first, sibling])
                .await;
            let saved = fixture.saved().await;
            let all_removed = fixture
                .detail
                .agents
                .iter()
                .all(|agent| !fixture.service.active_executions.is_active(&agent.id));
            fixture.close().await;
            assert_eq!(result, Err(AppError::TaskDatabaseFailed));
            assert!(
                all_removed,
                "write failure must not strand registry entries"
            );
            assert_eq!(saved.agents[1].status, TaskStatus::Completed);
            assert_eq!(saved.results.len(), 1);
            assert_eq!(saved.results[0].task_agent_id, "agent-2");
            assert_eq!(saved.task.status, TaskStatus::Failed);
        });
    }

    #[test]
    fn aggregates_without_scoring_agent_results() {
        assert_eq!(
            aggregate_status(&[TaskStatus::Completed, TaskStatus::Completed]),
            TaskStatus::Completed
        );
        assert_eq!(
            aggregate_status(&[TaskStatus::Completed, TaskStatus::Waiting]),
            TaskStatus::Waiting
        );
        assert_eq!(
            aggregate_status(&[TaskStatus::Completed, TaskStatus::Failed]),
            TaskStatus::Failed
        );
    }

    #[test]
    fn selects_only_exact_resumable_agent_sessions() {
        let detail = resumable_task_detail();

        let broadcast = select_resumable_agents(&detail, &[]).expect("broadcast should resolve");
        assert_eq!(
            broadcast
                .iter()
                .map(|agent| agent.id.as_str())
                .collect::<Vec<_>>(),
            vec!["agent-1"]
        );
        assert!(select_resumable_agents(&detail, &["agent-2".to_string()]).is_err());
        assert!(
            select_resumable_agents(&detail, &["agent-1".to_string(), "agent-1".to_string()])
                .is_err()
        );
    }

    #[test]
    fn validates_follow_up_text_at_the_shared_prompt_boundary() {
        assert_eq!(
            validate_follow_up("  continue  ").expect("prompt should validate"),
            "continue"
        );
        assert_eq!(validate_follow_up("   "), Err(AppError::InvalidQuery));
        assert_eq!(
            validate_follow_up(&"x".repeat(16_001)),
            Err(AppError::InvalidQuery)
        );
    }

    #[test]
    fn accepts_only_the_exact_frozen_baseline_and_agent_execution_paths() {
        let mut detail = resumable_task_detail();

        assert_eq!(validate_frozen_paths(&detail), Ok(()));

        detail.agents[0].execution_relative_path =
            "task-runs/task-1/executions/agent-2/workspace".to_string();
        assert_eq!(
            validate_frozen_paths(&detail),
            Err(AppError::TaskPreparationFailed)
        );

        detail.agents[0].execution_relative_path = "/Users/me/project".to_string();
        assert_eq!(
            validate_frozen_paths(&detail),
            Err(AppError::TaskPreparationFailed)
        );

        detail.agents[0].execution_relative_path =
            "task-runs/task-1/executions/agent-1/workspace".to_string();
        detail.baseline_relative_path = "task-runs/task-2/baseline".to_string();
        assert_eq!(
            validate_frozen_paths(&detail),
            Err(AppError::TaskPreparationFailed)
        );
    }

    /// Builds a terminal Task with one resumable and two ineligible sessions.
    fn resumable_task_detail() -> TaskDetail {
        TaskDetail {
            prompt: "Initial".to_string(),
            baseline_relative_path: "task-runs/task-1/baseline".to_string(),
            task: Task {
                kind: crate::domain::task::TaskKind::Work,
                id: "task-1".to_string(),
                workspace_id: None,
                title: "Task".to_string(),
                status: TaskStatus::Failed,
                configuration_locked_at_ms: Some(1),
                pinned_at_ms: None,
                created_at_ms: 1,
                updated_at_ms: 2,
            },
            agents: vec![
                task_agent("agent-1", TaskStatus::Completed, Some("session-1")),
                task_agent("agent-2", TaskStatus::Failed, Some("session-2")),
                task_agent("agent-3", TaskStatus::Completed, None),
            ],
            permissions: TaskPermissions {
                file_access: "allow_edits".to_string(),
                command_execution: "allow".to_string(),
            },
            skills: Vec::new(),
            results: Vec::new(),
            turns: Vec::new(),
        }
    }

    /// Builds one frozen Agent fixture; for example, `session_id` enables resumption.
    fn task_agent(id: &str, status: TaskStatus, session_id: Option<&str>) -> TaskAgent {
        TaskAgent {
            id: id.to_string(),
            task_id: "task-1".to_string(),
            slot_index: 0,
            agent_kind: AgentKind::Codex,
            model_snapshot: Some("gpt-5".to_string()),
            mode_snapshot: Some("high".to_string()),
            session_id: session_id.map(str::to_string),
            execution_relative_path: format!("task-runs/task-1/executions/{id}/workspace"),
            status,
            created_at_ms: 1,
            updated_at_ms: 2,
        }
    }
}
