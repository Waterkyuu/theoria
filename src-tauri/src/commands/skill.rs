use crate::dto::skill::{
    CreatePlatformSkillRequest, ImportGitSkillRequest, ImportLocalSkillRequest,
    ListWorkspaceSkillsRequest, SkillRequest, SkillResponse, WorkspaceSkillRequest,
};
use crate::error::IpcError;
use crate::platform::skill_folder_picker;
use crate::services::skill::SkillLibraryService;
use tauri::{AppHandle, State};

/// Opens a native folder picker that exposes hidden Skill locations such as `.agents/skills`.
#[tauri::command]
pub(crate) async fn select_skill_folder(
    title: String,
    app: AppHandle,
) -> Result<Option<String>, IpcError> {
    skill_folder_picker::select_skill_folder(app, title)
        .await
        .map_err(Into::into)
}

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

/// Creates a minimal Skill directly in Theoria-managed storage.
#[tauri::command]
pub(crate) async fn create_platform_skill(
    request: CreatePlatformSkillRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<SkillResponse, IpcError> {
    let result = match request.files {
        Some(files) => {
            service
                .create_editor_skill(files, request.directories)
                .await
        }
        None => {
            service
                .create_platform_skill(request.display_name, request.description, request.content)
                .await
        }
    };
    result.map(Into::into).map_err(Into::into)
}

/// Clones and imports the root Skill or every Skill under a repository's `skills/` directory.
#[tauri::command]
pub(crate) async fn import_git_skill(
    request: ImportGitSkillRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<Vec<SkillResponse>, IpcError> {
    service
        .import_git_repository(request.git_url)
        .await
        .map(|items| items.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

/// Pulls a fresh managed copy from a Git-backed Skill's saved remote URL.
#[tauri::command]
pub(crate) async fn update_git_skill(
    request: SkillRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<SkillResponse, IpcError> {
    service
        .update_git_skill(&request.skill_id)
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

/// Removes one managed Skill, its local copy, and all future-Task Workspace mounts.
#[tauri::command]
pub(crate) async fn remove_skill(
    request: SkillRequest,
    service: State<'_, SkillLibraryService>,
) -> Result<(), IpcError> {
    service.remove(&request.skill_id).await.map_err(Into::into)
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
