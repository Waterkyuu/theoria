use crate::adapters::claude::ClaudeRuntimeSettingsCache;
use crate::adapters::codex::CodexRuntimeDefaultsCache;
use crate::dto::benchmark_task::{BenchmarkTaskPreviewResponse, PreviewBenchmarkTaskRequest};
use crate::error::IpcError;
use crate::services::agent_runtime::{check_local_agent_login, AgentRuntimeCaches};
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
        .preview(request.try_into()?, move |kind| {
            check_local_agent_login(kind, &caches)
        })
        .await
        .map(Into::into)
        .map_err(Into::into)
}
