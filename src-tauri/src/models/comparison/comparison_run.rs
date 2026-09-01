use sea_orm::entity::prelude::*;

/// Database row for one performance comparison.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "comparison_runs")]
pub(crate) struct Model {
    /// SQLite integer primary key.
    #[sea_orm(primary_key)]
    pub(crate) id: i64,
    /// Shared task submitted to every selected Agent.
    pub(crate) query: String,
    /// Aggregate completion state.
    pub(crate) status: String,
    /// Metric calculation contract version.
    pub(crate) metric_version: i64,
    /// UTC Unix timestamp in milliseconds.
    pub(crate) created_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    /// Agent results owned by this comparison.
    #[sea_orm(has_many = "super::comparison_result::Entity")]
    Results,
}

impl Related<super::comparison_result::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Results.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
