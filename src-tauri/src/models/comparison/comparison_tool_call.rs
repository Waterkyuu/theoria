use sea_orm::entity::prelude::*;

/// Database row for one ordered Agent tool invocation.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "comparison_tool_calls")]
pub(crate) struct Model {
    /// SQLite integer primary key.
    #[sea_orm(primary_key)]
    pub(crate) id: i64,
    /// Parent Agent result identifier.
    pub(crate) comparison_result_id: i64,
    /// One-based invocation order.
    pub(crate) sequence: i64,
    /// Stable tool name reported by the Agent protocol.
    pub(crate) name: String,
    /// Wall-clock invocation duration in milliseconds.
    pub(crate) duration_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    /// Parent Agent result for this tool call.
    #[sea_orm(
        belongs_to = "super::comparison_result::Entity",
        from = "Column::ComparisonResultId",
        to = "super::comparison_result::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    ComparisonResult,
}

impl Related<super::comparison_result::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ComparisonResult.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
