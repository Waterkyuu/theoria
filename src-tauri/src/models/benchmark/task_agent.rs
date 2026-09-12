use sea_orm::entity::prelude::*;

/// Database row for one Agent selected by a Benchmark Task.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_task_agents")]
pub(crate) struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    pub(crate) task_id: String,
    pub(crate) agent_kind: String,
    pub(crate) position: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
