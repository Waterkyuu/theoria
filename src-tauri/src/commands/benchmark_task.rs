use crate::adapters::claude::ClaudeRuntimeSettingsCache;
use crate::adapters::codex::CodexRuntimeDefaultsCache;
use crate::dto::benchmark_task::{
    BenchmarkArtifactFileResponse, BenchmarkArtifactPreviewResponse, BenchmarkTaskDetailResponse,
    BenchmarkTaskPreviewResponse, GetBenchmarkTaskRequest, ListBenchmarkExecutionArtifactsRequest,
    PreviewBenchmarkExecutionArtifactRequest, PreviewBenchmarkTaskRequest,
    RerunBenchmarkTaskRequest, StartBenchmarkTaskRequest,
};
use crate::error::IpcError;
use crate::services::agent_runtime::AgentRuntimeCaches;
use crate::services::benchmark_task::BenchmarkTaskService;
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
        .preview_with_runtime(request.try_into()?, caches)
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
    service
        .start_and_execute(
            configuration,
            &request.idempotency_key,
            AgentRuntimeCaches {
                codex: codex_cache.inner().clone(),
                claude: claude_cache.inner().clone(),
            },
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Creates a new Task from a terminal Benchmark Task and preserves its historical version.
#[tauri::command]
pub(crate) async fn rerun_benchmark_task(
    request: RerunBenchmarkTaskRequest,
    service: State<'_, BenchmarkTaskService>,
    codex_cache: State<'_, CodexRuntimeDefaultsCache>,
    claude_cache: State<'_, ClaudeRuntimeSettingsCache>,
) -> Result<BenchmarkTaskDetailResponse, IpcError> {
    let configuration = (&request).try_into()?;
    service
        .rerun_and_execute(
            configuration,
            &request.idempotency_key,
            AgentRuntimeCaches {
                codex: codex_cache.inner().clone(),
                claude: claude_cache.inner().clone(),
            },
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
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

/// Lists the read-only final files for one finished matrix cell.
#[tauri::command]
pub(crate) async fn list_benchmark_execution_artifacts(
    request: ListBenchmarkExecutionArtifactsRequest,
    service: State<'_, BenchmarkTaskService>,
) -> Result<Vec<BenchmarkArtifactFileResponse>, IpcError> {
    service
        .execution_artifacts(&request.task_id, &request.execution_id)
        .await
        .map(|files| files.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

/// Returns one bounded text preview without returning a machine-local path.
#[tauri::command]
pub(crate) async fn preview_benchmark_execution_artifact(
    request: PreviewBenchmarkExecutionArtifactRequest,
    service: State<'_, BenchmarkTaskService>,
) -> Result<BenchmarkArtifactPreviewResponse, IpcError> {
    service
        .execution_artifact_preview(&request.task_id, &request.execution_id, &request.path)
        .await
        .map(Into::into)
        .map_err(Into::into)
}
