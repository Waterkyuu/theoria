use crate::adapters::agent::AgentSessionRunOutput;
use crate::adapters::agent::{AgentAdapter, AgentExecutionConfig};
use crate::adapters::claude::{ClaudeRuntimeSettingsCache, SystemClaudeAdapter};
use crate::adapters::codex::{CodexRuntimeDefaultsCache, SystemCodexAdapter};
use crate::adapters::opencode::SystemOpenCodeAdapter;
use crate::adapters::workbuddy::SystemWorkBuddyAdapter;
use crate::domain::agent_kind::AgentKind;
use crate::domain::agent_run::{AgentRunMetrics, AgentRunOutput, TokenUsage, ToolCallMetric};
use crate::domain::task::{TaskAgent, TaskAgentResult, TaskDetail, TaskStatus};
use crate::error::{AppError, IpcError};
use crate::repositories::task::TaskRepository;
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
        let detail = match self
            .repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
        {
            Some(detail) => detail,
            None => return Ok(()),
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
        self.repository
            .mark_running(task_id, current_time_ms()?)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?;
        let mut executions = Vec::with_capacity(detail.agents.len());
        for agent in detail.agents.clone() {
            let prompt = detail.task.prompt.clone();
            let execution_directory = self.app_data_directory.join(&agent.execution_relative_path);
            let model_snapshot = agent.model_snapshot.clone();
            let mode_snapshot = agent.mode_snapshot.clone();
            let codex_cache = codex_cache.clone();
            let claude_cache = claude_cache.clone();
            let cancellation = self.active_executions.register(&agent.id);
            let runner_cancellation = cancellation.clone();
            let handle = tokio::task::spawn_blocking(move || {
                run_one_agent(
                    agent.agent_kind,
                    &prompt,
                    &execution_directory,
                    AgentExecutionConfig {
                        model: model_snapshot.as_deref(),
                        mode: mode_snapshot.as_deref(),
                    },
                    AgentRuntimeCaches {
                        codex: codex_cache,
                        claude: claude_cache,
                    },
                    None,
                    &runner_cancellation,
                )
            });
            executions.push((agent, cancellation, handle));
        }
        let mut final_statuses = Vec::with_capacity(executions.len());
        for (agent, cancellation, handle) in executions {
            let output = handle.await.map_err(|_| AppError::WorkerFailed)?;
            self.active_executions.remove(&agent.id);
            let updated_at_ms = current_time_ms()?;
            if !cancellation.load(Ordering::Acquire) && output.as_ref().is_err_and(is_waiting_error)
            {
                self.repository
                    .set_agent_status(&agent.id, TaskStatus::Waiting, updated_at_ms)
                    .await
                    .map_err(|_| AppError::TaskDatabaseFailed)?;
                final_statuses.push(TaskStatus::Waiting);
                continue;
            }
            let changes = self
                .result_collector
                .collect(
                    task_id,
                    &agent.id,
                    Path::new(&detail.task.baseline_relative_path),
                    Path::new(&agent.execution_relative_path),
                )
                .await;
            let (status, response_text, metrics_json) = if cancellation.load(Ordering::Acquire) {
                (
                    TaskStatus::Stopped,
                    Some("Execution stopped by user.".to_string()),
                    serde_json::json!({"files": changes.as_ref().ok().map(changes_json)})
                        .to_string(),
                )
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
                    &detail.task.prompt,
                    output
                        .as_ref()
                        .ok()
                        .and_then(|run| run.session_id.as_deref()),
                    updated_at_ms,
                )
                .await
                .map_err(|_| AppError::TaskDatabaseFailed)?;
            final_statuses.push(status);
        }
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
            let prompt = prompt.clone();
            let codex_cache = codex_cache.clone();
            let claude_cache = claude_cache.clone();
            let cancellation = self.active_executions.register(&agent.id);
            let runner_cancellation = cancellation.clone();
            let handle = tokio::task::spawn_blocking(move || {
                run_one_agent(
                    agent.agent_kind,
                    &prompt,
                    &execution_directory,
                    AgentExecutionConfig {
                        model: model_snapshot.as_deref(),
                        mode: mode_snapshot.as_deref(),
                    },
                    AgentRuntimeCaches {
                        codex: codex_cache,
                        claude: claude_cache,
                    },
                    session_id.as_deref(),
                    &runner_cancellation,
                )
            });
            executions.push((agent, cancellation, handle));
        }

        for (agent, cancellation, handle) in executions {
            let output = handle.await.map_err(|_| AppError::WorkerFailed)?;
            self.active_executions.remove(&agent.id);
            let updated_at_ms = current_time_ms()?;
            if !cancellation.load(Ordering::Acquire) && output.as_ref().is_err_and(is_waiting_error)
            {
                self.repository
                    .set_agent_status(&agent.id, TaskStatus::Waiting, updated_at_ms)
                    .await
                    .map_err(|_| AppError::TaskDatabaseFailed)?;
                continue;
            }
            let changes = self
                .result_collector
                .collect(
                    task_id,
                    &agent.id,
                    Path::new(&detail.task.baseline_relative_path),
                    Path::new(&agent.execution_relative_path),
                )
                .await;
            let (status, response_text, metrics_json) = if cancellation.load(Ordering::Acquire) {
                (
                    TaskStatus::Stopped,
                    Some("Execution stopped by user.".to_string()),
                    serde_json::json!({"files": changes.as_ref().ok().map(changes_json)})
                        .to_string(),
                )
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
                    &prompt,
                    output
                        .as_ref()
                        .ok()
                        .and_then(|run| run.session_id.as_deref()),
                    updated_at_ms,
                )
                .await
                .map_err(|_| AppError::TaskDatabaseFailed)?;
        }
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
}

/// Runtime configuration caches shared with one blocking Agent adapter call.
struct AgentRuntimeCaches {
    /// Cached Codex configuration monitor state.
    codex: CodexRuntimeDefaultsCache,
    /// Cached Claude configuration monitor state.
    claude: ClaudeRuntimeSettingsCache,
}

/// Dispatches one local Agent while preserving the exact prepared cwd.
fn run_one_agent(
    agent_kind: AgentKind,
    prompt: &str,
    execution_directory: &Path,
    config: AgentExecutionConfig<'_>,
    caches: AgentRuntimeCaches,
    session_id: Option<&str>,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    match agent_kind {
        AgentKind::Codex => SystemCodexAdapter::new(caches.codex)
            .run_session_turn_with_config_cancellable(
                prompt,
                execution_directory,
                config,
                session_id,
                cancelled,
            ),
        AgentKind::Claude => SystemClaudeAdapter::new(caches.claude)
            .run_session_turn_with_config_cancellable(
                prompt,
                execution_directory,
                config,
                session_id,
                cancelled,
            ),
        AgentKind::OpenCode => SystemOpenCodeAdapter.run_session_turn_with_config_cancellable(
            prompt,
            execution_directory,
            config,
            session_id,
            cancelled,
        ),
        AgentKind::WorkBuddy => SystemWorkBuddyAdapter.run_session_turn_with_config_cancellable(
            prompt,
            execution_directory,
            config,
            session_id,
            cancelled,
        ),
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

/// Distinguishes a resumable input request from a terminal Agent failure.
fn is_waiting_error(error: &AppError) -> bool {
    matches!(
        error,
        AppError::CodexNeedsInput | AppError::ClaudeNeedsInput | AppError::WorkBuddyNeedsInput
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
    u64::try_from(duration.as_millis()).map_or(u64::MAX, |milliseconds| milliseconds)
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
    use super::{aggregate_status, select_resumable_agents, validate_follow_up};
    use crate::domain::agent_kind::AgentKind;
    use crate::domain::task::{Task, TaskAgent, TaskDetail, TaskPermissions, TaskStatus};
    use crate::error::AppError;

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

    /// Builds a terminal Task with one resumable and two ineligible sessions.
    fn resumable_task_detail() -> TaskDetail {
        TaskDetail {
            task: Task {
                id: "task-1".to_string(),
                workspace_id: None,
                title: "Task".to_string(),
                prompt: "Initial".to_string(),
                baseline_relative_path: "task-runs/task-1/baseline".to_string(),
                status: TaskStatus::Failed,
                configuration_locked_at_ms: Some(1),
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
            execution_relative_path: format!("task-runs/task-1/agents/{id}"),
            status,
            created_at_ms: 1,
            updated_at_ms: 2,
        }
    }
}
