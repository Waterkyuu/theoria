use sea_orm::entity::prelude::*;

/// Database row extending a common Task with its Benchmark execution plan.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_tasks")]
pub(crate) struct Model {
    /// Common Task row extended by this Benchmark plan.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) task_id: String,
    /// Immutable published version executed by the Task.
    pub(crate) version_id: String,
    /// Client retry identity for this exact launch request.
    pub(crate) idempotency_key: String,
    /// Canonical launch request used to detect key conflicts.
    pub(crate) request_json: String,
    /// Historical Task that initiated this Rerun, when present.
    pub(crate) rerun_of_task_id: Option<String>,
    /// Whether every planned cell reached a normal terminal result.
    pub(crate) result_completeness: String,
    /// Stable reason for an incomplete result matrix.
    pub(crate) completion_reason: Option<String>,
    /// Whether the user requested cancellation.
    pub(crate) cancel_requested: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
