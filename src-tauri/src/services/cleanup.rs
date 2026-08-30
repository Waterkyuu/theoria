use crate::domain::workspace::WorkspaceSourceKind;
use crate::error::AppError;
use crate::repositories::task::TaskRepository;
use crate::repositories::workspace::WorkspaceRepository;
use crate::services::snapshot::SnapshotService;
use crate::services::task_execution::TaskExecutionService;
use std::path::PathBuf;

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

/// Removes a Workspace collection while preserving user-owned external sources.
#[derive(Clone)]
pub(crate) struct WorkspaceCleanupService {
    /// Persisted Workspace and mount cascade boundary.
    workspace_repository: WorkspaceRepository,
    /// Workspace-scoped Task lookup boundary.
    task_repository: TaskRepository,
    /// Ordered per-Task cleanup boundary.
    task_cleanup_service: TaskCleanupService,
    /// Root used to validate managed template ownership.
    app_data_directory: PathBuf,
}

impl WorkspaceCleanupService {
    /// Creates a Workspace cleanup coordinator over Task cleanup and local storage.
    pub(crate) fn new(
        workspace_repository: WorkspaceRepository,
        task_repository: TaskRepository,
        task_cleanup_service: TaskCleanupService,
        app_data_directory: PathBuf,
    ) -> Self {
        Self {
            workspace_repository,
            task_repository,
            task_cleanup_service,
            app_data_directory,
        }
    }

    /// Removes all Tasks, managed files when confirmed, mounts, and the Workspace record.
    pub(crate) async fn remove_workspace(
        &self,
        workspace_id: &str,
        managed_files_confirmed: bool,
    ) -> Result<(), AppError> {
        let workspace = match self
            .workspace_repository
            .list()
            .await
            .map_err(|_| AppError::WorkspaceDatabaseFailed)?
            .into_iter()
            .find(|workspace| workspace.id == workspace_id)
        {
            Some(workspace) => workspace,
            None => return Ok(()),
        };
        if workspace.source_kind == WorkspaceSourceKind::Managed && !managed_files_confirmed {
            return Err(AppError::InvalidWorkspace);
        }
        let tasks = self
            .task_repository
            .list(Some(workspace_id))
            .await
            .map_err(|_| AppError::WorkspaceDatabaseFailed)?;
        for task in tasks {
            self.task_cleanup_service.delete_task(&task.id).await?;
        }
        if workspace.source_kind == WorkspaceSourceKind::Managed {
            let managed_directory = self
                .app_data_directory
                .join("workspaces")
                .join(workspace_id);
            if workspace.source_path != managed_directory.join("files") {
                return Err(AppError::WorkspaceFilesystemFailed);
            }
            match tokio::fs::remove_dir_all(&managed_directory).await {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(AppError::WorkspaceFilesystemFailed),
            }
        }
        self.workspace_repository
            .delete(workspace_id)
            .await
            .map_err(|_| AppError::WorkspaceDatabaseFailed)
    }
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
    use super::{TaskCleanupService, WorkspaceCleanupService};
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::domain::agent_kind::AgentKind;
    use crate::domain::skill::{NewSkill, SkillSourceType};
    use crate::domain::task::{Task, TaskAgent, TaskDetail, TaskPermissions, TaskStatus};
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::repositories::skill::SkillRepository;
    use crate::repositories::task::TaskRepository;
    use crate::repositories::workspace::WorkspaceRepository;
    use crate::services::result::ResultCollector;
    use crate::services::snapshot::SnapshotService;
    use crate::services::task_execution::TaskExecutionService;
    use sea_orm_migration::MigratorTrait;
    use std::path::PathBuf;
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

    #[test]
    fn removes_external_workspace_mounts_without_touching_user_files() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-workspace-cleanup-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("external");
            let app_data = root.join("app-data");
            std::fs::create_dir_all(&source).expect("external source should be created");
            std::fs::write(source.join("input.txt"), "preserve")
                .expect("external source should be written");
            let database_path = root.join("theoria.sqlite3");
            let database =
                connect_sqlite(&format!("sqlite://{}?mode=rwc", database_path.display()))
                    .await
                    .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            let workspace_repository = WorkspaceRepository::new(database.clone());
            workspace_repository
                .create(NewWorkspace {
                    id: "workspace-external".to_string(),
                    name: "External".to_string(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: source.clone(),
                    created_at_ms: 100,
                })
                .await
                .expect("Workspace should save");
            let skill_repository = SkillRepository::new(database.clone());
            let skill = skill_repository
                .create(NewSkill {
                    id: "skill-1".to_string(),
                    folder_name: "map".to_string(),
                    display_name: "Map".to_string(),
                    description: "Maps files".to_string(),
                    source_type: SkillSourceType::LocalFolder,
                    storage_relative_path: PathBuf::from("skills/skill-1"),
                    source_path: None,
                    created_at_ms: 100,
                })
                .await
                .expect("Skill should save");
            skill_repository
                .mount("workspace-external", &skill, 100)
                .await
                .expect("Skill should mount");
            let task_repository = TaskRepository::new(database.clone());
            let execution_service = TaskExecutionService::new(
                task_repository.clone(),
                ResultCollector::new(app_data.clone()),
                app_data.clone(),
            );
            let task_cleanup = TaskCleanupService::new(
                task_repository.clone(),
                SnapshotService::new(app_data.clone()),
                execution_service,
            );
            let service = WorkspaceCleanupService::new(
                workspace_repository.clone(),
                task_repository,
                task_cleanup,
                app_data,
            );

            service
                .remove_workspace("workspace-external", false)
                .await
                .expect("external Workspace should remove");
            service
                .remove_workspace("workspace-external", false)
                .await
                .expect("removal should be idempotent");

            assert_eq!(
                std::fs::read_to_string(source.join("input.txt")).unwrap(),
                "preserve"
            );
            assert!(workspace_repository.list().await.unwrap().is_empty());
            assert!(skill_repository
                .list_for_workspace("workspace-external")
                .await
                .unwrap()
                .is_empty());
            assert_eq!(skill_repository.list().await.unwrap(), vec![skill]);

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[test]
    fn retains_managed_workspace_and_mounts_when_template_cleanup_is_unsafe() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-workspace-retry-test-{}-{sequence}",
                std::process::id()
            ));
            let app_data = root.join("app-data");
            let unsafe_source = root.join("outside/files");
            std::fs::create_dir_all(&unsafe_source).expect("unsafe fixture should be created");
            let database_path = root.join("theoria.sqlite3");
            let database =
                connect_sqlite(&format!("sqlite://{}?mode=rwc", database_path.display()))
                    .await
                    .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            let workspace_repository = WorkspaceRepository::new(database.clone());
            workspace_repository
                .create(NewWorkspace {
                    id: "workspace-managed".to_string(),
                    name: "Managed".to_string(),
                    source_kind: WorkspaceSourceKind::Managed,
                    source_path: unsafe_source.clone(),
                    created_at_ms: 100,
                })
                .await
                .expect("Workspace should save");
            let skill_repository = SkillRepository::new(database.clone());
            let skill = skill_repository
                .create(NewSkill {
                    id: "skill-retry".to_string(),
                    folder_name: "retry".to_string(),
                    display_name: "Retry".to_string(),
                    description: "Retained mount".to_string(),
                    source_type: SkillSourceType::LocalFolder,
                    storage_relative_path: PathBuf::from("skills/skill-retry"),
                    source_path: None,
                    created_at_ms: 100,
                })
                .await
                .expect("Skill should save");
            skill_repository
                .mount("workspace-managed", &skill, 100)
                .await
                .expect("Skill should mount");
            let task_repository = TaskRepository::new(database.clone());
            let execution_service = TaskExecutionService::new(
                task_repository.clone(),
                ResultCollector::new(app_data.clone()),
                app_data.clone(),
            );
            let service = WorkspaceCleanupService::new(
                workspace_repository.clone(),
                task_repository.clone(),
                TaskCleanupService::new(
                    task_repository,
                    SnapshotService::new(app_data.clone()),
                    execution_service,
                ),
                app_data,
            );

            let result = service.remove_workspace("workspace-managed", true).await;

            assert_eq!(
                result,
                Err(crate::error::AppError::WorkspaceFilesystemFailed)
            );
            assert_eq!(workspace_repository.list().await.unwrap().len(), 1);
            assert_eq!(
                skill_repository
                    .list_for_workspace("workspace-managed")
                    .await
                    .unwrap(),
                vec![skill]
            );
            assert!(unsafe_source.is_dir());

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }
}
