use crate::domain::skill::{NewSkill, Skill, SkillSourceType};
use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, DbErr, Statement};
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
        self.database
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                r#"
                INSERT INTO skills
                    (id, folder_name, display_name, description, source_type,
                     storage_relative_path, source_path, created_at_ms, updated_at_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
                [
                    skill.id.clone().into(),
                    skill.folder_name.clone().into(),
                    skill.display_name.clone().into(),
                    skill.description.clone().into(),
                    skill.source_type.as_str().into(),
                    storage_path.into(),
                    source_path.into(),
                    skill.created_at_ms.into(),
                    skill.created_at_ms.into(),
                ],
            ))
            .await?;

        Ok(Skill {
            id: skill.id,
            folder_name: skill.folder_name,
            display_name: skill.display_name,
            description: skill.description,
            source_type: skill.source_type,
            storage_relative_path: skill.storage_relative_path,
            source_path: skill.source_path,
            created_at_ms: skill.created_at_ms,
            updated_at_ms: skill.created_at_ms,
        })
    }

    /// Lists active managed Skills by user-visible name.
    pub(crate) async fn list(&self) -> Result<Vec<Skill>, DbErr> {
        self.database
            .query_all_raw(Statement::from_string(
                DatabaseBackend::Sqlite,
                r#"
                SELECT id, folder_name, display_name, description, source_type,
                       storage_relative_path, source_path, created_at_ms, updated_at_ms
                FROM skills
                WHERE deleted_at_ms IS NULL
                ORDER BY display_name COLLATE NOCASE, id
                "#
                .to_string(),
            ))
            .await?
            .into_iter()
            .map(|row| {
                let source_type = row.try_get::<String>("", "source_type")?;
                Ok(Skill {
                    id: row.try_get("", "id")?,
                    folder_name: row.try_get("", "folder_name")?,
                    display_name: row.try_get("", "display_name")?,
                    description: row.try_get("", "description")?,
                    source_type: SkillSourceType::parse(&source_type).ok_or_else(|| {
                        DbErr::Custom("Skill contains an invalid source type".to_string())
                    })?,
                    storage_relative_path: PathBuf::from(
                        row.try_get::<String>("", "storage_relative_path")?,
                    ),
                    source_path: row
                        .try_get::<Option<String>>("", "source_path")?
                        .map(PathBuf::from),
                    created_at_ms: row.try_get("", "created_at_ms")?,
                    updated_at_ms: row.try_get("", "updated_at_ms")?,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::SkillRepository;
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::domain::skill::{NewSkill, SkillSourceType};
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
}
