use crate::domain::skill::{NewSkill, Skill, SkillSourceType};
use crate::models::skill::{self as skill, workspace_skill_mount};
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, DbErr, EntityTrait,
    QueryFilter, QueryOrder,
};
use std::path::PathBuf;

/// SQLite persistence boundary for managed Skills and Workspace mounts.
#[derive(Clone)]
pub(crate) struct SkillRepository {
    /// Shared application database connection pool.
    database: DatabaseConnection,
}

impl SkillRepository {
    /// Creates a repository over migrated application storage.
    pub(crate) fn new(database: DatabaseConnection) -> Self {
        Self { database }
    }

    /// Persists one copied Skill Library entry.
    pub(crate) async fn create(&self, skill: NewSkill) -> Result<Skill, DbErr> {
        let storage_path = skill
            .storage_relative_path
            .to_str()
            .ok_or_else(|| DbErr::Custom("Skill storage path is not valid UTF-8".to_string()))?;
        let source_path = skill
            .source_path
            .as_ref()
            .map(|path| {
                path.to_str().map(str::to_string).ok_or_else(|| {
                    DbErr::Custom("Skill source path is not valid UTF-8".to_string())
                })
            })
            .transpose()?;
        let model = skill::ActiveModel {
            id: Set(skill.id),
            folder_name: Set(skill.folder_name),
            display_name: Set(skill.display_name),
            description: Set(skill.description),
            source_type: Set(skill.source_type.as_str().to_string()),
            storage_relative_path: Set(storage_path.to_string()),
            source_path: Set(source_path),
            deleted_at_ms: Set(None),
            created_at_ms: Set(skill.created_at_ms),
            updated_at_ms: Set(skill.created_at_ms),
        }
        .insert(&self.database)
        .await?;

        skill_from_model(model, None)
    }

    /// Lists active managed Skills by user-visible name.
    pub(crate) async fn list(&self) -> Result<Vec<Skill>, DbErr> {
        skill::Entity::find()
            .filter(skill::Column::DeletedAtMs.is_null())
            .order_by_asc(Expr::cust("display_name COLLATE NOCASE"))
            .order_by_asc(skill::Column::Id)
            .all(&self.database)
            .await?
            .into_iter()
            .map(|model| skill_from_model(model, None))
            .collect()
    }

    /// Updates metadata after a Git-backed Skill refresh succeeds.
    pub(crate) async fn update_from_git(
        &self,
        id: &str,
        folder_name: String,
        display_name: String,
        description: String,
        updated_at_ms: i64,
    ) -> Result<Skill, DbErr> {
        let model = skill::Entity::find_by_id(id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound(id.to_string()))?;
        let mut active: skill::ActiveModel = model.into();
        active.folder_name = Set(folder_name);
        active.display_name = Set(display_name);
        active.description = Set(description);
        active.updated_at_ms = Set(updated_at_ms);
        skill_from_model(active.update(&self.database).await?, None)
    }

    /// Mounts a managed Skill to affect future Tasks from one Workspace.
    pub(crate) async fn mount(
        &self,
        workspace_id: &str,
        skill: &Skill,
        created_at_ms: i64,
    ) -> Result<(), DbErr> {
        workspace_skill_mount::Entity::insert(workspace_skill_mount::ActiveModel {
            workspace_id: Set(workspace_id.to_string()),
            skill_id: Set(skill.id.clone()),
            folder_name_snapshot: Set(skill.folder_name.clone()),
            created_at_ms: Set(created_at_ms),
        })
        .on_conflict(
            OnConflict::columns([
                workspace_skill_mount::Column::WorkspaceId,
                workspace_skill_mount::Column::SkillId,
            ])
            .do_nothing()
            .to_owned(),
        )
        .exec_without_returning(&self.database)
        .await?;
        Ok(())
    }

    /// Removes one future-Task Skill mount without changing either source directory.
    pub(crate) async fn unmount(&self, workspace_id: &str, skill_id: &str) -> Result<(), DbErr> {
        workspace_skill_mount::Entity::delete_many()
            .filter(workspace_skill_mount::Column::WorkspaceId.eq(workspace_id))
            .filter(workspace_skill_mount::Column::SkillId.eq(skill_id))
            .exec(&self.database)
            .await?;
        Ok(())
    }

    /// Lists active Skills mounted for future Tasks from one Workspace.
    pub(crate) async fn list_for_workspace(&self, workspace_id: &str) -> Result<Vec<Skill>, DbErr> {
        workspace_skill_mount::Entity::find()
            .find_both_related(skill::Entity)
            .filter(workspace_skill_mount::Column::WorkspaceId.eq(workspace_id))
            .filter(skill::Column::DeletedAtMs.is_null())
            .order_by_asc(Expr::cust("skills.display_name COLLATE NOCASE"))
            .order_by_asc(skill::Column::Id)
            .all(&self.database)
            .await?
            .into_iter()
            .map(|(mount, model)| skill_from_model(model, Some(mount.folder_name_snapshot)))
            .collect()
    }
}

/// Converts a persisted Skill row into the domain representation used by services.
fn skill_from_model(model: skill::Model, folder_name: Option<String>) -> Result<Skill, DbErr> {
    let source_type = SkillSourceType::parse(&model.source_type)
        .ok_or_else(|| DbErr::Custom("Skill contains an invalid source type".to_string()))?;
    Ok(Skill {
        id: model.id,
        folder_name: folder_name.unwrap_or(model.folder_name),
        display_name: model.display_name,
        description: model.description,
        source_type,
        storage_relative_path: PathBuf::from(model.storage_relative_path),
        source_path: model.source_path.map(PathBuf::from),
        created_at_ms: model.created_at_ms,
        updated_at_ms: model.updated_at_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::SkillRepository;
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::domain::skill::{NewSkill, SkillSourceType};
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::repositories::workspace::WorkspaceRepository;
    use sea_orm_migration::MigratorTrait;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn saves_managed_skill_metadata() {
        tauri::async_runtime::block_on(async {
            let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "theoria-skill-repository-test-{}-{sequence}.sqlite3",
                std::process::id()
            ));
            let database = connect_sqlite(&format!("sqlite://{}?mode=rwc", path.display()))
                .await
                .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            let repository = SkillRepository::new(database.clone());

            let saved = repository
                .create(NewSkill {
                    id: "skill-1".to_string(),
                    folder_name: "repository-map".to_string(),
                    display_name: "Repository map".to_string(),
                    description: "Maps a repository".to_string(),
                    source_type: SkillSourceType::LocalFolder,
                    storage_relative_path: PathBuf::from("skills/skill-1"),
                    source_path: Some(PathBuf::from("/tmp/repository-map")),
                    created_at_ms: 100,
                })
                .await
                .expect("Skill should save");

            assert_eq!(saved.folder_name, "repository-map");
            assert_eq!(saved.storage_relative_path, PathBuf::from("skills/skill-1"));
            assert_eq!(repository.list().await.unwrap(), vec![saved]);

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("database should be removable");
        });
    }

    #[test]
    fn mounts_and_unmounts_a_skill_by_workspace() {
        tauri::async_runtime::block_on(async {
            let sequence = DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "theoria-skill-mount-test-{}-{sequence}.sqlite3",
                std::process::id()
            ));
            let database = connect_sqlite(&format!("sqlite://{}?mode=rwc", path.display()))
                .await
                .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            WorkspaceRepository::new(database.clone())
                .create(NewWorkspace {
                    id: "workspace-1".to_string(),
                    name: "Docs lab".to_string(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: PathBuf::from("/tmp/docs-lab"),
                    created_at_ms: 100,
                })
                .await
                .expect("Workspace should save");
            let repository = SkillRepository::new(database.clone());
            let skill = repository
                .create(NewSkill {
                    id: "skill-1".to_string(),
                    folder_name: "repository-map".to_string(),
                    display_name: "Repository map".to_string(),
                    description: "Maps a repository".to_string(),
                    source_type: SkillSourceType::LocalFolder,
                    storage_relative_path: PathBuf::from("skills/skill-1"),
                    source_path: None,
                    created_at_ms: 100,
                })
                .await
                .expect("Skill should save");

            repository
                .mount("workspace-1", &skill, 200)
                .await
                .expect("Skill should mount");
            assert_eq!(
                repository
                    .list_for_workspace("workspace-1")
                    .await
                    .expect("mounts should list"),
                vec![skill]
            );

            repository
                .unmount("workspace-1", "skill-1")
                .await
                .expect("Skill should unmount");
            assert!(repository
                .list_for_workspace("workspace-1")
                .await
                .expect("mounts should list")
                .is_empty());

            database.close().await.expect("database should close");
            std::fs::remove_file(path).expect("database should be removable");
        });
    }
}
