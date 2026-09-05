use crate::domain::skill::{NewSkill, Skill, SkillSourceType};
use crate::error::AppError;
use crate::repositories::skill::SkillRepository;
use std::path::Path;
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
        self.store_directory(
            source_path.clone(),
            folder_name,
            display_name,
            description,
            SkillSourceType::LocalFolder,
            Some(source_path),
        )
        .await
    }

    /// Creates a minimal Skill manifest directly in managed storage.
    pub(crate) async fn create_platform_skill(
        &self,
        display_name: String,
        description: String,
        content: String,
    ) -> Result<Skill, AppError> {
        let display_name = display_name.trim();
        let description = description.trim();
        let content = content.trim();
        if !is_valid_display_name(display_name) {
            return Err(AppError::InvalidSkill);
        }
        let folder_name =
            folder_name_from_display_name(display_name).ok_or(AppError::InvalidSkill)?;
        if display_name.len() > 120 || description.is_empty() || content.is_empty() {
            return Err(AppError::InvalidSkill);
        }
        let staging_path = self.app_data_directory.join("skill-staging").join(format!(
            "platform-{}-{}",
            current_time_ms()?,
            SKILL_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        tokio::fs::create_dir_all(&staging_path)
            .await
            .map_err(|_| AppError::SkillFilesystemFailed)?;
        let manifest = format!(
            "---\nname: {}\ndescription: {}\n---\n\n{}\n",
            serde_json::to_string(display_name).map_err(|_| AppError::InvalidSkill)?,
            serde_json::to_string(description).map_err(|_| AppError::InvalidSkill)?,
            content
        );
        tokio::fs::write(staging_path.join("SKILL.md"), manifest)
            .await
            .map_err(|_| AppError::SkillFilesystemFailed)?;
        let result = self
            .store_directory(
                staging_path.clone(),
                folder_name,
                display_name.to_string(),
                description.to_string(),
                SkillSourceType::Platform,
                None,
            )
            .await;
        let _cleanup_result = tokio::fs::remove_dir_all(staging_path).await;
        result
    }

    /// Clones a Git repository and imports its root Skill or every Skill under `skills/`.
    pub(crate) async fn import_git_repository(
        &self,
        git_url: String,
    ) -> Result<Vec<Skill>, AppError> {
        let git_url = git_url.trim();
        if git_url.is_empty() || git_url.len() > 2048 {
            return Err(AppError::InvalidSkill);
        }
        let staging_path = self.app_data_directory.join("skill-staging").join(format!(
            "git-{}-{}",
            current_time_ms()?,
            SKILL_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let clone_target = staging_path.clone();
        let clone_url = git_url.to_string();
        let cloned = tokio::task::spawn_blocking(move || {
            std::process::Command::new("git")
                .args(["clone", "--depth", "1", "--", &clone_url])
                .arg(&clone_target)
                .status()
                .map(|status| status.success())
        })
        .await
        .map_err(|_| AppError::SkillFilesystemFailed)?
        .map_err(|_| AppError::SkillFilesystemFailed)?;
        if !cloned {
            let _cleanup_result = tokio::fs::remove_dir_all(staging_path).await;
            return Err(AppError::InvalidSkill);
        }
        let repository_name = git_url
            .trim_end_matches('/')
            .rsplit(['/', ':'])
            .next()
            .unwrap_or_default()
            .trim_end_matches(".git");
        let candidates = collect_git_skill_candidates(&staging_path, repository_name).await?;
        let mut imported = Vec::with_capacity(candidates.len());
        for (source_path, folder_name, display_name, description) in candidates {
            imported.push(
                self.store_directory(
                    source_path,
                    folder_name,
                    display_name,
                    description,
                    SkillSourceType::Git,
                    Some(PathBuf::from(git_url)),
                )
                .await?,
            );
        }
        let _cleanup_result = tokio::fs::remove_dir_all(staging_path).await;
        Ok(imported)
    }

    /// Refreshes a Git-backed Skill while preserving the previous copy on failure.
    pub(crate) async fn update_git_skill(&self, skill_id: &str) -> Result<Skill, AppError> {
        let skill = self
            .repository
            .list()
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)?
            .into_iter()
            .find(|skill| skill.id == skill_id && skill.source_type == SkillSourceType::Git)
            .ok_or(AppError::InvalidSkill)?;
        let git_url = skill
            .source_path
            .as_ref()
            .and_then(|path| path.to_str())
            .ok_or(AppError::InvalidSkill)?
            .to_string();
        let staging_path = self.app_data_directory.join("skill-staging").join(format!(
            "update-{}-{}",
            current_time_ms()?,
            SKILL_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let clone_target = staging_path.clone();
        let clone_url = git_url.clone();
        let cloned = tokio::task::spawn_blocking(move || {
            std::process::Command::new("git")
                .args(["clone", "--depth", "1", "--", &clone_url])
                .arg(&clone_target)
                .status()
                .map(|status| status.success())
        })
        .await
        .map_err(|_| AppError::SkillFilesystemFailed)?
        .map_err(|_| AppError::SkillFilesystemFailed)?;
        if !cloned {
            let _cleanup_result = tokio::fs::remove_dir_all(staging_path).await;
            return Err(AppError::InvalidSkill);
        }
        let repository_name = git_url
            .trim_end_matches('/')
            .rsplit(['/', ':'])
            .next()
            .unwrap_or_default()
            .trim_end_matches(".git");
        let (copy_source, folder_name, display_name, description) =
            collect_git_skill_candidates(&staging_path, repository_name)
                .await?
                .into_iter()
                .find(|candidate| candidate.1.eq_ignore_ascii_case(&skill.folder_name))
                .ok_or(AppError::InvalidSkill)?;
        let managed_path = self.app_data_directory.join(&skill.storage_relative_path);
        let replacement_path = managed_path.with_extension("replacement");
        let backup_path = managed_path.with_extension("backup");
        let copy_target = replacement_path.clone();
        tokio::task::spawn_blocking(move || copy_skill_directory(&copy_source, &copy_target))
            .await
            .map_err(|_| AppError::SkillFilesystemFailed)??;
        tokio::fs::rename(&managed_path, &backup_path)
            .await
            .map_err(|_| AppError::SkillFilesystemFailed)?;
        if tokio::fs::rename(&replacement_path, &managed_path)
            .await
            .is_err()
        {
            let _rollback_result = tokio::fs::rename(&backup_path, &managed_path).await;
            return Err(AppError::SkillFilesystemFailed);
        }
        let saved = self
            .repository
            .update_from_git(
                skill_id,
                folder_name,
                display_name,
                description,
                current_time_ms()?,
            )
            .await;
        let result = match saved {
            Ok(updated) => {
                let _cleanup_result = tokio::fs::remove_dir_all(backup_path).await;
                Ok(updated)
            }
            Err(_) => {
                let _cleanup_result = tokio::fs::remove_dir_all(&managed_path).await;
                let _rollback_result = tokio::fs::rename(backup_path, managed_path).await;
                Err(AppError::SkillDatabaseFailed)
            }
        };
        let _cleanup_result = tokio::fs::remove_dir_all(staging_path).await;
        result
    }

    async fn store_directory(
        &self,
        source_path: PathBuf,
        folder_name: String,
        display_name: String,
        description: String,
        source_type: SkillSourceType,
        original_source: Option<PathBuf>,
    ) -> Result<Skill, AppError> {
        let created_at_ms = current_time_ms()?;
        let id = format!(
            "skill-{created_at_ms}-{}",
            SKILL_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let storage_relative_path = PathBuf::from("skills").join(&id);
        let managed_path = self.app_data_directory.join(&storage_relative_path);
        let copy_target = managed_path.clone();
        tokio::task::spawn_blocking(move || copy_skill_directory(&source_path, &copy_target))
            .await
            .map_err(|_| AppError::SkillFilesystemFailed)??;
        let saved = self
            .repository
            .create(NewSkill {
                id,
                folder_name,
                display_name,
                description,
                source_type,
                storage_relative_path,
                source_path: original_source,
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

    /// Lists Skill Library entries.
    pub(crate) async fn list(&self) -> Result<Vec<Skill>, AppError> {
        self.repository
            .list()
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)
    }

    /// Removes one managed Skill and every Workspace mount without touching import sources.
    pub(crate) async fn remove(&self, skill_id: &str) -> Result<(), AppError> {
        if skill_id.is_empty()
            || skill_id.len() > 128
            || !skill_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        {
            return Err(AppError::InvalidSkill);
        }
        let Some(skill) = self
            .repository
            .find(skill_id)
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)?
        else {
            return Ok(());
        };
        let expected_relative_path = PathBuf::from("skills").join(skill_id);
        if skill.storage_relative_path != expected_relative_path {
            return Err(AppError::SkillFilesystemFailed);
        }
        let managed_path = self.app_data_directory.join(expected_relative_path);
        match tokio::fs::remove_dir_all(managed_path).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(AppError::SkillFilesystemFailed),
        }
        self.repository
            .delete(skill_id)
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)
    }

    /// Mounts a Library Skill for future Tasks from one Workspace.
    pub(crate) async fn mount_to_workspace(
        &self,
        workspace_id: &str,
        skill_id: &str,
    ) -> Result<Skill, AppError> {
        let skill = self
            .repository
            .list()
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)?
            .into_iter()
            .find(|skill| skill.id == skill_id)
            .ok_or(AppError::InvalidSkill)?;
        self.repository
            .mount(workspace_id, &skill, current_time_ms()?)
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)?;
        Ok(skill)
    }

    /// Removes one Workspace mount without modifying Workspace or Library files.
    pub(crate) async fn unmount_from_workspace(
        &self,
        workspace_id: &str,
        skill_id: &str,
    ) -> Result<(), AppError> {
        self.repository
            .unmount(workspace_id, skill_id)
            .await
            .map_err(|_| AppError::SkillDatabaseFailed)
    }

    /// Lists active Library Skills mounted to one Workspace.
    pub(crate) async fn list_for_workspace(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<Skill>, AppError> {
        self.repository
            .list_for_workspace(workspace_id)
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

/// Accepts English Skill names that remain portable when converted to a folder name.
fn is_valid_display_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .any(|character| character.is_ascii_alphabetic())
        && name.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || character == ' '
                || character == '-'
                || character == '_'
        })
}

/// Produces a portable project directory from a user-visible name.
fn folder_name_from_display_name(name: &str) -> Option<String> {
    let folder_name = name
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    is_valid_folder_name(&folder_name).then_some(folder_name)
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

/// Finds the root Skill first, otherwise the independently installable Skills under `skills/`.
async fn collect_git_skill_candidates(
    repository_path: &Path,
    repository_name: &str,
) -> Result<Vec<(PathBuf, String, String, String)>, AppError> {
    let root_manifest_path = repository_path.join("SKILL.md");
    if tokio::fs::symlink_metadata(&root_manifest_path)
        .await
        .is_ok_and(|metadata| metadata.is_file())
    {
        let manifest = tokio::fs::read_to_string(root_manifest_path)
            .await
            .map_err(|_| AppError::InvalidSkill)?;
        let (display_name, description) = parse_skill_metadata(&manifest)?;
        let folder_name =
            folder_name_from_display_name(repository_name).ok_or(AppError::InvalidSkill)?;
        return Ok(vec![(
            repository_path.to_path_buf(),
            folder_name,
            display_name,
            description,
        )]);
    }

    let mut directories = tokio::fs::read_dir(repository_path.join("skills"))
        .await
        .map_err(|_| AppError::InvalidSkill)?;
    let mut candidates = Vec::new();
    while let Some(entry) = directories
        .next_entry()
        .await
        .map_err(|_| AppError::SkillFilesystemFailed)?
    {
        if !entry
            .file_type()
            .await
            .map_err(|_| AppError::SkillFilesystemFailed)?
            .is_dir()
        {
            continue;
        }
        let manifest_path = entry.path().join("SKILL.md");
        if !tokio::fs::symlink_metadata(&manifest_path)
            .await
            .is_ok_and(|metadata| metadata.is_file())
        {
            continue;
        }
        let manifest = tokio::fs::read_to_string(manifest_path)
            .await
            .map_err(|_| AppError::InvalidSkill)?;
        let (display_name, description) = parse_skill_metadata(&manifest)?;
        let folder_name =
            folder_name_from_display_name(&display_name).ok_or(AppError::InvalidSkill)?;
        candidates.push((entry.path(), folder_name, display_name, description));
    }
    candidates.sort_by(|left, right| left.1.cmp(&right.1));
    if candidates.is_empty() {
        return Err(AppError::InvalidSkill);
    }
    Ok(candidates)
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
        if entry.file_name() == ".git" {
            continue;
        }
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
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::repositories::skill::SkillRepository;
    use crate::repositories::workspace::WorkspaceRepository;
    use sea_orm_migration::MigratorTrait;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RESOURCE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn removes_a_managed_skill_and_its_mounts_without_touching_the_import_source() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-remove-skill-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("source/repository-map");
            std::fs::create_dir_all(&source).expect("Skill source should be created");
            std::fs::write(
                source.join("SKILL.md"),
                "---\nname: Repository Map\ndescription: Maps repository structure.\n---\n",
            )
            .expect("Skill manifest should be written");
            let database_path = root.join("theoria.sqlite3");
            let database =
                connect_sqlite(&format!("sqlite://{}?mode=rwc", database_path.display()))
                    .await
                    .expect("database should connect");
            Migrator::up(&database, None)
                .await
                .expect("migration should run");
            WorkspaceRepository::new(database.clone())
                .create(NewWorkspace {
                    id: "workspace-1".to_string(),
                    name: "Docs".to_string(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: root.join("workspace-source"),
                    created_at_ms: 100,
                })
                .await
                .expect("Workspace should save");
            let repository = SkillRepository::new(database.clone());
            let service = SkillLibraryService::new(repository.clone(), root.join("app-data"));
            let skill = service
                .import_local_folder(source.clone())
                .await
                .expect("Skill should import");
            service
                .mount_to_workspace("workspace-1", &skill.id)
                .await
                .expect("Skill should mount");
            let managed_path = root.join("app-data").join(&skill.storage_relative_path);

            service
                .remove(&skill.id)
                .await
                .expect("Skill should be removed");

            assert!(source.join("SKILL.md").is_file());
            assert!(!managed_path.exists());
            assert!(service.list().await.expect("Skills should list").is_empty());
            assert!(repository
                .list_for_workspace("workspace-1")
                .await
                .expect("Workspace mounts should list")
                .is_empty());
            service
                .remove(&skill.id)
                .await
                .expect("repeated removal should remain successful");

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[test]
    fn creates_a_platform_skill_in_managed_storage() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-platform-skill-test-{}-{sequence}",
                std::process::id()
            ));
            std::fs::create_dir_all(&root).expect("fixture should be created");
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
                .create_platform_skill(
                    "Release Notes".to_string(),
                    "Creates release notes.".to_string(),
                    "Summarize the changes for users.".to_string(),
                )
                .await
                .expect("Skill should be created");
            let manifest = std::fs::read_to_string(
                root.join("app-data")
                    .join(skill.storage_relative_path.clone())
                    .join("SKILL.md"),
            )
            .expect("managed manifest should exist");

            assert_eq!(skill.source_type.as_str(), "platform");
            assert!(manifest.contains("name: \"Release Notes\""));
            assert!(manifest.contains("Summarize the changes for users."));

            let localized_result = service
                .create_platform_skill(
                    "发布-Notes".to_string(),
                    "为用户生成发布说明。".to_string(),
                    "总结变更并突出用户可见的改进。".to_string(),
                )
                .await;
            assert!(
                localized_result.is_err(),
                "Skill names must use English characters"
            );

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[test]
    fn imports_a_skill_from_a_git_repository() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-git-skill-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("git-source");
            std::fs::create_dir_all(&source).expect("fixture should be created");
            std::fs::write(
                source.join("SKILL.md"),
                "---\nname: Git Skill\ndescription: Imported from Git.\n---\n\nUse the repository.\n",
            )
            .expect("Skill manifest should be written");
            for arguments in [
                vec!["init"],
                vec!["add", "SKILL.md"],
                vec![
                    "-c",
                    "user.name=Theoria Tests",
                    "-c",
                    "user.email=tests@theoria.local",
                    "commit",
                    "-m",
                    "test skill",
                ],
            ] {
                assert!(std::process::Command::new("git")
                    .args(arguments)
                    .current_dir(&source)
                    .status()
                    .expect("git should run")
                    .success());
            }
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

            let imported = service
                .import_git_repository(source.to_string_lossy().to_string())
                .await
                .expect("Git Skill should import");
            let skill = imported
                .first()
                .expect("single-Skill repository should import one Skill");
            let managed = root
                .join("app-data")
                .join(skill.storage_relative_path.clone());

            assert_eq!(skill.source_type.as_str(), "git");
            assert!(managed.join("SKILL.md").is_file());
            assert!(!managed.join(".git").exists());

            std::fs::write(
                source.join("SKILL.md"),
                "---\nname: Updated Git Skill\ndescription: Updated from Git.\n---\n\nUse the latest repository.\n",
            )
            .expect("updated manifest should be written");
            for arguments in [
                vec!["add", "SKILL.md"],
                vec![
                    "-c",
                    "user.name=Theoria Tests",
                    "-c",
                    "user.email=tests@theoria.local",
                    "commit",
                    "-m",
                    "update skill",
                ],
            ] {
                assert!(std::process::Command::new("git")
                    .args(arguments)
                    .current_dir(&source)
                    .status()
                    .expect("git should run")
                    .success());
            }

            let updated = service
                .update_git_skill(&skill.id)
                .await
                .expect("Git Skill should update");

            assert_eq!(updated.display_name, "Updated Git Skill");
            assert!(std::fs::read_to_string(managed.join("SKILL.md"))
                .expect("managed manifest should remain readable")
                .contains("Use the latest repository."));

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[test]
    fn imports_every_skill_from_a_git_repository_skills_directory() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-git-skill-collection-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("git-source");
            for (folder_name, display_name) in
                [("design-taste", "Design Taste"), ("imagegen", "Imagegen")]
            {
                let skill_directory = source.join("skills").join(folder_name);
                std::fs::create_dir_all(&skill_directory).expect("fixture should be created");
                std::fs::write(
                    skill_directory.join("SKILL.md"),
                    format!(
                        "---\nname: {display_name}\ndescription: Imported from a collection.\n---\n"
                    ),
                )
                .expect("Skill manifest should be written");
            }
            for arguments in [
                vec!["init"],
                vec!["add", "skills"],
                vec![
                    "-c",
                    "user.name=Theoria Tests",
                    "-c",
                    "user.email=tests@theoria.local",
                    "commit",
                    "-m",
                    "test skill collection",
                ],
            ] {
                assert!(std::process::Command::new("git")
                    .args(arguments)
                    .current_dir(&source)
                    .status()
                    .expect("git should run")
                    .success());
            }
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

            service
                .import_git_repository(source.to_string_lossy().to_string())
                .await
                .expect("Git Skill collection should import");
            let imported = service.list().await.expect("Skills should list");

            assert_eq!(
                imported
                    .iter()
                    .map(|skill| skill.folder_name.as_str())
                    .collect::<Vec<_>>(),
                vec!["design-taste", "imagegen"]
            );
            for skill in &imported {
                let managed = root
                    .join("app-data")
                    .join(skill.storage_relative_path.clone());
                assert!(managed.join("SKILL.md").is_file());
                assert!(!managed.join("skills").exists());
            }

            std::fs::write(
                source.join("skills/design-taste/SKILL.md"),
                "---\nname: Design Taste\ndescription: Updated from a collection.\n---\n",
            )
            .expect("updated manifest should be written");
            for arguments in [
                vec!["add", "skills/design-taste/SKILL.md"],
                vec![
                    "-c",
                    "user.name=Theoria Tests",
                    "-c",
                    "user.email=tests@theoria.local",
                    "commit",
                    "-m",
                    "update collection skill",
                ],
            ] {
                assert!(std::process::Command::new("git")
                    .args(arguments)
                    .current_dir(&source)
                    .status()
                    .expect("git should run")
                    .success());
            }
            let design_skill = imported
                .iter()
                .find(|skill| skill.folder_name == "design-taste")
                .expect("Design Skill should be imported");

            let updated = service
                .update_git_skill(&design_skill.id)
                .await
                .expect("nested Git Skill should update");

            assert_eq!(updated.description, "Updated from a collection.");

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

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
