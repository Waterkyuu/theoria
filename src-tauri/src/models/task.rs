use sea_orm::entity::prelude::*;

/// Database row for one immutable Task configuration and aggregate lifecycle.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "tasks")]
pub(crate) struct Model {
    /// Stable local Task identifier.
    #[sea_orm(primary_key, auto_increment = false)]
    pub(crate) id: String,
    /// Optional owning Workspace identifier.
    pub(crate) workspace_id: Option<String>,
    /// User-visible Task title.
    pub(crate) title: String,
    /// Frozen initial prompt.
    pub(crate) prompt: String,
    /// Baseline path relative to application data.
    pub(crate) baseline_relative_path: String,
    /// Stable aggregate lifecycle identifier.
    pub(crate) status: String,
    /// Time after which configuration cannot change.
    pub(crate) configuration_locked_at_ms: Option<i64>,
    /// Creation time in Unix milliseconds.
    pub(crate) created_at_ms: i64,
    /// Latest metadata update time in Unix milliseconds.
    pub(crate) updated_at_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub(crate) enum Relation {
    /// Isolated Agent Executions owned by this Task.
    #[sea_orm(has_many = "agent::Entity")]
    Agents,
    /// Frozen permissions owned by this Task.
    #[sea_orm(has_one = "permissions::Entity")]
    Permissions,
    /// Skill snapshots owned by this Task.
    #[sea_orm(has_many = "skill::Entity")]
    Skills,
}

impl Related<agent::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Agents.def()
    }
}

impl Related<permissions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Permissions.def()
    }
}

impl Related<skill::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Skills.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

pub(crate) mod agent {
    use sea_orm::entity::prelude::*;

    /// Database row for one isolated Agent Execution.
    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "task_agents")]
    pub(crate) struct Model {
        /// Stable local Execution identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) id: String,
        /// Parent Task identifier.
        pub(crate) task_id: String,
        /// Stable layout position.
        pub(crate) slot_index: i64,
        /// Stable Agent product identifier.
        pub(crate) agent_kind: String,
        /// Model captured when the Task was created.
        pub(crate) model_snapshot: Option<String>,
        /// Mode or reasoning setting captured when the Task was created.
        pub(crate) mode_snapshot: Option<String>,
        /// Adapter session identifier used for later turns.
        pub(crate) session_id: Option<String>,
        /// Execution path relative to application data.
        pub(crate) execution_relative_path: String,
        /// Stable Execution lifecycle identifier.
        pub(crate) status: String,
        /// Creation time in Unix milliseconds.
        pub(crate) created_at_ms: i64,
        /// Latest metadata update time in Unix milliseconds.
        pub(crate) updated_at_ms: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Parent Task that owns this Execution.
        #[sea_orm(
            belongs_to = "super::Entity",
            from = "Column::TaskId",
            to = "super::Column::Id",
            on_update = "NoAction",
            on_delete = "Cascade"
        )]
        Task,
        /// Latest collected result for this Execution.
        #[sea_orm(has_one = "super::result::Entity")]
        Result,
        /// Preserved conversation turns for this Execution.
        #[sea_orm(has_many = "super::turn::Entity")]
        Turns,
    }

    impl Related<super::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Task.def()
        }
    }

    impl Related<super::result::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Result.def()
        }
    }

    impl Related<super::turn::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Turns.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub(crate) mod permissions {
    use sea_orm::entity::prelude::*;

    /// Database row for one Task's frozen runtime permissions.
    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "task_permissions")]
    pub(crate) struct Model {
        /// Parent Task identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) task_id: String,
        /// Stable file access identifier.
        pub(crate) file_access: String,
        /// Stable command execution identifier.
        pub(crate) command_execution: String,
        /// Creation time in Unix milliseconds.
        pub(crate) created_at_ms: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Parent Task that owns these permissions.
        #[sea_orm(
            belongs_to = "super::Entity",
            from = "Column::TaskId",
            to = "super::Column::Id",
            on_update = "NoAction",
            on_delete = "Cascade"
        )]
        Task,
    }

    impl Related<super::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Task.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub(crate) mod skill {
    use sea_orm::entity::prelude::*;

    /// Database row for one frozen Task Skill snapshot.
    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "task_skills")]
    pub(crate) struct Model {
        /// Parent Task identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) task_id: String,
        /// Folder name under `.agents/skills`.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) folder_name: String,
        /// Stable snapshot origin identifier.
        pub(crate) origin: String,
        /// Optional managed Skill Library identifier.
        pub(crate) library_skill_id: Option<String>,
        /// Snapshot path relative to application data.
        pub(crate) relative_path: String,
        /// Creation time in Unix milliseconds.
        pub(crate) created_at_ms: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Parent Task that owns this Skill snapshot.
        #[sea_orm(
            belongs_to = "super::Entity",
            from = "Column::TaskId",
            to = "super::Column::Id",
            on_update = "NoAction",
            on_delete = "Cascade"
        )]
        Task,
    }

    impl Related<super::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Task.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub(crate) mod result {
    use sea_orm::entity::prelude::*;

    /// Database row for the latest collected Agent Execution result.
    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "task_agent_results")]
    pub(crate) struct Model {
        /// Parent Agent Execution identifier.
        #[sea_orm(primary_key, auto_increment = false)]
        pub(crate) task_agent_id: String,
        /// Stable terminal lifecycle identifier.
        pub(crate) final_status: String,
        /// Final Agent response.
        pub(crate) response_text: Option<String>,
        /// Changes artifact path relative to application data.
        pub(crate) changes_relative_path: Option<String>,
        /// Existing Comparison metrics encoded as JSON.
        pub(crate) metrics_json: String,
        /// Creation time in Unix milliseconds.
        pub(crate) created_at_ms: i64,
        /// Latest metadata update time in Unix milliseconds.
        pub(crate) updated_at_ms: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Parent Agent Execution that owns this result.
        #[sea_orm(
            belongs_to = "super::agent::Entity",
            from = "Column::TaskAgentId",
            to = "super::agent::Column::Id",
            on_update = "NoAction",
            on_delete = "Cascade"
        )]
        Agent,
    }

    impl Related<super::agent::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Agent.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub(crate) mod turn {
    use sea_orm::entity::prelude::*;

    /// Database row for one preserved Agent conversation turn.
    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "task_agent_turns")]
    pub(crate) struct Model {
        /// SQLite integer primary key.
        #[sea_orm(primary_key)]
        pub(crate) id: i64,
        /// Parent Agent Execution identifier.
        pub(crate) task_agent_id: String,
        /// Zero-based order scoped to the parent Execution.
        pub(crate) sequence: i64,
        /// User message sent for this turn.
        pub(crate) prompt: String,
        /// Stable lifecycle identifier for this turn.
        pub(crate) final_status: String,
        /// Final Agent response, when available.
        pub(crate) response_text: Option<String>,
        /// Existing Comparison metrics encoded as JSON.
        pub(crate) metrics_json: String,
        /// Completion time in Unix milliseconds.
        pub(crate) created_at_ms: i64,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub(crate) enum Relation {
        /// Parent Agent Execution that owns this turn.
        #[sea_orm(
            belongs_to = "super::agent::Entity",
            from = "Column::TaskAgentId",
            to = "super::agent::Column::Id",
            on_update = "NoAction",
            on_delete = "Cascade"
        )]
        Agent,
    }

    impl Related<super::agent::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Agent.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}
