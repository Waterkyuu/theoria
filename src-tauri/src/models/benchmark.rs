/// SeaORM mapping for benchmarks.
pub(crate) mod definition {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "benchmarks")]
    pub(crate) struct Model {
        /// Definition identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) id: String,
        /// Catalog title.
        pub(crate) name: String,
        /// Catalog description.
        pub(crate) description: String,
        /// Required classification.
        pub(crate) tag_id: String,
        /// Application-assigned author.
        pub(crate) author: String,
        /// Source attribution.
        pub(crate) source: Option<String>,
        /// Whether new mounts are disabled.
        pub(crate) archived: bool,
        /// Creation timestamp.
        pub(crate) created_at_ms: i64,
        /// Latest metadata timestamp.
        pub(crate) updated_at_ms: i64,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Published versions owned by this definition.
        #[sea_orm(has_many = "super::version::Entity")]
        Versions,
    }
    impl ActiveModelBehavior for ActiveModel {}
    impl Related<super::version::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Versions.def()
        }
    }
}

/// SeaORM mapping for benchmark_tags.
pub(crate) mod tag {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "benchmark_tags")]
    pub(crate) struct Model {
        /// Classification identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) id: String,
        /// Unique display name.
        pub(crate) name: String,
        /// Gravity icon export.
        pub(crate) icon: String,
        /// Protected fallback classification.
        pub(crate) is_system: bool,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

/// SeaORM mapping for benchmark_drafts.
pub(crate) mod draft {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "benchmark_drafts")]
    pub(crate) struct Model {
        /// Draft identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) id: String,
        /// Optional definition being edited.
        pub(crate) benchmark_id: Option<String>,
        /// Optimistic editor revision.
        pub(crate) revision: i64,
        /// Serialized editable document.
        pub(crate) content_json: String,
        /// Latest save timestamp.
        pub(crate) updated_at_ms: i64,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

/// SeaORM mapping for benchmark_versions.
pub(crate) mod version {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "benchmark_versions")]
    pub(crate) struct Model {
        /// Immutable version identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) id: String,
        /// Owning definition.
        pub(crate) benchmark_id: String,
        /// Monotonic content version.
        pub(crate) number: i64,
        /// Frozen template document.
        pub(crate) content_json: String,
        /// Publication timestamp.
        pub(crate) created_at_ms: i64,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Definition owning this immutable version.
        #[sea_orm(
            belongs_to = "super::definition::Entity",
            from = "Column::BenchmarkId",
            to = "super::definition::Column::Id"
        )]
        Definition,
    }
    impl ActiveModelBehavior for ActiveModel {}
    impl Related<super::definition::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Definition.def()
        }
    }
}

/// SeaORM mapping for benchmark_cases.
pub(crate) mod case {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "benchmark_cases")]
    pub(crate) struct Model {
        /// Immutable case identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) id: String,
        /// Owning content version.
        pub(crate) version_id: String,
        /// Stable case order.
        pub(crate) position: i64,
        /// Unique case title within a version.
        pub(crate) name: String,
        /// Frozen requirements and validation rules.
        pub(crate) content_json: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

/// SeaORM mapping for workspace_benchmarks.
pub(crate) mod mount {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspace_benchmarks")]
    pub(crate) struct Model {
        /// Mount identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) id: String,
        /// Owning workspace.
        pub(crate) workspace_id: String,
        /// Mounted definition.
        pub(crate) benchmark_id: String,
        /// Pinned content version.
        pub(crate) version_id: String,
        /// Mount timestamp.
        pub(crate) created_at_ms: i64,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}
