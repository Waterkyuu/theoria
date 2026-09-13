use sea_orm::entity::prelude::*;

/// Database row for one mutable Benchmark draft.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_drafts")]
pub(crate) struct Model {
    /// Stable editor draft identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Personal published definition being edited, when present.
    pub(crate) benchmark_id: Option<String>,
    /// Monotonic optimistic concurrency revision.
    pub(crate) revision: i64,
    /// Complete mutable Benchmark document serialized as JSON.
    pub(crate) content_json: String,
    /// Last save time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
