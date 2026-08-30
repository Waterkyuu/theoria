use crate::domain::workspace::{NewWorkspace, Workspace, WorkspaceSourceKind};
use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, DbErr, Statement};
use std::path::PathBuf;

/// SQLite persistence boundary for reusable Workspace inputs.
#[derive(Clone)]
pub(crate) struct WorkspaceRepository {
    /// Shared application database connection pool.
    database: DatabaseConnection,
}

impl WorkspaceRepository {
    /// Creates a repository over the migrated application database.
    pub(crate) fn new(database: DatabaseConnection) -> Self {
        Self { database }
    }

    /// Persists one Workspace and returns the stored representation.
    pub(crate) async fn create(&self, workspace: NewWorkspace) -> Result<Workspace, DbErr> {
        let source_path = workspace
            .source_path
            .to_str()
            .ok_or_else(|| DbErr::Custom("Workspace path is not valid UTF-8".to_string()))?;
        self.database
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO workspaces
                    (id, name, source_kind, source_path, created_at_ms, updated_at_ms)
                VALUES (?, ?, ?, ?, ?, ?)
                "#,
                [
                    workspace.id.clone().into(),
                    workspace.name.clone().into(),
                    workspace.source_kind.as_str().into(),
                    source_path.into(),
                    workspace.created_at_ms.into(),
                    workspace.created_at_ms.into(),
                ],
            ))
            .await?;

        Ok(Workspace {
            id: workspace.id,
            name: workspace.name,
            source_kind: workspace.source_kind,
            source_path: workspace.source_path,
            pinned_at_ms: None,
            created_at_ms: workspace.created_at_ms,
            updated_at_ms: workspace.created_at_ms,
        })
    }

    /// Lists Workspaces with pinned and recently updated inputs first.
    pub(crate) async fn list(&self) -> Result<Vec<Workspace>, DbErr> {
        self.database
            .query_all_raw(Statement::from_string(
                DatabaseBackend::Sqlite,
                r#"
                SELECT id, name, source_kind, source_path, pinned_at_ms, created_at_ms, updated_at_ms
                FROM workspaces
                ORDER BY pinned_at_ms IS NULL, pinned_at_ms DESC, updated_at_ms DESC, id
                "#
                .to_string(),
            ))
            .await?
            .into_iter()
            .map(|row| {
                let source_kind = row.try_get::<String>("", "source_kind")?;
                Ok(Workspace {
                    id: row.try_get("", "id")?,
                    name: row.try_get("", "name")?,
                    source_kind: WorkspaceSourceKind::parse(&source_kind).ok_or_else(|| {
                        DbErr::Custom("Workspace contains an invalid source kind".to_string())
                    })?,
                    source_path: PathBuf::from(row.try_get::<String>("", "source_path")?),
                    pinned_at_ms: row.try_get("", "pinned_at_ms")?,
                    created_at_ms: row.try_get("", "created_at_ms")?,
                    updated_at_ms: row.try_get("", "updated_at_ms")?,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::WorkspaceRepository;
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use sea_orm_migration::MigratorTrait;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    /// Creates a migrated repository and owned database file.
    async fn migrated_repository() -> (WorkspaceRepository, sea_orm::DatabaseConnection, PathBuf) {
        let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "theoria-workspace-repository-test-{}-{sequence}.sqlite3",
            std::process::id()
        ));
        let database = connect_sqlite(&format!("sqlite://{}?mode=rwc", path.display()))
            .await
            .expect("database should connect");
        Migrator::up(&database, None)
            .await
            .expect("migration should succeed");
        (WorkspaceRepository::new(database.clone()), database, path)
    }

    #[test]
    fn saves_and_lists_workspace_source_metadata() {
        tauri::async_runtime::block_on(async {
            let (repository, database, database_path) = migrated_repository().await;
            let source_path = std::env::temp_dir().join("theoria-external-fixture");

            let saved = repository
                .create(NewWorkspace {
                    id: "workspace-1".to_string(),
                    name: "Docs lab".to_string(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: source_path.clone(),
                    created_at_ms: 100,
                })
                .await
                .expect("workspace should save");
            let listed = repository.list().await.expect("workspaces should list");

            assert_eq!(saved.id, "workspace-1");
            assert_eq!(saved.source_path, source_path);
            assert_eq!(listed, vec![saved]);

            database.close().await.expect("database should close");
            std::fs::remove_file(database_path).expect("temporary database should be removable");
        });
    }
}
