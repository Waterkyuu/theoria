use sea_orm::entity::prelude::*;

/// Database row for one reusable Workspace input.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "workspaces")]
pub(crate) struct Model {
    /// Stable local Workspace identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// User-visible Workspace name.
    pub(crate) name: String,
    /// Stable source ownership identifier.
    pub(crate) source_kind: String,
    /// Absolute input template directory.
    pub(crate) source_path: String,
    /// Optional pin time used for list ordering.
    pub(crate) pinned_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
