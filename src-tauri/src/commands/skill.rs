use crate::domain::skill::Skill;
use crate::error::IpcError;
use crate::services::skill::SkillLibraryService;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

/// Request for copying a local Skill directory into the Library.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportLocalSkillRequest {
    /// Existing directory containing a valid SKILL.md.
    source_path: PathBuf,
}

/// Managed Skill metadata safe for frontend selection and mounting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillResponse {
    /// Stable Library identifier.
    id: String,
    /// Directory name used in project Skill snapshots.
    folder_name: String,
    /// User-visible Skill name.
    display_name: String,
    /// Short capability description.
    description: String,
    /// Import origin identifier.
    source_type: &'static str,
    /// Original import directory when available.
    source_path: Option<PathBuf>,
    /// Creation time in Unix milliseconds.
    created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    updated_at_ms: i64,
}

impl From<Skill> for SkillResponse {
    fn from(skill: Skill) -> Self {
        Self {
            id: skill.id,
            folder_name: skill.folder_name,
            display_name: skill.display_name,
            description: skill.description,
            source_type: skill.source_type.as_str(),
            source_path: skill.source_path,
            created_at_ms: skill.created_at_ms,
            updated_at_ms: skill.updated_at_ms,
        }
    }
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
