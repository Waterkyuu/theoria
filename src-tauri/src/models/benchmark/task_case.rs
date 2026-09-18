use sea_orm::entity::prelude::*;

/// Database row pinning one immutable case to a Benchmark Task.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_task_cases")]
pub(crate) struct Model {
    /// Stable Task Case row identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Parent Benchmark Task identifier.
    pub(crate) task_id: String,
    /// Immutable published Case identifier.
    pub(crate) case_id: String,
    /// Published version that owns the frozen Case.
    pub(crate) version_id: String,
    /// Stable matrix row order.
    pub(crate) position: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
