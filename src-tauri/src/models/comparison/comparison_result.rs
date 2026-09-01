use sea_orm::entity::prelude::*;

/// Database row for one Agent outcome within a comparison.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "comparison_results")]
pub(crate) struct Model {
    /// SQLite integer primary key.
    #[sea_orm(primary_key)]
    pub(crate) id: i64,
    /// Parent comparison identifier.
    pub(crate) comparison_run_id: i64,
    /// Stable Agent product identifier.
    pub(crate) agent_kind: String,
    /// Model configuration captured at execution time.
    pub(crate) model: Option<String>,
    /// Reasoning configuration captured at execution time.
    pub(crate) reasoning_effort: Option<String>,
    /// Success or failure state.
    pub(crate) status: String,
    /// Final response for a successful result.
    pub(crate) response: Option<String>,
    /// Safe failure message for a failed result.
    pub(crate) error_message: Option<String>,
    /// Complete task duration in milliseconds.
    pub(crate) total_duration_ms: Option<i64>,
    /// Delay until the first assistant text in milliseconds.
    pub(crate) time_to_first_token_ms: Option<i64>,
    /// Sum of explicit thinking intervals in milliseconds.
    pub(crate) thinking_duration_ms: Option<i64>,
    /// Number of context compactions reported during the Agent run.
    pub(crate) compaction_count: Option<i64>,
    /// Total tokens reported by the Agent.
    pub(crate) total_tokens: Option<i64>,
    /// Tokens included in model input.
    pub(crate) input_tokens: Option<i64>,
    /// Input tokens served from cache.
    pub(crate) cached_input_tokens: Option<i64>,
    /// Input tokens written into cache.
    pub(crate) cache_write_input_tokens: Option<i64>,
    /// Tokens included in model output.
    pub(crate) output_tokens: Option<i64>,
    /// Reasoning tokens when reported separately.
    pub(crate) reasoning_output_tokens: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    /// Parent comparison for this result.
    #[sea_orm(
        belongs_to = "super::comparison_run::Entity",
        from = "Column::ComparisonRunId",
        to = "super::comparison_run::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    ComparisonRun,
    /// Tool calls owned by this result.
    #[sea_orm(has_many = "super::comparison_tool_call::Entity")]
    ToolCalls,
}

impl Related<super::comparison_run::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ComparisonRun.def()
    }
}

impl Related<super::comparison_tool_call::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ToolCalls.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
