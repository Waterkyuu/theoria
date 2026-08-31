use crate::domain::workspace::Workspace;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Request for registering a user-owned input directory.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegisterExternalWorkspaceRequest {
    /// User-visible Workspace name.
    pub(crate) name: String,
    /// Existing local directory that remains user-owned and read-only to Theoria tasks.
    pub(crate) source_path: PathBuf,
}

/// Request for creating an empty Theoria-managed input directory.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateManagedWorkspaceRequest {
    /// User-visible Workspace name.
    pub(crate) name: String,
}

/// Request for changing one Workspace's sidebar pin state.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetWorkspacePinRequest {
    /// Stable Workspace identifier.
    pub(crate) workspace_id: String,
    /// Whether the Workspace should be pinned to the top of the sidebar.
    pub(crate) is_pinned: bool,
}

/// Request for removing one complete Workspace collection.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoveWorkspaceRequest {
    /// Stable Workspace identifier.
    pub(crate) workspace_id: String,
    /// Required acknowledgement before managed template files are deleted.
    pub(crate) managed_files_confirmed: bool,
}

/// Workspace metadata safe for the desktop frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceResponse {
    /// Stable route and Task ownership identifier.
    pub(crate) id: String,
    /// User-visible Workspace name.
    pub(crate) name: String,
    /// Whether Theoria owns the template directory.
    pub(crate) source_kind: &'static str,
    /// Absolute local template directory shown to the user.
    pub(crate) source_path: PathBuf,
    /// Optional pin time used for sidebar ordering.
    pub(crate) pinned_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
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
