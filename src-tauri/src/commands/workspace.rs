use crate::domain::workspace::Workspace;
use crate::error::IpcError;
use crate::services::cleanup::WorkspaceCleanupService;
use crate::services::workspace::WorkspaceService;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

/// Request for registering a user-owned input directory.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegisterExternalWorkspaceRequest {
    /// User-visible Workspace name.
    name: String,
    /// Existing local directory that remains user-owned and read-only to Theoria tasks.
    source_path: PathBuf,
}

/// Request for creating an empty Theoria-managed input directory.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateManagedWorkspaceRequest {
    /// User-visible Workspace name.
    name: String,
}

/// Request for removing one complete Workspace collection.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoveWorkspaceRequest {
    /// Stable Workspace identifier.
    workspace_id: String,
    /// Required acknowledgement before managed template files are deleted.
    managed_files_confirmed: bool,
}

/// Workspace metadata safe for the desktop frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceResponse {
    /// Stable route and Task ownership identifier.
    id: String,
    /// User-visible Workspace name.
    name: String,
    /// Whether Theoria owns the template directory.
    source_kind: &'static str,
    /// Absolute local template directory shown to the user.
    source_path: PathBuf,
    /// Optional pin time used for sidebar ordering.
    pinned_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    updated_at_ms: i64,
}

impl From<Workspace> for WorkspaceResponse {
    fn from(workspace: Workspace) -> Self {
        Self {
            id: workspace.id,
            name: workspace.name,
            source_kind: workspace.source_kind.as_str(),
            source_path: workspace.source_path,
            pinned_at_ms: workspace.pinned_at_ms,
            created_at_ms: workspace.created_at_ms,
            updated_at_ms: workspace.updated_at_ms,
        }
    }
}

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
