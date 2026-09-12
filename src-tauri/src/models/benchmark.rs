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
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) tag_id: String,
    pub(crate) author: String,
    pub(crate) source: Option<String>,
    pub(crate) archived: bool,
    pub(crate) created_at_ms: i64,
    pub(crate) updated_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    #[sea_orm(has_many = "version::Entity")]
    Versions,
}

impl Related<version::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Versions.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
