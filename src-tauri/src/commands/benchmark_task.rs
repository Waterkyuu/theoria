use crate::adapters::agent::{AgentExecutionConfig, AgentSessionRunOutput};
use crate::adapters::claude::ClaudeRuntimeSettingsCache;
use crate::adapters::codex::CodexRuntimeDefaultsCache;
use crate::dto::benchmark_task::{
    BenchmarkAgentRequest, BenchmarkTaskDetailResponse, BenchmarkTaskPreviewResponse,
    GetBenchmarkTaskRequest, PreviewBenchmarkTaskRequest, StartBenchmarkTaskRequest,
};
use crate::error::{AppError, IpcError};
use crate::services::agent_runtime::{check_local_agent_login, run_agent_turn, AgentRuntimeCaches};
use crate::services::benchmark_task::BenchmarkTaskService;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::State;

/// Checks launch prerequisites without creating a Task or invoking an Agent execution.
#[tauri::command]
pub(crate) async fn preview_benchmark_task(
    request: PreviewBenchmarkTaskRequest,
    service: State<'_, BenchmarkTaskService>,
    codex_cache: State<'_, CodexRuntimeDefaultsCache>,
    claude_cache: State<'_, ClaudeRuntimeSettingsCache>,
) -> Result<BenchmarkTaskPreviewResponse, IpcError> {
    let caches = AgentRuntimeCaches {
        codex: codex_cache.inner().clone(),
        claude: claude_cache.inner().clone(),
    };
    service
        .preview(request.try_into()?, move |kind| {
            check_local_agent_login(kind, &caches)
        })
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Atomically creates one Benchmark Task and schedules its complete execution matrix.
#[tauri::command]
pub(crate) async fn start_benchmark_task(
    request: StartBenchmarkTaskRequest,
    service: State<'_, BenchmarkTaskService>,
    codex_cache: State<'_, CodexRuntimeDefaultsCache>,
    claude_cache: State<'_, ClaudeRuntimeSettingsCache>,
) -> Result<BenchmarkTaskDetailResponse, IpcError> {
    let configuration = (&request).try_into()?;
    let detail = service
        .start(configuration, &request.idempotency_key)
        .await
        .map_err(IpcError::from)?;
    let task_id = detail.task.id.clone();
    let worker = service.inner().clone();
    let codex_cache = codex_cache.inner().clone();
    let claude_cache = claude_cache.inner().clone();
    tauri::async_runtime::spawn(async move {
        if worker
            .execute_with(&task_id, move |invocation| {
                run_benchmark_agent(
                    invocation,
                    AgentRuntimeCaches {
                        codex: codex_cache.clone(),
                        claude: claude_cache.clone(),
                    },
                )
            })
            .await
            .is_err()
        {
            eprintln!("Benchmark worker ended before reaching a terminal Task state");
        }
    });
    Ok(detail.into())
}

/// Applies the per-case deadline while dispatching through the shared Agent runtime.
fn run_benchmark_agent(
    request: BenchmarkAgentRequest,
    caches: AgentRuntimeCaches,
) -> Result<AgentSessionRunOutput, AppError> {
    let cancelled = request.cancellation.clone();
    let timed_out = Arc::new(AtomicBool::new(false));
    let (finished_sender, finished_receiver) = std::sync::mpsc::channel();
    std::thread::scope(|scope| {
        let cancellation = cancelled.clone();
        let timeout_signal = timed_out.clone();
        scope.spawn(move || {
            if finished_receiver.recv_timeout(request.timeout).is_err() {
                timeout_signal.store(true, Ordering::Release);
                cancellation.store(true, Ordering::Release);
            }
        });
        let started_at = Instant::now();
        let result = run_agent_turn(
            request.agent_kind,
            &request.prompt,
            &request.working_directory,
            AgentExecutionConfig {
                model: request.model.as_deref(),
                mode: request.mode.as_deref(),
                file_access: Some(&request.file_access),
                command_execution: Some(&request.command_execution),
            },
            caches,
            request.session_id.as_deref(),
            &cancelled,
        );
        let _ = finished_sender.send(());
        if timed_out.load(Ordering::Acquire) && started_at.elapsed() >= request.timeout {
            Err(match request.agent_kind {
                crate::domain::agent_kind::AgentKind::Codex => AppError::CodexTimedOut,
                crate::domain::agent_kind::AgentKind::Claude => AppError::ClaudeTimedOut,
                crate::domain::agent_kind::AgentKind::OpenCode => AppError::OpenCodeTimedOut,
                crate::domain::agent_kind::AgentKind::WorkBuddy => AppError::WorkBuddyTimedOut,
            })
        } else {
            result
        }
    })
}

/// Returns the current matrix, aggregate metrics, and terminal results for one Benchmark Task.
#[tauri::command]
pub(crate) async fn get_benchmark_task(
    request: GetBenchmarkTaskRequest,
    service: State<'_, BenchmarkTaskService>,
) -> Result<BenchmarkTaskDetailResponse, IpcError> {
    service
        .get(&request.task_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}
