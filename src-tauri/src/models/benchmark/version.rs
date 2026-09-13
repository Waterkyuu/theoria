use sea_orm::entity::prelude::*;

/// Database row for one immutable Benchmark version.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_versions")]
pub(crate) struct Model {
    /// Stable immutable version identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Benchmark definition that owns this version.
    pub(crate) benchmark_id: String,
    /// Monotonic user-visible version number.
    pub(crate) number: i64,
    /// Complete immutable Benchmark document serialized as JSON.
    pub(crate) content_json: String,
    /// Publication time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    /// Parent Benchmark definition.
    #[sea_orm(
        belongs_to = "super::Entity",
        from = "Column::BenchmarkId",
        to = "super::Column::Id"
    )]
    Benchmark,
}

impl Related<super::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Benchmark.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
