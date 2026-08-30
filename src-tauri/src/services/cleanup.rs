use crate::error::AppError;
use crate::repositories::task::TaskRepository;
use crate::services::snapshot::SnapshotService;
use crate::services::task_execution::TaskExecutionService;

/// Stops Agent processes and removes Task files before deleting database records.
#[derive(Clone)]
pub(crate) struct TaskCleanupService {
    /// Persisted Task aggregate boundary.
    repository: TaskRepository,
    /// Complete Task filesystem removal boundary.
    snapshot_service: SnapshotService,
    /// Active Agent cancellation and wait boundary.
    execution_service: TaskExecutionService,
}

impl TaskCleanupService {
    /// Creates an ordered Task cleanup coordinator.
    pub(crate) fn new(
        repository: TaskRepository,
        snapshot_service: SnapshotService,
        execution_service: TaskExecutionService,
    ) -> Self {
        Self {
            repository,
            snapshot_service,
            execution_service,
        }
    }

    /// Deletes one Task idempotently after all writers and files are gone.
    pub(crate) async fn delete_task(&self, task_id: &str) -> Result<(), AppError> {
        if self
            .repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .is_none()
        {
            return Ok(());
        }
        self.execution_service.stop_task_and_wait(task_id).await?;
        self.snapshot_service.remove_task_files(task_id).await?;
        self.repository
            .delete(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)
    }
}

#[cfg(test)]
mod tests {
    use super::TaskCleanupService;
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::domain::agent_kind::AgentKind;
    use crate::domain::task::{Task, TaskAgent, TaskDetail, TaskPermissions, TaskStatus};
    use crate::repositories::task::TaskRepository;
    use crate::services::result::ResultCollector;
    use crate::services::snapshot::SnapshotService;
    use crate::services::task_execution::TaskExecutionService;
    use sea_orm_migration::MigratorTrait;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RESOURCE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn removes_task_files_before_cascading_database_records() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-task-cleanup-test-{}-{sequence}",
                std::process::id()
            ));
            let app_data = root.join("app-data");
            let task_root = app_data.join("task-runs/task-1");
            std::fs::create_dir_all(task_root.join("baseline"))
                .expect("Task files should be created");
            std::fs::create_dir_all(task_root.join("executions/agent-1/workspace"))
                .expect("Execution should be created");
            std::fs::write(task_root.join("baseline/input.txt"), "baseline")
                .expect("Baseline should be written");
            let database_path = root.join("theoria.sqlite3");
            let database =
                connect_sqlite(&format!("sqlite://{}?mode=rwc", database_path.display()))
                    .await
                    .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            let repository = TaskRepository::new(database.clone());
            repository
                .create(TaskDetail {
                    task: Task {
                        id: "task-1".to_string(),
                        workspace_id: None,
                        title: "Cleanup".to_string(),
                        prompt: "Remove files".to_string(),
                        baseline_relative_path: "task-runs/task-1/baseline".to_string(),
                        status: TaskStatus::Preparing,
                        configuration_locked_at_ms: Some(100),
                        created_at_ms: 100,
                        updated_at_ms: 100,
                    },
                    agents: vec![TaskAgent {
                        id: "agent-1".to_string(),
                        task_id: "task-1".to_string(),
                        slot_index: 0,
                        agent_kind: AgentKind::Codex,
                        model_snapshot: None,
                        mode_snapshot: None,
                        session_id: None,
                        execution_relative_path: "task-runs/task-1/executions/agent-1/workspace"
                            .to_string(),
                        status: TaskStatus::Preparing,
                        created_at_ms: 100,
                        updated_at_ms: 100,
                    }],
                    permissions: TaskPermissions {
                        file_access: "allow_edits".to_string(),
                        command_execution: "ask".to_string(),
                    },
                    skills: Vec::new(),
                    results: Vec::new(),
                })
                .await
                .expect("Task should save");
            let snapshot_service = SnapshotService::new(app_data.clone());
            let execution_service = TaskExecutionService::new(
                repository.clone(),
                ResultCollector::new(app_data.clone()),
                app_data,
            );
            let service =
                TaskCleanupService::new(repository.clone(), snapshot_service, execution_service);

            service
                .delete_task("task-1")
                .await
                .expect("Task should delete");
            service
                .delete_task("task-1")
                .await
                .expect("Task deletion should be idempotent");

            assert!(!task_root.exists());
            assert!(repository.get("task-1").await.unwrap().is_none());
            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }
}
