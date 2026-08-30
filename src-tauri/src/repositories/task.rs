use crate::domain::agent_kind::AgentKind;
use crate::domain::task::{
    Task, TaskAgent, TaskAgentResult, TaskAgentTurn, TaskDetail, TaskPermissions, TaskSkill,
    TaskStatus,
};
use sea_orm::{
    ConnectionTrait, DatabaseBackend, DatabaseConnection, DbErr, QueryResult, Statement,
    TransactionTrait,
};

/// SQLite persistence boundary for Tasks and execution snapshots.
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
        if detail.task.configuration_locked_at_ms.is_none()
            || !detail.results.is_empty()
            || !detail.turns.is_empty()
        {
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

    /// Moves a prepared Task and all prepared Agent rows into Running atomically.
    pub(crate) async fn mark_running(
        &self,
        task_id: &str,
        updated_at_ms: i64,
    ) -> Result<(), DbErr> {
        let transaction = self.database.begin().await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE tasks SET status = 'running', updated_at_ms = ? WHERE id = ? AND status = 'preparing'",
                [updated_at_ms.into(), task_id.into()],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE task_agents SET status = 'running', updated_at_ms = ? WHERE task_id = ? AND status = 'preparing'",
                [updated_at_ms.into(), task_id.into()],
            ))
            .await?;
        transaction.commit().await
    }

    /// Atomically reopens one terminal Task and the selected resumable Agent sessions.
    pub(crate) async fn begin_agent_turns(
        &self,
        task_id: &str,
        task_agent_ids: &[String],
        updated_at_ms: i64,
    ) -> Result<bool, DbErr> {
        if task_agent_ids.is_empty() {
            return Ok(false);
        }
        let transaction = self.database.begin().await?;
        let task_update = transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                UPDATE tasks
                SET status = 'running', updated_at_ms = ?
                WHERE id = ? AND status IN ('waiting', 'completed', 'failed')
                "#,
                [updated_at_ms.into(), task_id.into()],
            ))
            .await?;
        if task_update.rows_affected() != 1 {
            transaction.rollback().await?;
            return Ok(false);
        }
        for task_agent_id in task_agent_ids {
            let agent_update = transaction
                .execute_raw(Statement::from_sql_and_values(
                    DatabaseBackend::Sqlite,
                    r#"
                    UPDATE task_agents
                    SET status = 'running', updated_at_ms = ?
                    WHERE id = ? AND task_id = ? AND session_id IS NOT NULL
                      AND status IN ('waiting', 'completed')
                    "#,
                    [
                        updated_at_ms.into(),
                        task_agent_id.as_str().into(),
                        task_id.into(),
                    ],
                ))
                .await?;
            if agent_update.rows_affected() != 1 {
                transaction.rollback().await?;
                return Ok(false);
            }
        }
        transaction.commit().await?;
        Ok(true)
    }

    /// Atomically pauses one Agent and preserves the resumable partial turn.
    pub(crate) async fn wait_agent_turn(
        &self,
        task_agent_id: &str,
        prompt: &str,
        response_text: Option<&str>,
        metrics_json: &str,
        session_id: &str,
        updated_at_ms: i64,
    ) -> Result<(), DbErr> {
        if session_id.trim().is_empty() {
            return Err(DbErr::Custom(
                "Waiting Agent turn requires a session id".to_string(),
            ));
        }
        let transaction = self.database.begin().await?;
        let update = transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE task_agents SET status = 'waiting', session_id = ?, updated_at_ms = ? WHERE id = ? AND status = 'running'",
                [session_id.into(), updated_at_ms.into(), task_agent_id.into()],
            ))
            .await?;
        if update.rows_affected() != 1 {
            transaction.rollback().await?;
            return Err(DbErr::Custom(
                "Waiting Agent turn is not running".to_string(),
            ));
        }
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO task_agent_turns
                    (task_agent_id, sequence, prompt, final_status, response_text,
                     metrics_json, created_at_ms)
                SELECT ?, COALESCE(MAX(sequence) + 1, 0), ?, 'waiting', ?, ?, ?
                FROM task_agent_turns
                WHERE task_agent_id = ?
                "#,
                [
                    task_agent_id.into(),
                    prompt.into(),
                    response_text.into(),
                    metrics_json.into(),
                    updated_at_ms.into(),
                    task_agent_id.into(),
                ],
            ))
            .await?;
        transaction.commit().await
    }

    /// Atomically saves one terminal Agent status and its response, changes, and metrics.
    pub(crate) async fn finish_agent(
        &self,
        result: TaskAgentResult,
        updated_at_ms: i64,
    ) -> Result<(), DbErr> {
        if !matches!(
            result.final_status,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped
        ) {
            return Err(DbErr::Custom(
                "Agent result status is not terminal".to_string(),
            ));
        }
        let transaction = self.database.begin().await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE task_agents SET status = ?, updated_at_ms = ? WHERE id = ?",
                [
                    result.final_status.as_str().into(),
                    updated_at_ms.into(),
                    result.task_agent_id.clone().into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO task_agent_results
                    (task_agent_id, final_status, response_text, changes_relative_path,
                     metrics_json, created_at_ms, updated_at_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(task_agent_id) DO UPDATE SET
                    final_status = excluded.final_status,
                    response_text = excluded.response_text,
                    changes_relative_path = excluded.changes_relative_path,
                    metrics_json = excluded.metrics_json,
                    updated_at_ms = excluded.updated_at_ms
                "#,
                [
                    result.task_agent_id.into(),
                    result.final_status.as_str().into(),
                    result.response_text.into(),
                    result.changes_relative_path.into(),
                    result.metrics_json.into(),
                    updated_at_ms.into(),
                    updated_at_ms.into(),
                ],
            ))
            .await?;
        transaction.commit().await
    }

    /// Saves one completed turn, the resumable session id, and the latest result atomically.
    pub(crate) async fn finish_agent_turn(
        &self,
        result: TaskAgentResult,
        prompt: &str,
        session_id: Option<&str>,
        updated_at_ms: i64,
    ) -> Result<(), DbErr> {
        if !matches!(
            result.final_status,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped
        ) {
            return Err(DbErr::Custom(
                "Agent turn status is not terminal".to_string(),
            ));
        }
        let transaction = self.database.begin().await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE task_agents SET status = ?, session_id = COALESCE(?, session_id), updated_at_ms = ? WHERE id = ?",
                [
                    result.final_status.as_str().into(),
                    session_id.into(),
                    updated_at_ms.into(),
                    result.task_agent_id.clone().into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO task_agent_results
                    (task_agent_id, final_status, response_text, changes_relative_path,
                     metrics_json, created_at_ms, updated_at_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(task_agent_id) DO UPDATE SET
                    final_status = excluded.final_status,
                    response_text = excluded.response_text,
                    changes_relative_path = excluded.changes_relative_path,
                    metrics_json = excluded.metrics_json,
                    updated_at_ms = excluded.updated_at_ms
                "#,
                [
                    result.task_agent_id.clone().into(),
                    result.final_status.as_str().into(),
                    result.response_text.clone().into(),
                    result.changes_relative_path.into(),
                    result.metrics_json.clone().into(),
                    updated_at_ms.into(),
                    updated_at_ms.into(),
                ],
            ))
            .await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO task_agent_turns
                    (task_agent_id, sequence, prompt, final_status, response_text,
                     metrics_json, created_at_ms)
                SELECT ?, COALESCE(MAX(sequence) + 1, 0), ?, ?, ?, ?, ?
                FROM task_agent_turns
                WHERE task_agent_id = ?
                "#,
                [
                    result.task_agent_id.clone().into(),
                    prompt.into(),
                    result.final_status.as_str().into(),
                    result.response_text.into(),
                    result.metrics_json.into(),
                    updated_at_ms.into(),
                    result.task_agent_id.into(),
                ],
            ))
            .await?;
        transaction.commit().await
    }

    /// Moves the Task aggregate to its current waiting or terminal lifecycle.
    pub(crate) async fn set_task_status(
        &self,
        task_id: &str,
        status: TaskStatus,
        updated_at_ms: i64,
    ) -> Result<(), DbErr> {
        if matches!(status, TaskStatus::Preparing | TaskStatus::Running) {
            return Err(DbErr::Custom(
                "Task completion status is not final".to_string(),
            ));
        }
        self.database
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE tasks SET status = ?, updated_at_ms = ? WHERE id = ?",
                [status.as_str().into(), updated_at_ms.into(), task_id.into()],
            ))
            .await?;
        Ok(())
    }

    /// Finds the owning Task for one Agent Stop request.
    pub(crate) async fn task_id_for_agent(
        &self,
        task_agent_id: &str,
    ) -> Result<Option<String>, DbErr> {
        self.database
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "SELECT task_id FROM task_agents WHERE id = ?",
                [task_agent_id.into()],
            ))
            .await?
            .map(|row| row.try_get("", "task_id"))
            .transpose()
    }

    /// Recomputes the aggregate lifecycle after an independent Agent Stop.
    pub(crate) async fn refresh_task_status(
        &self,
        task_id: &str,
        updated_at_ms: i64,
    ) -> Result<TaskStatus, DbErr> {
        let statuses = self
            .database
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "SELECT status FROM task_agents WHERE task_id = ?",
                [task_id.into()],
            ))
            .await?
            .into_iter()
            .map(|row| {
                let status = row.try_get::<String>("", "status")?;
                TaskStatus::parse(&status)
                    .ok_or_else(|| DbErr::Custom("Task Agent status is invalid".to_string()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if statuses.is_empty() {
            return Err(DbErr::Custom("Task has no Agent Executions".to_string()));
        }
        let status = if statuses.contains(&TaskStatus::Running) {
            TaskStatus::Running
        } else if statuses.contains(&TaskStatus::Preparing) {
            TaskStatus::Preparing
        } else if statuses.contains(&TaskStatus::Waiting) {
            TaskStatus::Waiting
        } else if statuses.contains(&TaskStatus::Failed) {
            TaskStatus::Failed
        } else if statuses.contains(&TaskStatus::Stopped) {
            TaskStatus::Stopped
        } else {
            TaskStatus::Completed
        };
        self.database
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE tasks SET status = ?, updated_at_ms = ? WHERE id = ?",
                [status.as_str().into(), updated_at_ms.into(), task_id.into()],
            ))
            .await?;
        Ok(status)
    }

    /// Deletes one Task after its entire filesystem tree has been removed.
    pub(crate) async fn delete(&self, task_id: &str) -> Result<(), DbErr> {
        self.database
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "DELETE FROM tasks WHERE id = ?",
                [task_id.into()],
            ))
            .await?;
        Ok(())
    }

    /// Lists global Recent or one Workspace's Tasks without mixing scopes.
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
        let turns = self
            .database
            .query_all_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                SELECT t.task_agent_id, t.sequence, t.prompt, t.final_status,
                       t.response_text, t.metrics_json, t.created_at_ms
                FROM task_agent_turns t
                JOIN task_agents a ON a.id = t.task_agent_id
                WHERE a.task_id = ?
                ORDER BY a.slot_index, t.sequence
                "#,
                [task_id.into()],
            ))
            .await?
            .into_iter()
            .map(|row| -> Result<TaskAgentTurn, DbErr> {
                let status = row.try_get::<String>("", "final_status")?;
                Ok(TaskAgentTurn {
                    task_agent_id: row.try_get("", "task_agent_id")?,
                    sequence: row.try_get("", "sequence")?,
                    prompt: row.try_get("", "prompt")?,
                    final_status: TaskStatus::parse(&status).ok_or_else(|| {
                        DbErr::Custom("Task turn contains an invalid status".to_string())
                    })?,
                    response_text: row.try_get("", "response_text")?,
                    metrics_json: row.try_get("", "metrics_json")?,
                    created_at_ms: row.try_get("", "created_at_ms")?,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Some(TaskDetail {
            task,
            agents,
            permissions,
            skills,
            results,
            turns,
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
    use crate::domain::task::{TaskAgentResult, TaskStatus};
    use sea_orm::ConnectionTrait;
    use sea_orm_migration::MigratorTrait;
    use std::sync::atomic::{AtomicU64, Ordering};

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn keeps_global_recent_separate_from_workspace_tasks() {
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
                .expect("Workspace Tasks should list");

            assert_eq!(global.len(), 1);
            assert_eq!(global[0].id, "task-global");
            assert_eq!(workspace.len(), 1);
            assert_eq!(workspace[0].id, "task-workspace");

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("database should be removable");
        });
    }

    #[test]
    fn saves_a_resumable_session_and_ordered_agent_turn() {
        tauri::async_runtime::block_on(async {
            let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "theoria-task-turn-repository-test-{}-{sequence}.sqlite3",
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
                    INSERT INTO tasks
                        (id, workspace_id, title, prompt, baseline_relative_path, status,
                         configuration_locked_at_ms, created_at_ms, updated_at_ms)
                    VALUES ('task-1', NULL, 'Compare', 'Initial prompt',
                            'task-runs/task-1/baseline', 'running', 100, 100, 100);
                    INSERT INTO task_agents
                        (id, task_id, slot_index, agent_kind, model_snapshot, mode_snapshot,
                         session_id, execution_relative_path, status, created_at_ms, updated_at_ms)
                    VALUES ('agent-1', 'task-1', 0, 'codex', 'gpt-5', 'high', NULL,
                            'task-runs/task-1/agents/agent-1', 'running', 100, 100);
                    INSERT INTO task_permissions
                        (task_id, file_access, command_execution, created_at_ms)
                    VALUES ('task-1', 'allow_edits', 'allow', 100);
                    "#,
                )
                .await
                .expect("fixtures should insert");
            let repository = TaskRepository::new(database.clone());

            repository
                .finish_agent_turn(
                    TaskAgentResult {
                        task_agent_id: "agent-1".to_string(),
                        final_status: TaskStatus::Completed,
                        response_text: Some("Initial response".to_string()),
                        changes_relative_path: Some(
                            "task-runs/task-1/agents/agent-1/changes".to_string(),
                        ),
                        metrics_json: "{\"totalTokens\":42}".to_string(),
                    },
                    "Initial prompt",
                    Some("session-1"),
                    200,
                )
                .await
                .expect("turn should persist");

            let detail = repository
                .get("task-1")
                .await
                .expect("task should load")
                .expect("task should exist");
            assert_eq!(detail.agents[0].session_id.as_deref(), Some("session-1"));
            assert_eq!(detail.turns.len(), 1);
            assert_eq!(detail.turns[0].sequence, 0);
            assert_eq!(detail.turns[0].prompt, "Initial prompt");
            assert_eq!(
                detail.turns[0].response_text.as_deref(),
                Some("Initial response")
            );

            repository
                .set_task_status("task-1", TaskStatus::Completed, 210)
                .await
                .expect("task should complete");
            assert!(repository
                .begin_agent_turns("task-1", &["agent-1".to_string()], 220)
                .await
                .expect("turn should begin"));
            let resumed = repository
                .get("task-1")
                .await
                .expect("resumed task should load")
                .expect("resumed task should exist");
            assert_eq!(resumed.task.status, TaskStatus::Running);
            assert_eq!(resumed.agents[0].status, TaskStatus::Running);
            assert_eq!(resumed.agents[0].session_id.as_deref(), Some("session-1"));
            assert_eq!(resumed.turns.len(), 1);

            repository
                .wait_agent_turn(
                    "agent-1",
                    "Which test suite?",
                    Some("Please choose a test suite."),
                    r#"{"waiting":true}"#,
                    "session-1",
                    230,
                )
                .await
                .expect("waiting turn should persist");
            let waiting = repository
                .get("task-1")
                .await
                .expect("waiting task should load")
                .expect("waiting task should exist");
            assert_eq!(waiting.agents[0].status, TaskStatus::Waiting);
            assert_eq!(waiting.turns.len(), 2);
            assert_eq!(waiting.turns[1].final_status, TaskStatus::Waiting);
            assert_eq!(waiting.turns[1].prompt, "Which test suite?");

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("database should be removable");
        });
    }
}
