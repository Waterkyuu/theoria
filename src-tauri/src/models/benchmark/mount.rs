use sea_orm::entity::prelude::*;

/// Database row pinning one Benchmark version to a Workspace.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "workspace_benchmarks")]
pub(crate) struct Model {
    /// Stable local mount identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Workspace that owns the mount.
    pub(crate) workspace_id: String,
    /// Published Benchmark definition referenced by the mount.
    pub(crate) benchmark_id: String,
    /// Immutable version pinned for future Tasks.
    pub(crate) version_id: String,
    /// Optional pin time used by Workspace navigation ordering.
    pub(crate) pinned_at_ms: Option<i64>,
    /// Mount creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
