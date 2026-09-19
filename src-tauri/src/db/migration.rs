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
            Box::new(AllowWaitingTaskAgentTurns),
            Box::new(AddTaskPin),
            Box::new(CreateBenchmarks),
            Box::new(RemoveBenchmarkFallbackTag),
            Box::new(AddBenchmarkMountPin),
        ]
    }
}

/// Creates the catalog and internal execution plan beneath common Tasks.
struct CreateBenchmarks;
impl MigrationName for CreateBenchmarks {
    fn name(&self) -> &str {
        "m008_create_benchmarks"
    }
}
#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for CreateBenchmarks {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!("sql/m008_create_benchmarks/up.sql"))
            .await?;
        Ok(())
    }
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!("sql/m008_create_benchmarks/down.sql"))
            .await?;
        Ok(())
    }
}

/// Removes the fallback classification from databases that already applied the Benchmark schema.
struct RemoveBenchmarkFallbackTag;

impl MigrationName for RemoveBenchmarkFallbackTag {
    fn name(&self) -> &str {
        "m009_remove_benchmark_fallback_tag"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for RemoveBenchmarkFallbackTag {
    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m009_remove_benchmark_fallback_tag/up.sql"
            ))
            .await?;
        if manager.has_column("benchmark_tags", "is_system").await? {
            manager
                .get_connection()
                .execute_unprepared(include_str!(
                    "sql/m009_remove_benchmark_fallback_tag/up_drop_system_column.sql"
                ))
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column("benchmark_tags", "is_system").await? {
            manager
                .get_connection()
                .execute_unprepared(include_str!(
                    "sql/m009_remove_benchmark_fallback_tag/down.sql"
                ))
                .await?;
        }
        Ok(())
    }
}

/// Adds optional pin ordering to the reusable Benchmark mounts in each Workspace.
struct AddBenchmarkMountPin;

impl MigrationName for AddBenchmarkMountPin {
    fn name(&self) -> &str {
        "m010_add_benchmark_mount_pin"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for AddBenchmarkMountPin {
    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!("sql/m010_add_benchmark_mount_pin/up.sql"))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!("sql/m010_add_benchmark_mount_pin/down.sql"))
            .await?;
        Ok(())
    }
}

/// Adds optional pin ordering without changing existing Task recency.
struct AddTaskPin;

impl MigrationName for AddTaskPin {
    fn name(&self) -> &str {
        "m20260901_000007_add_task_pin"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for AddTaskPin {
    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!("sql/m20260901_000007_add_task_pin/up.sql"))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!("sql/m20260901_000007_add_task_pin/down.sql"))
            .await?;
        Ok(())
    }
}

/// Extends preserved turns with the resumable Waiting lifecycle.
struct AllowWaitingTaskAgentTurns;

impl MigrationName for AllowWaitingTaskAgentTurns {
    fn name(&self) -> &str {
        "m20260831_000006_allow_waiting_task_agent_turns"
    }
}

#[sea_orm_migration::async_trait::async_trait]
impl MigrationTrait for AllowWaitingTaskAgentTurns {
    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }

    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260831_000006_allow_waiting_task_agent_turns/up.sql"
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260831_000006_allow_waiting_task_agent_turns/down.sql"
            ))
            .await?;
        Ok(())
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
            .execute_unprepared(include_str!(
                "sql/m20260831_000005_add_task_agent_turns/up.sql"
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260831_000005_add_task_agent_turns/down.sql"
            ))
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
            .execute_unprepared(include_str!(
                "sql/m20260831_000004_create_workspace_task_system/up.sql"
            ))
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260831_000004_create_workspace_task_system/down.sql"
            ))
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
            .execute_unprepared(include_str!(
                "sql/m20260823_000003_add_comparison_compaction_count/up.sql"
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260823_000003_add_comparison_compaction_count/down.sql"
            ))
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
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260823_000002_add_opencode_comparison_agent/up.sql"
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260823_000002_add_opencode_comparison_agent/down.sql"
            ))
            .await?;
        Ok(())
    }
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
            .execute_unprepared(include_str!(
                "sql/m20260816_000001_create_comparison_history/up.sql"
            ))
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(include_str!(
                "sql/m20260816_000001_create_comparison_history/down.sql"
            ))
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::Migrator;
    use crate::db::connection::connect_sqlite;
    use crate::models::benchmark::tag;
    use sea_orm::{ConnectionTrait, DatabaseBackend, EntityTrait, PaginatorTrait, Statement};
    use sea_orm_migration::{MigratorTrait, SchemaManager};
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
    fn creates_only_user_defined_benchmark_tags() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let manager = SchemaManager::new(&database);

            assert_eq!(
                tag::Entity::find()
                    .count(&database)
                    .await
                    .expect("tags should be readable"),
                0
            );
            assert!(!manager
                .has_column("benchmark_tags", "is_system")
                .await
                .expect("tag schema should be readable"));

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("owned database should be removed");
        });
    }

    #[test]
    fn adds_pinned_ordering_to_workspace_benchmarks() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let manager = SchemaManager::new(&database);

            assert!(manager
                .has_column("workspace_benchmarks", "pinned_at_ms")
                .await
                .expect("mount schema should be readable"));
            let index = database
                .query_one_raw(Statement::from_string(
                    DatabaseBackend::Sqlite,
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_workspace_benchmarks_pin_history'".to_string(),
                ))
                .await
                .expect("mount index should be readable");
            assert!(index.is_some(), "mount pin ordering must stay indexed");

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("owned database should be removed");
        });
    }

    #[test]
    fn upgrades_the_legacy_benchmark_tag_schema_without_a_fallback() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");
            Migrator::up(&database, Some(7))
                .await
                .expect("pre-benchmark schema should initialize");
            database
                .execute_unprepared(include_str!("sql/m008_create_benchmarks/up.sql"))
                .await
                .expect("benchmark schema fixture should initialize");
            database
                .execute_unprepared(
                    r#"
                    ALTER TABLE benchmark_tags ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0
                        CHECK (is_system IN (0, 1));
                    CREATE TRIGGER benchmark_system_tag_update BEFORE UPDATE ON benchmark_tags
                    WHEN OLD.is_system = 1
                    BEGIN SELECT RAISE(ABORT, 'System tag is immutable'); END;
                    CREATE TRIGGER benchmark_system_tag_delete BEFORE DELETE ON benchmark_tags
                    WHEN OLD.is_system = 1
                    BEGIN SELECT RAISE(ABORT, 'System tag is immutable'); END;
                    INSERT INTO benchmark_tags (id, name, icon, is_system)
                    VALUES ('uncategorized', 'Uncategorized', 'Tag', 1);
                    INSERT INTO benchmark_tags (id, name, icon, is_system)
                    VALUES ('coding', 'Coding', 'Code', 0);
                    INSERT INTO seaql_migrations (version, applied_at)
                    VALUES ('m008_create_benchmarks', 1);
                    "#,
                )
                .await
                .expect("legacy benchmark schema should be reproducible");

            Migrator::up(&database, None)
                .await
                .expect("legacy benchmark schema should upgrade");

            let manager = SchemaManager::new(&database);
            assert_eq!(
                tag::Entity::find()
                    .count(&database)
                    .await
                    .expect("tags should be readable"),
                1
            );
            assert!(tag::Entity::find_by_id("coding")
                .one(&database)
                .await
                .expect("user-defined tag should be readable")
                .is_some());
            assert!(!manager
                .has_column("benchmark_tags", "is_system")
                .await
                .expect("tag schema should be readable"));

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("owned database should be removed");
        });
    }

    #[test]
    fn separates_work_inputs_from_benchmark_task_identity() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let inserted = database.execute_unprepared(r#"
                INSERT INTO workspaces (id, name, source_kind, source_path, created_at_ms, updated_at_ms)
                VALUES ('w', 'Workspace', 'external', '/tmp/project', 1, 1);
                INSERT INTO tasks (id, kind, workspace_id, title, status, created_at_ms, updated_at_ms)
                VALUES ('b', 'benchmark', 'w', 'Benchmark', 'preparing', 1, 1),
                       ('t', 'work', NULL, 'Work', 'preparing', 1, 1);
                INSERT INTO work_tasks (task_id, prompt, baseline_relative_path)
                VALUES ('t', 'Solve this', 'task-runs/t/baseline');
            "#).await;
            assert!(
                inserted.is_ok(),
                "both task kinds must persist without fabricated inputs: {inserted:?}"
            );
            assert!(database.execute_unprepared("INSERT INTO work_tasks (task_id, prompt, baseline_relative_path) VALUES ('b', 'Invalid', 'invalid')").await.is_err());
            assert!(database.execute_unprepared("INSERT INTO tasks (id, kind, title, status, created_at_ms, updated_at_ms) VALUES ('global-b', 'benchmark', 'Invalid', 'preparing', 1, 1)").await.is_err());
            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("owned database should be removed");
        });
    }

    #[test]
    fn benchmark_matrix_rejects_cross_task_executions_and_preserves_versions() {
        tauri::async_runtime::block_on(async {
            let (path, url) = temporary_database_url();
            let database = connect_sqlite(&url).await.expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let inserted = database.execute_unprepared(r#"
                INSERT INTO workspaces (id, name, source_kind, source_path, created_at_ms, updated_at_ms)
                VALUES ('w', 'Workspace', 'external', '/tmp/project', 1, 1);
                INSERT INTO benchmark_tags (id, name, icon) VALUES ('coding', 'Coding', 'Code');
                INSERT INTO benchmarks (id, name, description, tag_id, author, created_at_ms, updated_at_ms)
                VALUES ('b', 'Suite', 'Two questions', 'coding', 'myself', 1, 1);
                INSERT INTO benchmark_versions (id, benchmark_id, number, content_json, created_at_ms)
                VALUES ('v', 'b', 1, '{}', 1);
                INSERT INTO benchmark_cases (id, version_id, position, name, content_json)
                VALUES ('c1', 'v', 0, 'One', '{}'), ('c2', 'v', 1, 'Two', '{}');
                INSERT INTO tasks (id, kind, workspace_id, title, status, created_at_ms, updated_at_ms)
                VALUES ('t', 'benchmark', 'w', 'Run', 'preparing', 1, 1),
                       ('other', 'benchmark', 'w', 'Other', 'preparing', 1, 1);
                INSERT INTO benchmark_tasks (task_id, version_id, idempotency_key, request_json)
                VALUES ('t', 'v', 'start', '{}'), ('other', 'v', 'other-start', '{}');
                INSERT INTO benchmark_task_agents (id, task_id, agent_kind, position)
                VALUES ('a1', 't', 'codex', 0), ('a2', 't', 'claude', 1), ('a3', 'other', 'codex', 0);
                INSERT INTO benchmark_task_cases (id, task_id, case_id, version_id, position)
                VALUES ('tc1', 't', 'c1', 'v', 0), ('tc2', 't', 'c2', 'v', 1);
                INSERT INTO benchmark_case_executions (id, task_id, task_case_id, task_agent_id)
                VALUES ('e1', 't', 'tc1', 'a1'), ('e2', 't', 'tc1', 'a2'),
                       ('e3', 't', 'tc2', 'a1'), ('e4', 't', 'tc2', 'a2');
            "#).await;
            assert!(
                inserted.is_ok(),
                "one task must own the complete matrix: {inserted:?}"
            );
            assert!(database.execute_unprepared("INSERT INTO benchmark_case_executions (id, task_id, task_case_id, task_agent_id) VALUES ('bad', 't', 'tc1', 'a3')").await.is_err());
            assert!(database
                .execute_unprepared(
                    "UPDATE benchmark_versions SET content_json = '[]' WHERE id = 'v'"
                )
                .await
                .is_err());
            assert!(database
                .execute_unprepared("DELETE FROM benchmark_versions WHERE id = 'v'")
                .await
                .is_err());
            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("owned database should be removed");
        });
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
                    "SELECT name FROM sqlite_master WHERE name IN ('workspaces', 'skills', 'workspace_skill_mounts', 'tasks', 'task_agents', 'task_permissions', 'task_skills', 'task_agent_results', 'task_agent_turns', 'idx_workspaces_source', 'idx_skills_folder_name', 'idx_tasks_scope_history', 'idx_task_agent_turns_agent_sequence') ORDER BY name".to_string(),
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
                    "idx_skills_folder_name",
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
