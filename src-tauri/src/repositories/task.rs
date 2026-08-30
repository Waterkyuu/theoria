use crate::domain::agent_kind::AgentKind;
use crate::domain::task::{
    Task, TaskAgent, TaskAgentResult, TaskDetail, TaskPermissions, TaskSkill, TaskStatus,
};
use sea_orm::{
    ConnectionTrait, DatabaseBackend, DatabaseConnection, DbErr, QueryResult, Statement,
    TransactionTrait,
};

/// SQLite persistence boundary for Task History and execution snapshots.
#[derive(Clone)]
pub(crate) struct TaskRepository {
    /// Shared application database connection pool.
    database: DatabaseConnection,
}

impl TaskRepository {
    /// Creates a repository over migrated application storage.
    pub(crate) fn new(database: DatabaseConnection) -> Self {
        Self { database }
    }

    /// Atomically persists one locked Task and every frozen child configuration.
    pub(crate) async fn create(&self, detail: TaskDetail) -> Result<TaskDetail, DbErr> {
        if detail.task.configuration_locked_at_ms.is_none() || !detail.results.is_empty() {
            return Err(DbErr::Custom(
                "New Tasks must be locked and cannot contain results".to_string(),
            ));
        }
        let transaction = self.database.begin().await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO tasks
                    (id, workspace_id, title, prompt, baseline_relative_path, status,
                     configuration_locked_at_ms, created_at_ms, updated_at_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
                [
                    detail.task.id.clone().into(),
                    detail.task.workspace_id.clone().into(),
                    detail.task.title.clone().into(),
                    detail.task.prompt.clone().into(),
                    detail.task.baseline_relative_path.clone().into(),
                    detail.task.status.as_str().into(),
                    detail.task.configuration_locked_at_ms.into(),
                    detail.task.created_at_ms.into(),
                    detail.task.updated_at_ms.into(),
                ],
            ))
            .await?;
        for agent in &detail.agents {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DatabaseBackend::Sqlite,
                    r#"
                    INSERT INTO task_agents
                        (id, task_id, slot_index, agent_kind, model_snapshot, mode_snapshot,
                         session_id, execution_relative_path, status, created_at_ms, updated_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#,
                    [
                        agent.id.clone().into(),
                        agent.task_id.clone().into(),
                        agent.slot_index.into(),
                        agent.agent_kind.as_str().into(),
                        agent.model_snapshot.clone().into(),
                        agent.mode_snapshot.clone().into(),
                        agent.session_id.clone().into(),
                        agent.execution_relative_path.clone().into(),
                        agent.status.as_str().into(),
                        agent.created_at_ms.into(),
                        agent.updated_at_ms.into(),
                    ],
                ))
                .await?;
        }
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO task_permissions
                    (task_id, file_access, command_execution, created_at_ms)
                VALUES (?, ?, ?, ?)
                "#,
                [
                    detail.task.id.clone().into(),
                    detail.permissions.file_access.clone().into(),
                    detail.permissions.command_execution.clone().into(),
                    detail.task.created_at_ms.into(),
                ],
            ))
            .await?;
        for skill in &detail.skills {
            transaction
                .execute_raw(Statement::from_sql_and_values(
                    DatabaseBackend::Sqlite,
                    r#"
                    INSERT INTO task_skills
                        (task_id, folder_name, origin, library_skill_id, relative_path, created_at_ms)
                    VALUES (?, ?, ?, ?, ?, ?)
                    "#,
                    [
                        detail.task.id.clone().into(),
                        skill.folder_name.clone().into(),
                        skill.origin.clone().into(),
                        skill.library_skill_id.clone().into(),
                        skill.relative_path.clone().into(),
                        detail.task.created_at_ms.into(),
                    ],
                ))
                .await?;
        }
        transaction.commit().await?;
        Ok(detail)
    }

    /// Lists global Recent or one Workspace's History without mixing scopes.
    pub(crate) async fn list(&self, workspace_id: Option<&str>) -> Result<Vec<Task>, DbErr> {
        let (condition, values) = match workspace_id {
            Some(workspace_id) => ("workspace_id = ?", vec![workspace_id.into()]),
            None => ("workspace_id IS NULL", Vec::new()),
        };
        self.database
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                format!(
                    r#"
                    SELECT id, workspace_id, title, prompt, baseline_relative_path, status,
                           configuration_locked_at_ms, created_at_ms, updated_at_ms
                    FROM tasks
                    WHERE {condition}
                    ORDER BY created_at_ms DESC, id DESC
                    "#
                ),
                values,
            ))
            .await?
            .into_iter()
            .map(task_from_row)
            .collect()
    }

    /// Restores immutable configuration, Executions, Skills, and results for one Task.
    pub(crate) async fn get(&self, task_id: &str) -> Result<Option<TaskDetail>, DbErr> {
        let task = self
            .database
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                SELECT id, workspace_id, title, prompt, baseline_relative_path, status,
                       configuration_locked_at_ms, created_at_ms, updated_at_ms
                FROM tasks
                WHERE id = ?
                "#,
                [task_id.into()],
            ))
            .await?
            .map(task_from_row)
            .transpose()?;
        let Some(task) = task else {
            return Ok(None);
        };
        let agents = self
            .database
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                SELECT id, task_id, slot_index, agent_kind, model_snapshot, mode_snapshot,
                       session_id, execution_relative_path, status, created_at_ms, updated_at_ms
                FROM task_agents
                WHERE task_id = ?
                ORDER BY slot_index
                "#,
                [task_id.into()],
            ))
            .await?
            .into_iter()
            .map(task_agent_from_row)
            .collect::<Result<Vec<_>, _>>()?;
        let permissions = self
            .database
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "SELECT file_access, command_execution FROM task_permissions WHERE task_id = ?",
                [task_id.into()],
            ))
            .await?
            .map(|row| -> Result<TaskPermissions, DbErr> {
                Ok(TaskPermissions {
                    file_access: row.try_get("", "file_access")?,
                    command_execution: row.try_get("", "command_execution")?,
                })
            })
            .transpose()?
            .ok_or_else(|| DbErr::Custom("Task permissions are missing".to_string()))?;
        let skills = self
            .database
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                SELECT folder_name, origin, library_skill_id, relative_path
                FROM task_skills
                WHERE task_id = ?
                ORDER BY folder_name COLLATE NOCASE
                "#,
                [task_id.into()],
            ))
            .await?
            .into_iter()
            .map(|row| -> Result<TaskSkill, DbErr> {
                Ok(TaskSkill {
                    folder_name: row.try_get("", "folder_name")?,
                    origin: row.try_get("", "origin")?,
                    library_skill_id: row.try_get("", "library_skill_id")?,
                    relative_path: row.try_get("", "relative_path")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let results = self
            .database
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                SELECT r.task_agent_id, r.final_status, r.response_text,
                       r.changes_relative_path, r.metrics_json
                FROM task_agent_results r
                JOIN task_agents a ON a.id = r.task_agent_id
                WHERE a.task_id = ?
                ORDER BY a.slot_index
                "#,
                [task_id.into()],
            ))
            .await?
            .into_iter()
            .map(|row| -> Result<TaskAgentResult, DbErr> {
                let status = row.try_get::<String>("", "final_status")?;
                Ok(TaskAgentResult {
                    task_agent_id: row.try_get("", "task_agent_id")?,
                    final_status: TaskStatus::parse(&status).ok_or_else(|| {
                        DbErr::Custom("Task result contains an invalid status".to_string())
                    })?,
                    response_text: row.try_get("", "response_text")?,
                    changes_relative_path: row.try_get("", "changes_relative_path")?,
                    metrics_json: row.try_get("", "metrics_json")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Some(TaskDetail {
            task,
            agents,
            permissions,
            skills,
            results,
        }))
    }
}

/// Maps one Task row while rejecting corrupted lifecycle values.
fn task_from_row(row: QueryResult) -> Result<Task, DbErr> {
    let status = row.try_get::<String>("", "status")?;
    Ok(Task {
        id: row.try_get("", "id")?,
        workspace_id: row.try_get("", "workspace_id")?,
        title: row.try_get("", "title")?,
        prompt: row.try_get("", "prompt")?,
        baseline_relative_path: row.try_get("", "baseline_relative_path")?,
        status: TaskStatus::parse(&status)
            .ok_or_else(|| DbErr::Custom("Task contains an invalid status".to_string()))?,
        configuration_locked_at_ms: row.try_get("", "configuration_locked_at_ms")?,
        created_at_ms: row.try_get("", "created_at_ms")?,
        updated_at_ms: row.try_get("", "updated_at_ms")?,
    })
}

/// Maps one isolated Agent Execution row and validates its Agent and status identifiers.
fn task_agent_from_row(row: QueryResult) -> Result<TaskAgent, DbErr> {
    let agent_kind = row.try_get::<String>("", "agent_kind")?;
    let status = row.try_get::<String>("", "status")?;
    Ok(TaskAgent {
        id: row.try_get("", "id")?,
        task_id: row.try_get("", "task_id")?,
        slot_index: row.try_get("", "slot_index")?,
        agent_kind: AgentKind::parse(&agent_kind)
            .ok_or_else(|| DbErr::Custom("Task Agent contains an invalid kind".to_string()))?,
        model_snapshot: row.try_get("", "model_snapshot")?,
        mode_snapshot: row.try_get("", "mode_snapshot")?,
        session_id: row.try_get("", "session_id")?,
        execution_relative_path: row.try_get("", "execution_relative_path")?,
        status: TaskStatus::parse(&status)
            .ok_or_else(|| DbErr::Custom("Task Agent contains an invalid status".to_string()))?,
        created_at_ms: row.try_get("", "created_at_ms")?,
        updated_at_ms: row.try_get("", "updated_at_ms")?,
    })
}

#[cfg(test)]
mod tests {
    use super::TaskRepository;
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use sea_orm::ConnectionTrait;
    use sea_orm_migration::MigratorTrait;
    use std::sync::atomic::{AtomicU64, Ordering};

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn keeps_global_recent_separate_from_workspace_history() {
        tauri::async_runtime::block_on(async {
            let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "theoria-task-repository-test-{}-{sequence}.sqlite3",
                std::process::id()
            ));
            let database = connect_sqlite(&format!("sqlite://{}?mode=rwc", path.display()))
                .await
                .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            database
                .execute_unprepared(
                    r#"
                    INSERT INTO workspaces
                        (id, name, source_kind, source_path, created_at_ms, updated_at_ms)
                    VALUES ('workspace-1', 'Docs', 'external', '/tmp/docs', 100, 100);
                    INSERT INTO tasks
                        (id, workspace_id, title, prompt, baseline_relative_path, status,
                         configuration_locked_at_ms, created_at_ms, updated_at_ms)
                    VALUES
                        ('task-global', NULL, 'Global', 'Compare', 'task-runs/task-global/baseline',
                         'completed', 100, 100, 200),
                        ('task-workspace', 'workspace-1', 'Workspace', 'Compare',
                         'task-runs/task-workspace/baseline', 'running', 100, 110, 210);
                    "#,
                )
                .await
                .expect("fixtures should insert");
            let repository = TaskRepository::new(database.clone());

            let global = repository.list(None).await.expect("Recent should list");
            let workspace = repository
                .list(Some("workspace-1"))
                .await
                .expect("Workspace History should list");

            assert_eq!(global.len(), 1);
            assert_eq!(global[0].id, "task-global");
            assert_eq!(workspace.len(), 1);
            assert_eq!(workspace[0].id, "task-workspace");

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("database should be removable");
        });
    }
}
