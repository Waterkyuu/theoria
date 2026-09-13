use sea_orm::entity::prelude::*;

/// Database row for one completed Benchmark evaluation.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_evaluations")]
pub(crate) struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) execution_id: String,
    pub(crate) verdict: String,
    pub(crate) validator_version: i64,
    pub(crate) report_json: String,
    pub(crate) created_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
