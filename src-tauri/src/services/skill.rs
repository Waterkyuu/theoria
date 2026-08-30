use crate::domain::skill::{NewSkill, Skill, SkillSourceType};
use crate::error::AppError;
use crate::repositories::skill::SkillRepository;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static SKILL_ID_SEQUENCE: AtomicU64 = AtomicU64::new(1);

/// Coordinates copied Skill Library storage and metadata persistence.
#[derive(Clone)]
pub(crate) struct SkillLibraryService {
    /// Persisted Skill metadata boundary.
    repository: SkillRepository,
    /// Root directory that owns copied Skill contents.
    app_data_directory: PathBuf,
}

impl SkillLibraryService {
    /// Creates a Skill Library rooted in application-owned storage.
    pub(crate) fn new(repository: SkillRepository, app_data_directory: PathBuf) -> Self {
        Self {
            repository,
            app_data_directory,
        }
    }

    /// Copies one valid local Skill directory into managed storage.
    pub(crate) async fn import_local_folder(
        &self,
        source_path: PathBuf,
    ) -> Result<Skill, AppError> {
        let source_path = tokio::fs::canonicalize(source_path)
            .await
            .map_err(|_| AppError::InvalidSkill)?;
        if !tokio::fs::metadata(&source_path)
            .await
            .map_err(|_| AppError::InvalidSkill)?
            .is_dir()
        {
            return Err(AppError::InvalidSkill);
        }
        let folder_name = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| is_valid_folder_name(name))
            .ok_or(AppError::InvalidSkill)?
            .to_string();
        let manifest = tokio::fs::read_to_string(source_path.join("SKILL.md"))
            .await
            .map_err(|_| AppError::InvalidSkill)?;
        let (display_name, description) = parse_skill_metadata(&manifest)?;
        let created_at_ms = current_time_ms()?;
        let id = format!(
            "skill-{created_at_ms}-{}",
            SKILL_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let storage_relative_path = PathBuf::from("skills").join(&id);
        let managed_path = self.app_data_directory.join(&storage_relative_path);
        let copy_source = source_path.clone();
        let copy_target = managed_path.clone();
        tokio::task::spawn_blocking(move || copy_skill_directory(&copy_source, &copy_target))
            .await
            .map_err(|_| AppError::SkillFilesystemFailed)??;

        let saved = self
            .repository
            .create(NewSkill {
                id,
                folder_name,
                display_name,
                description,
                source_type: SkillSourceType::LocalFolder,
                storage_relative_path,
                source_path: Some(source_path),
                created_at_ms,
            })
            .await;
        match saved {
            Ok(skill) => Ok(skill),
            Err(_) => {
                tokio::fs::remove_dir_all(managed_path)
                    .await
                    .map_err(|_| AppError::SkillFilesystemFailed)?;
                Err(AppError::SkillDatabaseFailed)
            }
        }
    }

    /// Lists active Skill Library entries.
    pub(crate) async fn list(&self) -> Result<Vec<Skill>, AppError> {
        self.repository
            .list()
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)
    }
}

/// Accepts portable project Skill directory names only.
fn is_valid_folder_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

/// Reads the required name and description from Skill frontmatter.
fn parse_skill_metadata(manifest: &str) -> Result<(String, String), AppError> {
    let name = manifest
        .lines()
        .find_map(|line| line.strip_prefix("name:"))
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 120);
    let description = manifest
        .lines()
        .find_map(|line| line.strip_prefix("description:"))
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match (name, description) {
        (Some(name), Some(description)) => Ok((name.to_string(), description.to_string())),
        _ => Err(AppError::InvalidSkill),
    }
}

/// Recursively copies regular Skill files while rejecting links that can escape the source.
fn copy_skill_directory(
    source: &std::path::Path,
    target: &std::path::Path,
) -> Result<(), AppError> {
    std::fs::create_dir_all(target).map_err(|_| AppError::SkillFilesystemFailed)?;
    for entry in std::fs::read_dir(source).map_err(|_| AppError::SkillFilesystemFailed)? {
        let entry = entry.map_err(|_| AppError::SkillFilesystemFailed)?;
        let file_type = entry
            .file_type()
            .map_err(|_| AppError::SkillFilesystemFailed)?;
        let destination = target.join(entry.file_name());
        if file_type.is_symlink() {
            return Err(AppError::InvalidSkill);
        }
        if file_type.is_dir() {
            copy_skill_directory(&entry.path(), &destination)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), destination)
                .map_err(|_| AppError::SkillFilesystemFailed)?;
        }
    }
    Ok(())
}

/// Returns a positive Unix millisecond timestamp for Skill ordering and identifiers.
fn current_time_ms() -> Result<i64, AppError> {
    let milliseconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::SkillFilesystemFailed)?
        .as_millis();
    i64::try_from(milliseconds).map_err(|_| AppError::SkillFilesystemFailed)
}

#[cfg(test)]
mod tests {
    use super::SkillLibraryService;
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::repositories::skill::SkillRepository;
    use sea_orm_migration::MigratorTrait;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RESOURCE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn imports_an_independent_copy_of_the_complete_skill_folder() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-skill-service-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("source/repository-map");
            std::fs::create_dir_all(source.join("references"))
                .expect("Skill fixture should be created");
            std::fs::write(
                source.join("SKILL.md"),
                "---\nname: Repository Map\ndescription: Maps repository structure.\n---\n",
            )
            .expect("Skill manifest should be written");
            std::fs::write(source.join("references/guide.md"), "original")
                .expect("Skill reference should be written");
            let database_path = root.join("theoria.sqlite3");
            let database =
                connect_sqlite(&format!("sqlite://{}?mode=rwc", database_path.display()))
                    .await
                    .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            let service = SkillLibraryService::new(
                SkillRepository::new(database.clone()),
                root.join("app-data"),
            );

            let skill = service
                .import_local_folder(source.clone())
                .await
                .expect("Skill should import");
            std::fs::write(source.join("references/guide.md"), "changed")
                .expect("source should remain user-editable");
            let managed = root.join("app-data").join(skill.storage_relative_path);

            assert_eq!(skill.folder_name, "repository-map");
            assert_eq!(skill.display_name, "Repository Map");
            assert_eq!(
                std::fs::read_to_string(managed.join("references/guide.md")).unwrap(),
                "original"
            );

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }
}
