use sea_orm_migration::prelude::{DbErr, SchemaManager};
use sea_orm_migration::sea_orm::ConnectionTrait;
use sea_orm_migration::{MigrationName, MigrationTrait, MigratorTrait};

/// Runs the ordered embedded schema migrations for the application database.
pub(crate) struct Migrator;

#[sea_orm_migration::async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(CreateComparisonHistory),
            Box::new(AddOpenCodeComparisonAgent),
            Box::new(AddComparisonCompactionCount),
            Box::new(CreateWorkspaceTaskSystem),
            Box::new(AddTaskAgentTurns),
        ]
    }
}

/// Preserves every Agent turn without changing the immutable Task configuration tables.
struct AddTaskAgentTurns;

impl MigrationName for AddTaskAgentTurns {
    fn name(&self) -> &str {
        "m20260831_000005_add_task_agent_turns"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for AddTaskAgentTurns {
    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE TABLE task_agent_turns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_agent_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    prompt TEXT NOT NULL,
                    final_status TEXT NOT NULL,
                    response_text TEXT,
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    created_at_ms INTEGER NOT NULL,
                    FOREIGN KEY (task_agent_id) REFERENCES task_agents(id) ON DELETE CASCADE,
                    UNIQUE (task_agent_id, sequence),
                    CHECK (sequence >= 0),
                    CHECK (length(trim(prompt)) BETWEEN 1 AND 16000),
                    CHECK (final_status IN ('completed', 'failed', 'stopped')),
                    CHECK (json_valid(metrics_json)),
                    CHECK (created_at_ms > 0)
                );

                CREATE INDEX idx_task_agent_turns_agent_sequence
                    ON task_agent_turns(task_agent_id, sequence);
                "#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE task_agent_turns;")
            .await?;
        Ok(())
    }
}

/// Creates the reusable Workspace inputs and immutable Task execution records.
struct CreateWorkspaceTaskSystem;

impl MigrationName for CreateWorkspaceTaskSystem {
    fn name(&self) -> &str {
        "m20260831_000004_create_workspace_task_system"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for CreateWorkspaceTaskSystem {
    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE TABLE workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    pinned_at_ms INTEGER,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    CHECK (source_kind IN ('external', 'managed')),
                    CHECK (length(trim(name)) BETWEEN 1 AND 120),
                    CHECK (length(source_path) > 0),
                    CHECK (pinned_at_ms IS NULL OR pinned_at_ms > 0),
                    CHECK (created_at_ms > 0),
                    CHECK (updated_at_ms > 0)
                );

                CREATE UNIQUE INDEX idx_workspaces_source
                    ON workspaces(source_path);

                CREATE TABLE skills (
                    id TEXT PRIMARY KEY,
                    folder_name TEXT NOT NULL COLLATE NOCASE,
                    display_name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    storage_relative_path TEXT NOT NULL,
                    source_path TEXT,
                    deleted_at_ms INTEGER,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    CHECK (length(folder_name) BETWEEN 1 AND 64),
                    CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
                    CHECK (source_type IN ('local_folder', 'platform', 'git')),
                    CHECK (length(storage_relative_path) > 0),
                    CHECK (deleted_at_ms IS NULL OR deleted_at_ms > 0),
                    CHECK (created_at_ms > 0),
                    CHECK (updated_at_ms > 0)
                );

                CREATE UNIQUE INDEX idx_skills_active_folder_name
                    ON skills(folder_name)
                    WHERE deleted_at_ms IS NULL;

                CREATE TABLE workspace_skill_mounts (
                    workspace_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    folder_name_snapshot TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, skill_id),
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT,
                    CHECK (length(folder_name_snapshot) BETWEEN 1 AND 64),
                    CHECK (created_at_ms > 0)
                );

                CREATE TABLE tasks (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT,
                    title TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    baseline_relative_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    configuration_locked_at_ms INTEGER,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    CHECK (length(trim(title)) BETWEEN 1 AND 120),
                    CHECK (length(trim(prompt)) BETWEEN 1 AND 16000),
                    CHECK (length(baseline_relative_path) > 0),
                    CHECK (status IN ('preparing', 'running', 'waiting', 'completed', 'failed', 'stopped')),
                    CHECK (configuration_locked_at_ms IS NULL OR configuration_locked_at_ms > 0),
                    CHECK (created_at_ms > 0),
                    CHECK (updated_at_ms > 0)
                );

                CREATE INDEX idx_tasks_scope_history
                    ON tasks(workspace_id, created_at_ms DESC);

                CREATE TABLE task_agents (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    slot_index INTEGER NOT NULL,
                    agent_kind TEXT NOT NULL,
                    model_snapshot TEXT,
                    mode_snapshot TEXT,
                    session_id TEXT,
                    execution_relative_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    UNIQUE (task_id, slot_index),
                    CHECK (slot_index BETWEEN 0 AND 5),
                    CHECK (agent_kind IN ('codex', 'claude', 'opencode', 'workbuddy')),
                    CHECK (length(execution_relative_path) > 0),
                    CHECK (status IN ('preparing', 'running', 'waiting', 'completed', 'failed', 'stopped')),
                    CHECK (created_at_ms > 0),
                    CHECK (updated_at_ms > 0)
                );

                CREATE TABLE task_permissions (
                    task_id TEXT PRIMARY KEY,
                    file_access TEXT NOT NULL,
                    command_execution TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    CHECK (file_access IN ('read_only', 'allow_edits')),
                    CHECK (command_execution IN ('deny', 'ask', 'allow')),
                    CHECK (created_at_ms > 0)
                );

                CREATE TABLE task_skills (
                    task_id TEXT NOT NULL,
                    folder_name TEXT NOT NULL COLLATE NOCASE,
                    origin TEXT NOT NULL,
                    library_skill_id TEXT,
                    relative_path TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (task_id, folder_name),
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    FOREIGN KEY (library_skill_id) REFERENCES skills(id) ON DELETE SET NULL,
                    CHECK (origin IN ('workspace_source', 'workspace_mount', 'task_selection')),
                    CHECK (length(folder_name) BETWEEN 1 AND 64),
                    CHECK (length(relative_path) > 0),
                    CHECK (created_at_ms > 0)
                );

                CREATE TABLE task_agent_results (
                    task_agent_id TEXT PRIMARY KEY,
                    final_status TEXT NOT NULL,
                    response_text TEXT,
                    changes_relative_path TEXT,
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    FOREIGN KEY (task_agent_id) REFERENCES task_agents(id) ON DELETE CASCADE,
                    CHECK (final_status IN ('completed', 'failed', 'stopped')),
                    CHECK (json_valid(metrics_json)),
                    CHECK (created_at_ms > 0),
                    CHECK (updated_at_ms > 0)
                );
                "#,
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                DROP TABLE task_agent_results;
                DROP TABLE task_skills;
                DROP TABLE task_permissions;
                DROP TABLE task_agents;
                DROP TABLE tasks;
                DROP TABLE workspace_skill_mounts;
                DROP TABLE skills;
                DROP TABLE workspaces;
                "#,
            )
            .await?;

        Ok(())
    }
}

/// Adds a nullable counter so older results remain distinguishable from observed zeroes.
struct AddComparisonCompactionCount;

impl MigrationName for AddComparisonCompactionCount {
    fn name(&self) -> &str {
        "m20260823_000003_add_comparison_compaction_count"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for AddComparisonCompactionCount {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE comparison_results ADD COLUMN compaction_count INTEGER CHECK (compaction_count IS NULL OR compaction_count >= 0)",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("ALTER TABLE comparison_results DROP COLUMN compaction_count")
            .await?;
        Ok(())
    }
}

/// Expands the immutable Agent identifier constraint without changing existing result rows.
struct AddOpenCodeComparisonAgent;

impl MigrationName for AddOpenCodeComparisonAgent {
    fn name(&self) -> &str {
        "m20260823_000002_add_opencode_comparison_agent"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for AddOpenCodeComparisonAgent {
    fn use_transaction(&self) -> Option<bool> {
        // SQLite cannot toggle foreign-key enforcement inside a transaction while rebuilding a
        // referenced table, so the migration uses one ordered connection batch instead.
        Some(false)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        rebuild_comparison_results(manager, "'codex', 'claude', 'opencode', 'workbuddy'", "").await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "DELETE FROM comparison_tool_calls WHERE comparison_result_id IN (SELECT id FROM comparison_results WHERE agent_kind = 'opencode')",
            )
            .await?;
        rebuild_comparison_results(
            manager,
            "'codex', 'claude', 'workbuddy'",
            "WHERE agent_kind <> 'opencode'",
        )
        .await
    }
}

/// Rebuilds the SQLite table because CHECK constraints cannot be altered in place.
async fn rebuild_comparison_results(
    manager: &SchemaManager<'_>,
    agent_values: &str,
    copy_filter: &str,
) -> Result<(), DbErr> {
    manager
        .get_connection()
        .execute_unprepared(&format!(
            r#"
            PRAGMA foreign_keys = OFF;
            CREATE TABLE comparison_results_new (
                id INTEGER PRIMARY KEY,
                comparison_run_id INTEGER NOT NULL,
                agent_kind TEXT NOT NULL,
                model TEXT,
                reasoning_effort TEXT,
                status TEXT NOT NULL,
                response TEXT,
                error_message TEXT,
                total_duration_ms INTEGER,
                time_to_first_token_ms INTEGER,
                thinking_duration_ms INTEGER,
                total_tokens INTEGER,
                input_tokens INTEGER,
                cached_input_tokens INTEGER,
                cache_write_input_tokens INTEGER,
                output_tokens INTEGER,
                reasoning_output_tokens INTEGER,
                FOREIGN KEY (comparison_run_id)
                    REFERENCES comparison_runs(id) ON DELETE CASCADE,
                UNIQUE (comparison_run_id, agent_kind),
                CHECK (agent_kind IN ({agent_values})),
                CHECK (status IN ('succeeded', 'failed')),
                CHECK (total_duration_ms IS NULL OR total_duration_ms >= 0),
                CHECK (time_to_first_token_ms IS NULL OR time_to_first_token_ms >= 0),
                CHECK (thinking_duration_ms IS NULL OR thinking_duration_ms >= 0),
                CHECK (total_tokens IS NULL OR total_tokens >= 0),
                CHECK (input_tokens IS NULL OR input_tokens >= 0),
                CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
                CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0),
                CHECK (output_tokens IS NULL OR output_tokens >= 0),
                CHECK (reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0),
                CHECK (
                    (status = 'succeeded'
                        AND response IS NOT NULL
                        AND total_duration_ms IS NOT NULL
                        AND thinking_duration_ms IS NOT NULL)
                    OR
                    (status = 'failed' AND error_message IS NOT NULL)
                )
            );
            INSERT INTO comparison_results_new (
                id, comparison_run_id, agent_kind, model, reasoning_effort, status, response,
                error_message, total_duration_ms, time_to_first_token_ms, thinking_duration_ms,
                total_tokens, input_tokens, cached_input_tokens, cache_write_input_tokens,
                output_tokens, reasoning_output_tokens
            )
            SELECT
                id, comparison_run_id, agent_kind, model, reasoning_effort, status, response,
                error_message, total_duration_ms, time_to_first_token_ms, thinking_duration_ms,
                total_tokens, input_tokens, cached_input_tokens, cache_write_input_tokens,
                output_tokens, reasoning_output_tokens
            FROM comparison_results {copy_filter};
            DROP TABLE comparison_results;
            ALTER TABLE comparison_results_new RENAME TO comparison_results;
            PRAGMA foreign_keys = ON;
            "#,
        ))
        .await?;
    Ok(())
}

/// Creates the immutable comparison history tables and their read-path indexes.
struct CreateComparisonHistory;

impl MigrationName for CreateComparisonHistory {
    fn name(&self) -> &str {
        "m20260816_000001_create_comparison_history"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for CreateComparisonHistory {
    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE TABLE comparison_runs (
                    id INTEGER PRIMARY KEY,
                    query TEXT NOT NULL,
                    status TEXT NOT NULL,
                    metric_version INTEGER NOT NULL DEFAULT 1,
                    created_at_ms INTEGER NOT NULL,
                    CHECK (length(query) BETWEEN 1 AND 16000),
                    CHECK (status IN ('completed', 'partial', 'failed')),
                    CHECK (metric_version > 0),
                    CHECK (created_at_ms > 0)
                );

                CREATE INDEX idx_comparison_runs_history
                    ON comparison_runs (created_at_ms DESC, id DESC);

                CREATE TABLE comparison_results (
                    id INTEGER PRIMARY KEY,
                    comparison_run_id INTEGER NOT NULL,
                    agent_kind TEXT NOT NULL,
                    model TEXT,
                    reasoning_effort TEXT,
                    status TEXT NOT NULL,
                    response TEXT,
                    error_message TEXT,
                    total_duration_ms INTEGER,
                    time_to_first_token_ms INTEGER,
                    thinking_duration_ms INTEGER,
                    total_tokens INTEGER,
                    input_tokens INTEGER,
                    cached_input_tokens INTEGER,
                    cache_write_input_tokens INTEGER,
                    output_tokens INTEGER,
                    reasoning_output_tokens INTEGER,
                    FOREIGN KEY (comparison_run_id)
                        REFERENCES comparison_runs(id) ON DELETE CASCADE,
                    UNIQUE (comparison_run_id, agent_kind),
                    CHECK (agent_kind IN ('codex', 'claude', 'workbuddy')),
                    CHECK (status IN ('succeeded', 'failed')),
                    CHECK (total_duration_ms IS NULL OR total_duration_ms >= 0),
                    CHECK (time_to_first_token_ms IS NULL OR time_to_first_token_ms >= 0),
                    CHECK (thinking_duration_ms IS NULL OR thinking_duration_ms >= 0),
                    CHECK (total_tokens IS NULL OR total_tokens >= 0),
                    CHECK (input_tokens IS NULL OR input_tokens >= 0),
                    CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
                    CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0),
                    CHECK (output_tokens IS NULL OR output_tokens >= 0),
                    CHECK (reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0),
                    CHECK (
                        (status = 'succeeded'
                            AND response IS NOT NULL
                            AND total_duration_ms IS NOT NULL
                            AND thinking_duration_ms IS NOT NULL)
                        OR
                        (status = 'failed' AND error_message IS NOT NULL)
                    )
                );

                CREATE TABLE comparison_tool_calls (
                    id INTEGER PRIMARY KEY,
                    comparison_result_id INTEGER NOT NULL,
                    sequence INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    FOREIGN KEY (comparison_result_id)
                        REFERENCES comparison_results(id) ON DELETE CASCADE,
                    UNIQUE (comparison_result_id, sequence),
                    CHECK (sequence > 0),
                    CHECK (length(name) BETWEEN 1 AND 256),
                    CHECK (duration_ms >= 0)
                );
                "#,
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                DROP TABLE comparison_tool_calls;
                DROP TABLE comparison_results;
                DROP TABLE comparison_runs;
                "#,
            )
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::Migrator;
    use crate::db::connection::connect_sqlite;
    use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
    use sea_orm_migration::MigratorTrait;
    use std::sync::atomic::{AtomicU64, Ordering};

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    /// Creates a unique temporary database for migration contract tests.
    fn temporary_database_url() -> (std::path::PathBuf, String) {
        let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "agent-gauge-migration-test-{}-{sequence}.sqlite3",
            std::process::id()
        ));
        let url = format!("sqlite://{}?mode=rwc", path.display());
        (path, url)
    }

    #[test]
    fn creates_history_tables_and_cursor_index() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");

            Migrator::up(&database, None)
                .await
                .expect("migration should succeed");

            let objects = database
                .query_all_raw(Statement::from_string(
                    DatabaseBackend::Sqlite,
                    "SELECT name FROM sqlite_master WHERE name IN ('comparison_runs', 'comparison_results', 'comparison_tool_calls', 'idx_comparison_runs_history') ORDER BY name".to_string(),
                ))
                .await
                .expect("schema should be readable")
                .into_iter()
                .map(|row| {
                    row.try_get::<String>("", "name")
                        .expect("schema name should be text")
                })
                .collect::<Vec<_>>();

            assert_eq!(
                objects,
                vec![
                    "comparison_results",
                    "comparison_runs",
                    "comparison_tool_calls",
                    "idx_comparison_runs_history",
                ]
            );

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("temporary database should be removable");
        });
    }

    #[test]
    fn accepts_opencode_results_after_all_migrations() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should succeed");

            database
                .execute_unprepared(
                    r#"
                    INSERT INTO comparison_runs
                        (id, query, status, metric_version, created_at_ms)
                    VALUES (1, 'test', 'completed', 1, 1);
                    INSERT INTO comparison_results
                        (comparison_run_id, agent_kind, status, response, total_duration_ms, thinking_duration_ms)
                    VALUES (1, 'opencode', 'succeeded', 'done', 1, 0);
                    "#,
                )
                .await
                .expect("OpenCode should satisfy the migrated agent constraint");

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("temporary database should be removable");
        });
    }

    #[test]
    fn creates_workspace_skill_and_task_execution_tables() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should succeed");

            let objects = database
                .query_all_raw(Statement::from_string(
                    DatabaseBackend::Sqlite,
                    "SELECT name FROM sqlite_master WHERE name IN ('workspaces', 'skills', 'workspace_skill_mounts', 'tasks', 'task_agents', 'task_permissions', 'task_skills', 'task_agent_results', 'task_agent_turns', 'idx_workspaces_source', 'idx_skills_active_folder_name', 'idx_tasks_scope_history', 'idx_task_agent_turns_agent_sequence') ORDER BY name".to_string(),
                ))
                .await
                .expect("workspace schema should be readable")
                .into_iter()
                .map(|row| {
                    row.try_get::<String>("", "name")
                        .expect("schema name should be text")
                })
                .collect::<Vec<_>>();

            assert_eq!(
                objects,
                vec![
                    "idx_skills_active_folder_name",
                    "idx_task_agent_turns_agent_sequence",
                    "idx_tasks_scope_history",
                    "idx_workspaces_source",
                    "skills",
                    "task_agent_results",
                    "task_agent_turns",
                    "task_agents",
                    "task_permissions",
                    "task_skills",
                    "tasks",
                    "workspace_skill_mounts",
                    "workspaces",
                ]
            );

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("temporary database should be removable");
        });
    }
}
