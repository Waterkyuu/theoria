use crate::dto::workspace::{
    CreateManagedWorkspaceRequest, RegisterExternalWorkspaceRequest, RemoveWorkspaceRequest,
    RenameWorkspaceRequest, SetWorkspacePinRequest, WorkspaceResponse,
};
use crate::error::IpcError;
use crate::services::cleanup::WorkspaceCleanupService;
use crate::services::workspace::WorkspaceService;
use tauri::State;

/// Registers an external Workspace without modifying the selected directory.
#[tauri::command]
pub(crate) async fn register_external_workspace(
    request: RegisterExternalWorkspaceRequest,
    service: State<'_, WorkspaceService>,
) -> Result<WorkspaceResponse, IpcError> {
    service
        .register_external(request.name, request.source_path)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Creates a managed Workspace template in application storage.
#[tauri::command]
pub(crate) async fn create_managed_workspace(
    request: CreateManagedWorkspaceRequest,
    service: State<'_, WorkspaceService>,
) -> Result<WorkspaceResponse, IpcError> {
    service
        .create_managed(request.name)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Lists reusable Workspace inputs for navigation and selection.
#[tauri::command]
pub(crate) async fn list_workspaces(
    service: State<'_, WorkspaceService>,
) -> Result<Vec<WorkspaceResponse>, IpcError> {
    service
        .list()
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

/// Changes one Workspace name after applying the creation-time validation rules.
#[tauri::command]
pub(crate) async fn rename_workspace(
    request: RenameWorkspaceRequest,
    service: State<'_, WorkspaceService>,
) -> Result<WorkspaceResponse, IpcError> {
    service
        .rename(&request.workspace_id, request.name)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Changes whether one Workspace is pinned to the top of the sidebar.
#[tauri::command]
pub(crate) async fn set_workspace_pin(
    request: SetWorkspacePinRequest,
    service: State<'_, WorkspaceService>,
) -> Result<WorkspaceResponse, IpcError> {
    service
        .set_pin(&request.workspace_id, request.is_pinned)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Removes Workspace Tasks and mounts while protecting external source files.
#[tauri::command]
pub(crate) async fn remove_workspace(
    request: RemoveWorkspaceRequest,
    service: State<'_, WorkspaceCleanupService>,
) -> Result<(), IpcError> {
    service
        .remove_workspace(&request.workspace_id, request.managed_files_confirmed)
        .await
        .map_err(Into::into)
}
