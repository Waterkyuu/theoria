use crate::dto::skill::{
    ImportLocalSkillRequest, ListWorkspaceSkillsRequest, SkillResponse, WorkspaceSkillRequest,
};
use crate::error::IpcError;
use crate::services::skill::SkillLibraryService;
use tauri::State;

/// Imports an independent copy of one local Skill folder.
#[tauri::command]
pub(crate) async fn import_local_skill(
    request: ImportLocalSkillRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<SkillResponse, IpcError> {
    service
        .import_local_folder(request.source_path)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Lists active managed Skills.
#[tauri::command]
pub(crate) async fn list_skills(
    service: State<'_, SkillLibraryService>,
) -> Result<Vec<SkillResponse>, IpcError> {
    service
        .list()
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

/// Mounts one managed Skill to affect only future Workspace Tasks.
#[tauri::command]
pub(crate) async fn mount_workspace_skill(
    request: WorkspaceSkillRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<SkillResponse, IpcError> {
    service
        .mount_to_workspace(&request.workspace_id, &request.skill_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

/// Removes one future-Task Workspace Skill mount.
#[tauri::command]
pub(crate) async fn unmount_workspace_skill(
    request: WorkspaceSkillRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<(), IpcError> {
    service
        .unmount_from_workspace(&request.workspace_id, &request.skill_id)
        .await
        .map_err(Into::into)
}

/// Lists active Skill Library mounts for one Workspace.
#[tauri::command]
pub(crate) async fn list_workspace_skills(
    request: ListWorkspaceSkillsRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<Vec<SkillResponse>, IpcError> {
    service
        .list_for_workspace(&request.workspace_id)
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}
