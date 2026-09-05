use crate::domain::skill::Skill;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Request for copying a local Skill directory into the Library.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportLocalSkillRequest {
    /// Existing directory containing a valid SKILL.md.
    pub(crate) source_path: PathBuf,
}

/// Request for creating a minimal Skill directly in Theoria.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreatePlatformSkillRequest {
    /// User-visible Skill name used to derive its managed folder name.
    pub(crate) display_name: String,
    /// Short capability description stored in frontmatter.
    pub(crate) description: String,
    /// Main Skill instructions written below frontmatter.
    pub(crate) content: String,
}

/// Request for cloning a Skill from a Git repository URL.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportGitSkillRequest {
    /// Clone URL containing a root Skill or independently installable Skills under `skills/`.
    pub(crate) git_url: String,
}

/// Request identifying one managed Skill.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillRequest {
    /// Stable Library identifier.
    pub(crate) skill_id: String,
}

/// Request identifying one Workspace Skill mount.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSkillRequest {
    /// Workspace whose future Tasks inherit the mount.
    pub(crate) workspace_id: String,
    /// Managed Library Skill to mount or unmount.
    pub(crate) skill_id: String,
}

/// Request identifying the Workspace whose mounts should be listed.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListWorkspaceSkillsRequest {
    /// Stable Workspace identifier.
    pub(crate) workspace_id: String,
}

/// Managed Skill metadata safe for frontend selection and mounting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillResponse {
    /// Stable Library identifier.
    pub(crate) id: String,
    /// Directory name used in project Skill snapshots.
    pub(crate) folder_name: String,
    /// User-visible Skill name.
    pub(crate) display_name: String,
    /// Short capability description.
    pub(crate) description: String,
    /// Import origin identifier.
    pub(crate) source_type: &'static str,
    /// Original import directory when available.
    pub(crate) source_path: Option<PathBuf>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
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
