pub(crate) mod case;
pub(crate) mod draft;
pub(crate) mod evaluation;
pub(crate) mod execution;
pub(crate) mod mount;
pub(crate) mod tag;
pub(crate) mod task;
pub(crate) mod task_agent;
pub(crate) mod task_case;
pub(crate) mod version;

use sea_orm::entity::prelude::*;

/// Database row for one Benchmark catalog definition.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmarks")]
pub(crate) struct Model {
    /// Stable local Benchmark definition identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Current catalog display name.
    pub(crate) name: String,
    /// Current catalog description.
    pub(crate) description: String,
    /// Classification currently assigned to the definition.
    pub(crate) tag_id: String,
    /// Stable application-owned author category.
    pub(crate) author: String,
    /// Optional external attribution.
    pub(crate) source: Option<String>,
    /// Whether the definition rejects new mounts.
    pub(crate) archived: bool,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    /// Immutable published versions owned by this definition.
    #[sea_orm(has_many = "version::Entity")]
    Versions,
}

impl Related<version::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Versions.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
