use crate::domain::workspace::{NewWorkspace, Workspace, WorkspaceSourceKind};
use crate::models::workspace;
use sea_orm::sea_query::{Expr, ExprTrait};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, DatabaseConnection, DbErr, EntityTrait, QueryOrder,
};
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
        let model = workspace::ActiveModel {
            id: Set(workspace.id),
            name: Set(workspace.name),
            source_kind: Set(workspace.source_kind.as_str().to_string()),
            source_path: Set(source_path.to_string()),
            pinned_at_ms: Set(None),
            created_at_ms: Set(workspace.created_at_ms),
            updated_at_ms: Set(workspace.created_at_ms),
        }
        .insert(&self.database)
        .await?;

        workspace_from_model(model)
    }

    /// Lists Workspaces with pinned and recently updated inputs first.
    pub(crate) async fn list(&self) -> Result<Vec<Workspace>, DbErr> {
        workspace::Entity::find()
            .order_by_asc(Expr::col(workspace::Column::PinnedAtMs).is_null())
            .order_by_desc(workspace::Column::PinnedAtMs)
            .order_by_desc(workspace::Column::UpdatedAtMs)
            .order_by_asc(workspace::Column::Id)
            .all(&self.database)
            .await?
            .into_iter()
            .map(workspace_from_model)
            .collect()
    }

    /// Persists the optional pin time and returns the updated Workspace.
    pub(crate) async fn set_pin(
        &self,
        workspace_id: &str,
        pinned_at_ms: Option<i64>,
    ) -> Result<Workspace, DbErr> {
        let workspace = workspace::Entity::find_by_id(workspace_id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound("Workspace was not found".to_string()))?;
        let mut workspace: workspace::ActiveModel = workspace.into();
        workspace.pinned_at_ms = Set(pinned_at_ms);

        workspace_from_model(workspace.update(&self.database).await?)
    }

    /// Persists a validated name and recency timestamp for one Workspace.
    pub(crate) async fn rename(
        &self,
        workspace_id: &str,
        name: &str,
        updated_at_ms: i64,
    ) -> Result<Workspace, DbErr> {
        let workspace = workspace::Entity::find_by_id(workspace_id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound("Workspace was not found".to_string()))?;
        let mut workspace: workspace::ActiveModel = workspace.into();
        workspace.name = Set(name.to_string());
        workspace.updated_at_ms = Set(updated_at_ms);

        workspace_from_model(workspace.update(&self.database).await?)
    }

    /// Deletes one Workspace only after its Tasks and managed files have been cleaned.
    pub(crate) async fn delete(&self, workspace_id: &str) -> Result<(), DbErr> {
        workspace::Entity::delete_by_id(workspace_id)
            .exec(&self.database)
            .await?;
        Ok(())
    }
}

/// Converts a persisted row into the domain representation used by services.
fn workspace_from_model(model: workspace::Model) -> Result<Workspace, DbErr> {
    let source_kind = WorkspaceSourceKind::parse(&model.source_kind)
        .ok_or_else(|| DbErr::Custom("Workspace contains an invalid source kind".to_string()))?;
    Ok(Workspace {
        id: model.id,
        name: model.name,
        source_kind,
        source_path: PathBuf::from(model.source_path),
        pinned_at_ms: model.pinned_at_ms,
        created_at_ms: model.created_at_ms,
        updated_at_ms: model.updated_at_ms,
    })
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
            let renamed = repository
                .rename("workspace-1", "Research", 200)
                .await
                .expect("workspace should rename");

            assert_eq!(saved.id, "workspace-1");
            assert_eq!(saved.source_path, source_path);
            assert_eq!(listed, vec![saved]);
            assert_eq!(renamed.name, "Research");
            assert_eq!(renamed.updated_at_ms, 200);

            database.close().await.expect("database should close");
            std::fs::remove_file(database_path).expect("temporary database should be removable");
        });
    }

    #[test]
    fn pins_and_unpins_workspace_in_sidebar_order() {
        tauri::async_runtime::block_on(async {
            let (repository, database, database_path) = migrated_repository().await;
            let source_root = std::env::temp_dir().join("theoria-pin-order-fixture");
            let first = repository
                .create(NewWorkspace {
                    id: "workspace-1".to_string(),
                    name: "First".to_string(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: source_root.join("first"),
                    created_at_ms: 100,
                })
                .await
                .expect("first workspace should save");
            let second = repository
                .create(NewWorkspace {
                    id: "workspace-2".to_string(),
                    name: "Second".to_string(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: source_root.join("second"),
                    created_at_ms: 200,
                })
                .await
                .expect("second workspace should save");

            let pinned = repository
                .set_pin(&first.id, Some(300))
                .await
                .expect("workspace should pin");

            assert_eq!(pinned.pinned_at_ms, Some(300));
            assert_eq!(
                repository.list().await.unwrap(),
                vec![pinned.clone(), second]
            );

            let unpinned = repository
                .set_pin(&first.id, None)
                .await
                .expect("workspace should unpin");

            assert_eq!(unpinned.pinned_at_ms, None);

            database.close().await.expect("database should close");
            std::fs::remove_file(database_path).expect("temporary database should be removable");
        });
    }
}
