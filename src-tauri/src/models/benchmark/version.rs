use sea_orm::entity::prelude::*;

/// Database row for one immutable Benchmark version.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_versions")]
pub(crate) struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    pub(crate) benchmark_id: String,
    pub(crate) number: i64,
    pub(crate) content_json: String,
    pub(crate) created_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
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
