use sea_orm::entity::prelude::*;

/// Database row for one managed Skill Library entry.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "skills")]
pub(crate) struct Model {
    /// Stable local Skill identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Directory name copied into Task Skill snapshots.
    pub(crate) folder_name: String,
    /// User-visible Skill name.
    pub(crate) display_name: String,
    /// Short capability description.
    pub(crate) description: String,
    /// Stable import origin identifier.
    pub(crate) source_type: String,
    /// Managed path relative to application data.
    pub(crate) storage_relative_path: String,
    /// Original source directory when imported.
    pub(crate) source_path: Option<String>,
    /// Soft-deletion time in Unix milliseconds.
    pub(crate) deleted_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    /// Workspace mounts that reference this Skill.
    #[sea_orm(has_many = "workspace_skill_mount::Entity")]
    WorkspaceSkillMounts,
}

impl Related<workspace_skill_mount::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::WorkspaceSkillMounts.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

pub(crate) mod workspace_skill_mount {
    use sea_orm::entity::prelude::*;

    /// Database row connecting one Workspace to one managed Skill.
    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspace_skill_mounts")]
    pub(crate) struct Model {
        /// Workspace that inherits the mounted Skill.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) workspace_id: String,
        /// Managed Skill mounted into future Tasks.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) skill_id: String,
        /// Skill directory name captured when the mount was created.
        pub(crate) folder_name_snapshot: String,
        /// Mount creation time in Unix milliseconds.
        pub(crate) created_at_ms: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Managed Skill referenced by this mount.
        #[sea_orm(
            belongs_to = "super::Entity",
            from = "Column::SkillId",
            to = "super::Column::Id",
            on_update = "NoAction",
            on_delete = "Restrict"
        )]
        Skill,
    }

    impl Related<super::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Skill.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}
