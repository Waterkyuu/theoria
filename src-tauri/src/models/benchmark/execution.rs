use sea_orm::entity::prelude::*;

/// Database row for one Case × Agent execution cell.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_case_executions")]
pub(crate) struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    pub(crate) task_id: String,
    pub(crate) task_case_id: String,
    pub(crate) task_agent_id: String,
    pub(crate) phase: String,
    pub(crate) termination_reason: Option<String>,
    pub(crate) session_id: Option<String>,
    pub(crate) response_text: Option<String>,
    pub(crate) metrics_json: Option<String>,
    pub(crate) started_at_ms: Option<i64>,
    pub(crate) finished_at_ms: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
