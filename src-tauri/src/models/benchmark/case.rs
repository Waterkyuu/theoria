use sea_orm::entity::prelude::*;

/// Database row for one immutable case in a Benchmark version.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_cases")]
pub(crate) struct Model {
    /// Stable local Case identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Immutable Benchmark version that owns the Case.
    pub(crate) version_id: String,
    /// Stable display and execution order within the version.
    pub(crate) position: i64,
    /// Case name duplicated for indexed display queries.
    pub(crate) name: String,
    /// Complete immutable Case document serialized as JSON.
    pub(crate) content_json: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
