use crate::dto::benchmark::{
    BenchmarkDetailResponse, BenchmarkDraftResponse, BenchmarkMountResponse,
    BenchmarkSummaryResponse, BenchmarkTagResponse, ListBenchmarksRequest, MountBenchmarkRequest,
    PublishBenchmarkRequest, SaveBenchmarkDraftRequest,
};
use crate::dto::benchmark::{
    CreateBenchmarkTagRequest, GetBenchmarkDraftRequest, GetBenchmarkRequest,
    ListBenchmarkDraftsRequest, ListWorkspaceBenchmarksRequest, UnmountBenchmarkRequest,
};
use crate::error::IpcError;
use crate::services::benchmark::BenchmarkService;
use tauri::State;

/// Lists local tag names and Gravity icons.
#[tauri::command]
pub(crate) async fn list_benchmark_tags(
    service: State<'_, BenchmarkService>,
) -> Result<Vec<BenchmarkTagResponse>, IpcError> {
    service
        .tags()
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}
/// Creates a tag for use by personal Benchmark definitions.
#[tauri::command]
pub(crate) async fn create_benchmark_tag(
    request: CreateBenchmarkTagRequest,
    service: State<'_, BenchmarkService>,
) -> Result<BenchmarkTagResponse, IpcError> {
    service
        .create_tag(&request.name, &request.icon)
        .await
        .map(Into::into)
        .map_err(Into::into)
}
/// Persists an incomplete editor document with revision checking.
#[tauri::command]
pub(crate) async fn save_benchmark_draft(
    request: SaveBenchmarkDraftRequest,
    service: State<'_, BenchmarkService>,
) -> Result<BenchmarkDraftResponse, IpcError> {
    service
        .save_draft(
            request.draft_id,
            request.expected_revision,
            request.document,
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}
/// Loads the selected editor document.
#[tauri::command]
pub(crate) async fn get_benchmark_draft(
    request: GetBenchmarkDraftRequest,
    service: State<'_, BenchmarkService>,
) -> Result<BenchmarkDraftResponse, IpcError> {
    service
        .draft(&request.draft_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}
/// Returns a bounded page of draft identifiers.
#[tauri::command]
pub(crate) async fn list_benchmark_drafts(
    request: ListBenchmarkDraftsRequest,
    service: State<'_, BenchmarkService>,
) -> Result<Vec<String>, IpcError> {
    service.drafts(request.page).await.map_err(Into::into)
}
/// Publishes the saved and reviewed draft revision.
#[tauri::command]
pub(crate) async fn publish_benchmark(
    request: PublishBenchmarkRequest,
    service: State<'_, BenchmarkService>,
) -> Result<BenchmarkDetailResponse, IpcError> {
    service
        .publish(&request.draft_id, request.expected_revision)
        .await
        .map(Into::into)
        .map_err(Into::into)
}
/// Searches published Benchmark cards.
#[tauri::command]
pub(crate) async fn list_benchmarks(
    request: ListBenchmarksRequest,
    service: State<'_, BenchmarkService>,
) -> Result<Vec<BenchmarkSummaryResponse>, IpcError> {
    service
        .list(
            &request.search,
            request.tag_id.as_deref(),
            request.author.as_deref(),
            request.page,
        )
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}
/// Shared detail endpoint for catalog and workspace contexts.
#[tauri::command]
pub(crate) async fn get_benchmark(
    request: GetBenchmarkRequest,
    service: State<'_, BenchmarkService>,
) -> Result<BenchmarkDetailResponse, IpcError> {
    service
        .detail(&request.benchmark_id, request.version_id.as_deref())
        .await
        .map(Into::into)
        .map_err(Into::into)
}
/// Pins a published version in the selected workspace.
#[tauri::command]
pub(crate) async fn mount_benchmark(
    request: MountBenchmarkRequest,
    service: State<'_, BenchmarkService>,
) -> Result<BenchmarkMountResponse, IpcError> {
    service
        .mount(
            request.workspace_id,
            request.benchmark_id,
            request.version_id,
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}
/// Loads a page of workspace mounts.
#[tauri::command]
pub(crate) async fn list_workspace_benchmarks(
    request: ListWorkspaceBenchmarksRequest,
    service: State<'_, BenchmarkService>,
) -> Result<Vec<BenchmarkMountResponse>, IpcError> {
    service
        .mounts(&request.workspace_id, request.page)
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}
/// Removes a mount without removing content or results.
#[tauri::command]
pub(crate) async fn unmount_benchmark(
    request: UnmountBenchmarkRequest,
    service: State<'_, BenchmarkService>,
) -> Result<(), IpcError> {
    service
        .unmount(&request.workspace_id, &request.mount_id)
        .await
        .map_err(Into::into)
}
