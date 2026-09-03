use crate::domain::agent_kind::AgentKind;
use crate::domain::task::{
    Task, TaskAgent, TaskAgentResult, TaskAgentTurn, TaskDetail, TaskPermissions, TaskSkill,
    TaskStatus,
};
use crate::models::task::{self as task, agent, permissions, result, skill, turn};
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::{
    ActiveModelTrait,
    ActiveValue::{NotSet, Set},
    ColumnTrait, DatabaseConnection, DatabaseTransaction, DbErr, EntityTrait, QueryFilter,
    QueryOrder, QuerySelect, SqliteTransactionMode, TransactionOptions, TransactionTrait,
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
        task::ActiveModel {
            id: Set(detail.task.id.clone()),
            workspace_id: Set(detail.task.workspace_id.clone()),
            title: Set(detail.task.title.clone()),
            prompt: Set(detail.task.prompt.clone()),
            baseline_relative_path: Set(detail.task.baseline_relative_path.clone()),
            status: Set(detail.task.status.as_str().to_string()),
            configuration_locked_at_ms: Set(detail.task.configuration_locked_at_ms),
            pinned_at_ms: Set(detail.task.pinned_at_ms),
            created_at_ms: Set(detail.task.created_at_ms),
            updated_at_ms: Set(detail.task.updated_at_ms),
        }
        .insert(&transaction)
        .await?;
        for agent in &detail.agents {
            agent::ActiveModel {
                id: Set(agent.id.clone()),
                task_id: Set(agent.task_id.clone()),
                slot_index: Set(agent.slot_index),
                agent_kind: Set(agent.agent_kind.as_str().to_string()),
                model_snapshot: Set(agent.model_snapshot.clone()),
                mode_snapshot: Set(agent.mode_snapshot.clone()),
                session_id: Set(agent.session_id.clone()),
                execution_relative_path: Set(agent.execution_relative_path.clone()),
                status: Set(agent.status.as_str().to_string()),
                created_at_ms: Set(agent.created_at_ms),
                updated_at_ms: Set(agent.updated_at_ms),
            }
            .insert(&transaction)
            .await?;
        }
        permissions::ActiveModel {
            task_id: Set(detail.task.id.clone()),
            file_access: Set(detail.permissions.file_access.clone()),
            command_execution: Set(detail.permissions.command_execution.clone()),
            created_at_ms: Set(detail.task.created_at_ms),
        }
        .insert(&transaction)
        .await?;
        for skill in &detail.skills {
            skill::ActiveModel {
                task_id: Set(detail.task.id.clone()),
                folder_name: Set(skill.folder_name.clone()),
                origin: Set(skill.origin.clone()),
                library_skill_id: Set(skill.library_skill_id.clone()),
                relative_path: Set(skill.relative_path.clone()),
                created_at_ms: Set(detail.task.created_at_ms),
            }
            .insert(&transaction)
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
        task::Entity::update_many()
            .col_expr(task::Column::Status, Expr::value("running"))
            .col_expr(task::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(task::Column::Id.eq(task_id))
            .filter(task::Column::Status.eq("preparing"))
            .exec(&transaction)
            .await?;
        agent::Entity::update_many()
            .col_expr(agent::Column::Status, Expr::value("running"))
            .col_expr(agent::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(agent::Column::TaskId.eq(task_id))
            .filter(agent::Column::Status.eq("preparing"))
            .exec(&transaction)
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
        let task_update = task::Entity::update_many()
            .col_expr(task::Column::Status, Expr::value("running"))
            .col_expr(task::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(task::Column::Id.eq(task_id))
            .filter(task::Column::Status.is_in(["waiting", "completed", "failed"]))
            .exec(&transaction)
            .await?;
        if task_update.rows_affected != 1 {
            transaction.rollback().await?;
            return Ok(false);
        }
        for task_agent_id in task_agent_ids {
            let agent_update = agent::Entity::update_many()
                .col_expr(agent::Column::Status, Expr::value("running"))
                .col_expr(agent::Column::UpdatedAtMs, Expr::value(updated_at_ms))
                .filter(agent::Column::Id.eq(task_agent_id))
                .filter(agent::Column::TaskId.eq(task_id))
                .filter(agent::Column::SessionId.is_not_null())
                .filter(agent::Column::Status.is_in(["waiting", "completed"]))
                .exec(&transaction)
                .await?;
            if agent_update.rows_affected != 1 {
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
        let transaction = self
            .database
            .begin_with_options(TransactionOptions {
                sqlite_transaction_mode: Some(SqliteTransactionMode::Immediate),
                ..TransactionOptions::default()
            })
            .await?;
        let update = agent::Entity::update_many()
            .col_expr(agent::Column::Status, Expr::value("waiting"))
            .col_expr(agent::Column::SessionId, Expr::value(session_id))
            .col_expr(agent::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(agent::Column::Id.eq(task_agent_id))
            .filter(agent::Column::Status.eq("running"))
            .exec(&transaction)
            .await?;
        if update.rows_affected != 1 {
            transaction.rollback().await?;
            return Err(DbErr::Custom(
                "Waiting Agent turn is not running".to_string(),
            ));
        }
        insert_task_agent_turn(
            &transaction,
            task_agent_id,
            prompt,
            TaskStatus::Waiting,
            response_text,
            metrics_json,
            updated_at_ms,
        )
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
        agent::Entity::update_many()
            .col_expr(
                agent::Column::Status,
                Expr::value(result.final_status.as_str()),
            )
            .col_expr(agent::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(agent::Column::Id.eq(&result.task_agent_id))
            .exec(&transaction)
            .await?;
        upsert_agent_result(&transaction, &result, updated_at_ms).await?;
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
        let transaction = self
            .database
            .begin_with_options(TransactionOptions {
                sqlite_transaction_mode: Some(SqliteTransactionMode::Immediate),
                ..TransactionOptions::default()
            })
            .await?;
        let mut update = agent::Entity::update_many()
            .col_expr(
                agent::Column::Status,
                Expr::value(result.final_status.as_str()),
            )
            .col_expr(agent::Column::UpdatedAtMs, Expr::value(updated_at_ms));
        if let Some(session_id) = session_id {
            update = update.col_expr(agent::Column::SessionId, Expr::value(session_id));
        }
        update
            .filter(agent::Column::Id.eq(&result.task_agent_id))
            .exec(&transaction)
            .await?;
        upsert_agent_result(&transaction, &result, updated_at_ms).await?;
        insert_task_agent_turn(
            &transaction,
            &result.task_agent_id,
            prompt,
            result.final_status,
            result.response_text.as_deref(),
            &result.metrics_json,
            updated_at_ms,
        )
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
        task::Entity::update_many()
            .col_expr(task::Column::Status, Expr::value(status.as_str()))
            .col_expr(task::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(task::Column::Id.eq(task_id))
            .exec(&self.database)
            .await?;
        Ok(())
    }

    /// Finds the owning Task for one Agent Stop request.
    pub(crate) async fn task_id_for_agent(
        &self,
        task_agent_id: &str,
    ) -> Result<Option<String>, DbErr> {
        agent::Entity::find_by_id(task_agent_id)
            .select_only()
            .column(agent::Column::TaskId)
            .into_tuple::<String>()
            .one(&self.database)
            .await
    }

    /// Recomputes the aggregate lifecycle after an independent Agent Stop.
    pub(crate) async fn refresh_task_status(
        &self,
        task_id: &str,
        updated_at_ms: i64,
    ) -> Result<TaskStatus, DbErr> {
        let statuses = agent::Entity::find()
            .select_only()
            .column(agent::Column::Status)
            .filter(agent::Column::TaskId.eq(task_id))
            .into_tuple::<String>()
            .all(&self.database)
            .await?
            .into_iter()
            .map(|status| {
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
        task::Entity::update_many()
            .col_expr(task::Column::Status, Expr::value(status.as_str()))
            .col_expr(task::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(task::Column::Id.eq(task_id))
            .exec(&self.database)
            .await?;
        Ok(status)
    }

    /// Deletes one Task after its entire filesystem tree has been removed.
    pub(crate) async fn delete(&self, task_id: &str) -> Result<(), DbErr> {
        task::Entity::delete_by_id(task_id)
            .exec(&self.database)
            .await?;
        Ok(())
    }

    /// Persists a trimmed title and returns the updated Task when it exists.
    pub(crate) async fn rename(
        &self,
        task_id: &str,
        title: &str,
        updated_at_ms: i64,
    ) -> Result<Option<Task>, DbErr> {
        task::Entity::update_many()
            .col_expr(task::Column::Title, Expr::value(title))
            .col_expr(task::Column::UpdatedAtMs, Expr::value(updated_at_ms))
            .filter(task::Column::Id.eq(task_id))
            .exec(&self.database)
            .await?;
        task::Entity::find_by_id(task_id)
            .one(&self.database)
            .await?
            .map(task_from_model)
            .transpose()
    }

    /// Persists pin state for a Task in either sidebar scope and returns the updated row.
    pub(crate) async fn set_pin(
        &self,
        task_id: &str,
        pinned_at_ms: Option<i64>,
    ) -> Result<Option<Task>, DbErr> {
        task::Entity::update_many()
            .col_expr(task::Column::PinnedAtMs, Expr::value(pinned_at_ms))
            .filter(task::Column::Id.eq(task_id))
            .exec(&self.database)
            .await?;
        task::Entity::find()
            .filter(task::Column::Id.eq(task_id))
            .one(&self.database)
            .await?
            .map(task_from_model)
            .transpose()
    }

    /// Lists global Recent or one Workspace's Tasks without mixing scopes.
    pub(crate) async fn list(&self, workspace_id: Option<&str>) -> Result<Vec<Task>, DbErr> {
        let query = task::Entity::find();
        let query = match workspace_id {
            Some(workspace_id) => query.filter(task::Column::WorkspaceId.eq(workspace_id)),
            None => query.filter(task::Column::WorkspaceId.is_null()),
        };
        query
            .order_by_desc(task::Column::PinnedAtMs)
            .order_by_desc(task::Column::CreatedAtMs)
            .order_by_desc(task::Column::Id)
            .all(&self.database)
            .await?
            .into_iter()
            .map(task_from_model)
            .collect()
    }

    /// Restores immutable configuration, Executions, Skills, and results for one Task.
    pub(crate) async fn get(&self, task_id: &str) -> Result<Option<TaskDetail>, DbErr> {
        let task = task::Entity::find_by_id(task_id)
            .one(&self.database)
            .await?
            .map(task_from_model)
            .transpose()?;
        let Some(task) = task else {
            return Ok(None);
        };
        let agents = agent::Entity::find()
            .filter(agent::Column::TaskId.eq(task_id))
            .order_by_asc(agent::Column::SlotIndex)
            .all(&self.database)
            .await?
            .into_iter()
            .map(task_agent_from_model)
            .collect::<Result<Vec<_>, _>>()?;
        let permissions = permissions::Entity::find_by_id(task_id)
            .one(&self.database)
            .await?
            .map(|model| TaskPermissions {
                file_access: model.file_access,
                command_execution: model.command_execution,
            })
            .ok_or_else(|| DbErr::Custom("Task permissions are missing".to_string()))?;
        let skills = skill::Entity::find()
            .filter(skill::Column::TaskId.eq(task_id))
            .order_by_asc(skill::Column::FolderName)
            .all(&self.database)
            .await?
            .into_iter()
            .map(|model| TaskSkill {
                folder_name: model.folder_name,
                origin: model.origin,
                library_skill_id: model.library_skill_id,
                relative_path: model.relative_path,
            })
            .collect();
        let results = result::Entity::find()
            .find_both_related(agent::Entity)
            .filter(agent::Column::TaskId.eq(task_id))
            .order_by_asc(agent::Column::SlotIndex)
            .all(&self.database)
            .await?
            .into_iter()
            .map(|(model, _)| task_agent_result_from_model(model))
            .collect::<Result<Vec<_>, _>>()?;
        let turns = turn::Entity::find()
            .find_both_related(agent::Entity)
            .filter(agent::Column::TaskId.eq(task_id))
            .order_by_asc(agent::Column::SlotIndex)
            .order_by_asc(turn::Column::Sequence)
            .all(&self.database)
            .await?
            .into_iter()
            .map(|(model, _)| task_agent_turn_from_model(model))
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

/// Maps one Task model while rejecting corrupted lifecycle values.
fn task_from_model(model: task::Model) -> Result<Task, DbErr> {
    Ok(Task {
        id: model.id,
        workspace_id: model.workspace_id,
        title: model.title,
        prompt: model.prompt,
        baseline_relative_path: model.baseline_relative_path,
        status: TaskStatus::parse(&model.status)
            .ok_or_else(|| DbErr::Custom("Task contains an invalid status".to_string()))?,
        configuration_locked_at_ms: model.configuration_locked_at_ms,
        pinned_at_ms: model.pinned_at_ms,
        created_at_ms: model.created_at_ms,
        updated_at_ms: model.updated_at_ms,
    })
}

/// Maps one Agent model and validates its Agent and status identifiers.
fn task_agent_from_model(model: agent::Model) -> Result<TaskAgent, DbErr> {
    Ok(TaskAgent {
        id: model.id,
        task_id: model.task_id,
        slot_index: model.slot_index,
        agent_kind: AgentKind::parse(&model.agent_kind)
            .ok_or_else(|| DbErr::Custom("Task Agent contains an invalid kind".to_string()))?,
        model_snapshot: model.model_snapshot,
        mode_snapshot: model.mode_snapshot,
        session_id: model.session_id,
        execution_relative_path: model.execution_relative_path,
        status: TaskStatus::parse(&model.status)
            .ok_or_else(|| DbErr::Custom("Task Agent contains an invalid status".to_string()))?,
        created_at_ms: model.created_at_ms,
        updated_at_ms: model.updated_at_ms,
    })
}

/// Maps one terminal result model while rejecting corrupted lifecycle values.
fn task_agent_result_from_model(model: result::Model) -> Result<TaskAgentResult, DbErr> {
    Ok(TaskAgentResult {
        task_agent_id: model.task_agent_id,
        final_status: TaskStatus::parse(&model.final_status)
            .ok_or_else(|| DbErr::Custom("Task result contains an invalid status".to_string()))?,
        response_text: model.response_text,
        changes_relative_path: model.changes_relative_path,
        metrics_json: model.metrics_json,
    })
}

/// Maps one preserved turn model while rejecting corrupted lifecycle values.
fn task_agent_turn_from_model(model: turn::Model) -> Result<TaskAgentTurn, DbErr> {
    Ok(TaskAgentTurn {
        task_agent_id: model.task_agent_id,
        sequence: model.sequence,
        prompt: model.prompt,
        final_status: TaskStatus::parse(&model.final_status)
            .ok_or_else(|| DbErr::Custom("Task turn contains an invalid status".to_string()))?,
        response_text: model.response_text,
        metrics_json: model.metrics_json,
        created_at_ms: model.created_at_ms,
    })
}

/// Inserts or replaces the latest result without changing its original creation time.
async fn upsert_agent_result(
    transaction: &DatabaseTransaction,
    task_result: &TaskAgentResult,
    updated_at_ms: i64,
) -> Result<(), DbErr> {
    result::Entity::insert(result::ActiveModel {
        task_agent_id: Set(task_result.task_agent_id.clone()),
        final_status: Set(task_result.final_status.as_str().to_string()),
        response_text: Set(task_result.response_text.clone()),
        changes_relative_path: Set(task_result.changes_relative_path.clone()),
        metrics_json: Set(task_result.metrics_json.clone()),
        created_at_ms: Set(updated_at_ms),
        updated_at_ms: Set(updated_at_ms),
    })
    .on_conflict(
        OnConflict::column(result::Column::TaskAgentId)
            .update_columns([
                result::Column::FinalStatus,
                result::Column::ResponseText,
                result::Column::ChangesRelativePath,
                result::Column::MetricsJson,
                result::Column::UpdatedAtMs,
            ])
            .to_owned(),
    )
    .exec_without_returning(transaction)
    .await?;
    Ok(())
}

/// Appends one Agent turn while holding an immediate SQLite write transaction.
async fn insert_task_agent_turn(
    transaction: &DatabaseTransaction,
    task_agent_id: &str,
    prompt: &str,
    final_status: TaskStatus,
    response_text: Option<&str>,
    metrics_json: &str,
    created_at_ms: i64,
) -> Result<(), DbErr> {
    let sequence = turn::Entity::find()
        .select_only()
        .column_as(turn::Column::Sequence.max(), "max_sequence")
        .filter(turn::Column::TaskAgentId.eq(task_agent_id))
        .into_tuple::<Option<i64>>()
        .one(transaction)
        .await?
        .flatten()
        .map_or(0, |sequence| sequence + 1);
    turn::ActiveModel {
        id: NotSet,
        task_agent_id: Set(task_agent_id.to_string()),
        sequence: Set(sequence),
        prompt: Set(prompt.to_string()),
        final_status: Set(final_status.as_str().to_string()),
        response_text: Set(response_text.map(str::to_string)),
        metrics_json: Set(metrics_json.to_string()),
        created_at_ms: Set(created_at_ms),
    }
    .insert(transaction)
    .await?;
    Ok(())
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
    fn renames_and_pins_tasks_in_each_sidebar_scope() {
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
                        ('task-global-newer', NULL, 'Newer', 'Compare',
                         'task-runs/task-global-newer/baseline', 'completed', 100, 120, 220),
                        ('task-workspace', 'workspace-1', 'Workspace', 'Compare',
                         'task-runs/task-workspace/baseline', 'running', 100, 110, 210);
                    "#,
                )
                .await
                .expect("fixtures should insert");
            let repository = TaskRepository::new(database.clone());

            let renamed = repository
                .rename("task-global", "Pinned global", 300)
                .await
                .expect("Recent Task should rename")
                .expect("Recent Task should exist");
            let pinned = repository
                .set_pin("task-global", Some(310))
                .await
                .expect("Recent Task should pin")
                .expect("Recent Task should exist");
            let workspace_pinned = repository
                .set_pin("task-workspace", Some(320))
                .await
                .expect("Workspace Task should pin")
                .expect("Workspace Task should exist");

            let global = repository.list(None).await.expect("Recent should list");
            let workspace = repository
                .list(Some("workspace-1"))
                .await
                .expect("Workspace Tasks should list");

            assert_eq!(renamed.title, "Pinned global");
            assert_eq!(pinned.pinned_at_ms, Some(310));
            assert_eq!(global.len(), 2);
            assert_eq!(global[0].id, "task-global");
            assert_eq!(global[0].title, "Pinned global");
            assert_eq!(global[0].pinned_at_ms, Some(310));
            assert_eq!(workspace.len(), 1);
            assert_eq!(workspace[0].id, "task-workspace");
            assert_eq!(workspace_pinned.pinned_at_ms, Some(320));
            assert_eq!(workspace[0].pinned_at_ms, Some(320));

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
