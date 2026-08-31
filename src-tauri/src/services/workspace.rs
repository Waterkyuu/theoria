use crate::domain::workspace::{Workspace, WorkspaceSourceKind};
use crate::error::AppError;
use crate::repositories::workspace::WorkspaceRepository;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static WORKSPACE_ID_SEQUENCE: AtomicU64 = AtomicU64::new(1);

/// Coordinates Workspace validation, managed storage, and persistence.
#[derive(Clone)]
pub(crate) struct WorkspaceService {
    /// Persisted Workspace metadata boundary.
    repository: WorkspaceRepository,
    /// Root directory that owns managed Workspace templates.
    app_data_directory: PathBuf,
}

impl WorkspaceService {
    /// Creates a Workspace service rooted in the current application data directory.
    pub(crate) fn new(repository: WorkspaceRepository, app_data_directory: PathBuf) -> Self {
        Self {
            repository,
            app_data_directory,
        }
    }

    /// Registers a user-owned directory without modifying its contents.
    pub(crate) async fn register_external(
        &self,
        name: String,
        source_path: PathBuf,
    ) -> Result<Workspace, AppError> {
        let name = validate_workspace_name(name)?;
        let source_path = tokio::fs::canonicalize(source_path)
            .await
            .map_err(|_| AppError::InvalidWorkspace)?;
        let metadata = tokio::fs::metadata(&source_path)
            .await
            .map_err(|_| AppError::InvalidWorkspace)?;
        if !metadata.is_dir() {
            return Err(AppError::InvalidWorkspace);
        }
        let created_at_ms = current_time_ms()?;

        self.repository
            .create(crate::domain::workspace::NewWorkspace {
                id: format!(
                    "workspace-{created_at_ms}-{}",
                    WORKSPACE_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
                ),
                name,
                source_kind: WorkspaceSourceKind::External,
                source_path,
                created_at_ms,
            })
            .await
            .map_err(|_| AppError::WorkspaceDatabaseFailed)
    }

    /// Creates an empty managed template owned by Theoria.
    pub(crate) async fn create_managed(&self, name: String) -> Result<Workspace, AppError> {
        let name = validate_workspace_name(name)?;
        let created_at_ms = current_time_ms()?;
        let id = format!(
            "workspace-{created_at_ms}-{}",
            WORKSPACE_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let workspace_directory = self.app_data_directory.join("workspaces").join(&id);
        let source_path = workspace_directory.join("files");
        tokio::fs::create_dir_all(&source_path)
            .await
            .map_err(|_| AppError::WorkspaceFilesystemFailed)?;
        let workspace = self
            .repository
            .create(crate::domain::workspace::NewWorkspace {
                id,
                name,
                source_kind: WorkspaceSourceKind::Managed,
                source_path,
                created_at_ms,
            })
            .await;
        match workspace {
            Ok(workspace) => Ok(workspace),
            Err(_) => {
                tokio::fs::remove_dir_all(workspace_directory)
                    .await
                    .map_err(|_| AppError::WorkspaceFilesystemFailed)?;
                Err(AppError::WorkspaceDatabaseFailed)
            }
        }
    }

    /// Lists persisted Workspace inputs in sidebar order.
    pub(crate) async fn list(&self) -> Result<Vec<Workspace>, AppError> {
        self.repository
            .list()
            .await
            .map_err(|_| AppError::WorkspaceDatabaseFailed)
    }

    /// Sets the Workspace pin timestamp used for persisted sidebar ordering.
    pub(crate) async fn set_pin(
        &self,
        workspace_id: &str,
        is_pinned: bool,
    ) -> Result<Workspace, AppError> {
        let pinned_at_ms = if is_pinned {
            Some(current_time_ms()?)
        } else {
            None
        };
        self.repository
            .set_pin(workspace_id, pinned_at_ms)
            .await
            .map_err(|_| AppError::WorkspaceDatabaseFailed)
    }
}

/// Trims a Workspace name while enforcing the persisted length contract.
fn validate_workspace_name(name: String) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 120 {
        return Err(AppError::InvalidWorkspace);
    }
    Ok(name.to_string())
}

/// Returns a positive Unix millisecond timestamp suitable for persisted ordering.
fn current_time_ms() -> Result<i64, AppError> {
    let milliseconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::WorkspaceFilesystemFailed)?
        .as_millis();
    i64::try_from(milliseconds).map_err(|_| AppError::WorkspaceFilesystemFailed)
}

#[cfg(test)]
mod tests {
    use super::WorkspaceService;
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::domain::workspace::WorkspaceSourceKind;
    use crate::repositories::workspace::WorkspaceRepository;
    use sea_orm_migration::MigratorTrait;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RESOURCE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    /// Creates isolated application data, external input, and migrated storage.
    async fn workspace_fixture() -> (
        WorkspaceService,
        sea_orm::DatabaseConnection,
        std::path::PathBuf,
        std::path::PathBuf,
    ) {
        let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "theoria-workspace-service-test-{}-{sequence}",
            std::process::id()
        ));
        let external = root.join("external");
        std::fs::create_dir_all(&external).expect("fixture directories should be created");
        std::fs::write(external.join("input.txt"), "unchanged")
            .expect("fixture input should be written");
        let database_path = root.join("theoria.sqlite3");
        let database = connect_sqlite(&format!("sqlite://{}?mode=rwc", database_path.display()))
            .await
            .expect("database should connect");
        Migrator::up(&database, None)
            .await
            .expect("migration should succeed");
        let service = WorkspaceService::new(
            WorkspaceRepository::new(database.clone()),
            root.join("app-data"),
        );
        (service, database, root, external)
    }

    #[test]
    fn registers_external_workspace_without_modifying_source_files() {
        tauri::async_runtime::block_on(async {
            let (service, database, root, external) = workspace_fixture().await;

            let workspace = service
                .register_external("Docs lab".to_string(), external.clone())
                .await
                .expect("external Workspace should register");

            assert_eq!(workspace.name, "Docs lab");
            assert_eq!(workspace.source_kind, WorkspaceSourceKind::External);
            assert_eq!(workspace.source_path, external.canonicalize().unwrap());
            assert_eq!(
                std::fs::read_to_string(external.join("input.txt")).unwrap(),
                "unchanged"
            );
            assert_eq!(std::fs::read_dir(&external).unwrap().count(), 1);

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[test]
    fn rejects_invalid_workspace_names_and_missing_sources() {
        tauri::async_runtime::block_on(async {
            let (service, database, root, external) = workspace_fixture().await;

            assert_eq!(
                service.register_external("   ".to_string(), external).await,
                Err(crate::error::AppError::InvalidWorkspace)
            );
            assert_eq!(
                service
                    .register_external("Missing".to_string(), root.join("missing"))
                    .await,
                Err(crate::error::AppError::InvalidWorkspace)
            );

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[test]
    fn creates_managed_workspace_inside_application_storage() {
        tauri::async_runtime::block_on(async {
            let (service, database, root, _) = workspace_fixture().await;

            let workspace = service
                .create_managed("Scratch pad".to_string())
                .await
                .expect("managed Workspace should be created");

            assert_eq!(workspace.source_kind, WorkspaceSourceKind::Managed);
            assert!(workspace.source_path.is_dir());
            assert!(workspace
                .source_path
                .starts_with(root.join("app-data/workspaces")));
            assert!(workspace.source_path.ends_with("files"));

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }
}
