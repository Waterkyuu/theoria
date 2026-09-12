use sea_orm::entity::prelude::*;

/// Database row extending a common Task with its Benchmark execution plan.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_tasks")]
pub(crate) struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) task_id: String,
    pub(crate) version_id: String,
    pub(crate) idempotency_key: String,
    pub(crate) request_json: String,
    pub(crate) rerun_of_task_id: Option<String>,
    pub(crate) result_completeness: String,
    pub(crate) completion_reason: Option<String>,
    pub(crate) cancel_requested: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
