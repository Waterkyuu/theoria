use std::path::PathBuf;

/// Origin metadata retained for a managed Skill.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SkillSourceType {
    LocalFolder,
    Platform,
    Git,
}

impl SkillSourceType {
    /// Returns the stable persisted and IPC identifier.
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::LocalFolder => "local_folder",
            Self::Platform => "platform",
            Self::Git => "git",
        }
    }

    /// Parses an origin identifier read from trusted migrated storage.
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "local_folder" => Some(Self::LocalFolder),
            "platform" => Some(Self::Platform),
            "git" => Some(Self::Git),
            _ => None,
        }
    }
}

/// Theoria-managed Skill Library entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Skill {
    /// Stable local identifier.
    pub(crate) id: String,
    /// Directory name copied into Task project Skill snapshots.
    pub(crate) folder_name: String,
    /// User-visible Skill name.
    pub(crate) display_name: String,
    /// Short capability description.
    pub(crate) description: String,
    /// How the Skill entered the Library.
    pub(crate) source_type: SkillSourceType,
    /// Managed path relative to application data.
    pub(crate) storage_relative_path: PathBuf,
    /// Original source directory when imported.
    pub(crate) source_path: Option<PathBuf>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

/// Values inserted for a newly managed Skill.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NewSkill {
    /// Stable identifier allocated before filesystem copying.
    pub(crate) id: String,
    /// Valid project Skill directory name.
    pub(crate) folder_name: String,
    /// User-visible Skill name.
    pub(crate) display_name: String,
    /// Short capability description.
    pub(crate) description: String,
    /// Import origin.
    pub(crate) source_type: SkillSourceType,
    /// Managed path relative to application data.
    pub(crate) storage_relative_path: PathBuf,
    /// Original import path.
    pub(crate) source_path: Option<PathBuf>,
    /// Creation and initial update time.
    pub(crate) created_at_ms: i64,
}
