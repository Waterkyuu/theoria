use std::path::PathBuf;

/// Ownership model for a reusable Workspace input template.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WorkspaceSourceKind {
    External,
    Managed,
}

impl WorkspaceSourceKind {
    /// Returns the stable SQLite and IPC identifier.
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::External => "external",
            Self::Managed => "managed",
        }
    }

    /// Parses a source identifier read from trusted migrated storage.
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "external" => Some(Self::External),
            "managed" => Some(Self::Managed),
            _ => None,
        }
    }
}

/// Persisted Workspace input template.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Workspace {
    /// Stable local identifier used by Tasks and routes.
    pub(crate) id: String,
    /// User-visible Workspace name.
    pub(crate) name: String,
    /// Whether the source is user-owned or managed by Theoria.
    pub(crate) source_kind: WorkspaceSourceKind,
    /// Absolute input template directory.
    pub(crate) source_path: PathBuf,
    /// Optional pin time used for list ordering.
    pub(crate) pinned_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

/// Validated values required to register a Workspace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NewWorkspace {
    /// Stable identifier allocated before persistence.
    pub(crate) id: String,
    /// User-visible Workspace name.
    pub(crate) name: String,
    /// Ownership model for the source directory.
    pub(crate) source_kind: WorkspaceSourceKind,
    /// Absolute input template directory.
    pub(crate) source_path: PathBuf,
    /// Creation and initial update time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
}
