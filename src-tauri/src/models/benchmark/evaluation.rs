use sea_orm::entity::prelude::*;

/// Database row for one completed Benchmark evaluation.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_evaluations")]
pub(crate) struct Model {
    /// Execution cell evaluated by this immutable result.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) execution_id: String,
    /// Stable passed or failed verdict.
    pub(crate) verdict: String,
    /// Evaluator contract version used for this result.
    pub(crate) validator_version: i64,
    /// Complete bounded evaluation report serialized as JSON.
    pub(crate) report_json: String,
    /// Evaluation completion time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
