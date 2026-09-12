use sea_orm::entity::prelude::*;

/// Database row for one immutable case in a Benchmark version.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_cases")]
pub(crate) struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    pub(crate) version_id: String,
    pub(crate) position: i64,
    pub(crate) name: String,
    pub(crate) content_json: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
