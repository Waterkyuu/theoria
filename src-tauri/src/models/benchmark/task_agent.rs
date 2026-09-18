use sea_orm::entity::prelude::*;

/// Database row for one Agent selected by a Benchmark Task.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_task_agents")]
pub(crate) struct Model {
    /// Stable Task Agent row identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Parent Benchmark Task identifier.
    pub(crate) task_id: String,
    /// Stable local Agent product identifier.
    pub(crate) agent_kind: String,
    /// Stable matrix column order.
    pub(crate) position: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
