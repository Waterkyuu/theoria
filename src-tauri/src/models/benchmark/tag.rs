use sea_orm::entity::prelude::*;

/// Database row for one Benchmark classification.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "benchmark_tags")]
pub(crate) struct Model {
    /// Stable local classification identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// User-visible classification name.
    pub(crate) name: String,
    /// Allowlisted Gravity icon export name.
    pub(crate) icon: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
