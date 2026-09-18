use sea_orm::entity::prelude::*;

/// Database row for one Case × Agent execution cell.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_case_executions")]
pub(crate) struct Model {
    /// Stable local execution cell identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Parent Benchmark Task identifier.
    pub(crate) task_id: String,
    /// Frozen Task Case row used by this cell.
    pub(crate) task_case_id: String,
    /// Frozen Task Agent row used by this cell.
    pub(crate) task_agent_id: String,
    /// Lifecycle phase constrained by the database to queued, preparing, running,
    /// waiting_permission, collecting, evaluating, stopping, or finished.
    pub(crate) phase: String,
    /// Terminal reason when the Agent did not produce a verdict.
    pub(crate) termination_reason: Option<String>,
    /// Agent session identifier retained for diagnostics.
    pub(crate) session_id: Option<String>,
    /// Final Agent response when one was produced.
    pub(crate) response_text: Option<String>,
    /// Normalized execution metrics serialized as JSON.
    pub(crate) metrics_json: Option<String>,
    /// Execution start time in Unix milliseconds.
    pub(crate) started_at_ms: Option<i64>,
    /// Execution completion time in Unix milliseconds.
    pub(crate) finished_at_ms: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
