use crate::domain::agent_kind::AgentKind;
use crate::domain::task::TaskSkill;
use crate::error::AppError;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Managed Skill copied into a new Task Baseline when no source folder wins.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SnapshotSkillInput {
    /// Destination folder under `.agents/skills`.
    pub(crate) folder_name: String,
    /// Managed Library directory containing the complete Skill.
    pub(crate) source_path: PathBuf,
    /// Persisted origin identifier.
    pub(crate) origin: String,
    /// Managed Library identifier.
    pub(crate) library_skill_id: String,
}

/// Agent Execution directory requested from one frozen Baseline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SnapshotAgentInput {
    /// Stable Task Agent identifier.
    pub(crate) id: String,
    /// Agent product used to prepare product-specific compatibility files.
    pub(crate) agent_kind: AgentKind,
}

/// Prepared isolated workspace returned for persistence and Agent launch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PreparedExecution {
    /// Stable Task Agent identifier.
    pub(crate) task_agent_id: String,
    /// Workspace path relative to application data.
    pub(crate) relative_path: String,
}

/// Complete filesystem snapshot ready to persist as a locked Task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PreparedTaskFiles {
    /// Frozen Baseline path relative to application data.
    pub(crate) baseline_relative_path: String,
    /// Independent Agent workspace paths.
    pub(crate) executions: Vec<PreparedExecution>,
    /// Effective project Skills after source-first merging.
    pub(crate) skills: Vec<TaskSkill>,
}

/// Creates immutable Task Baselines and writable isolated Agent copies.
#[derive(Debug, Clone)]
pub(crate) struct SnapshotService {
    /// Root directory owning all Task execution data.
    app_data_directory: PathBuf,
}

impl SnapshotService {
    /// Creates a snapshot service rooted in application-owned storage.
    pub(crate) fn new(app_data_directory: PathBuf) -> Self {
        Self { app_data_directory }
    }

    /// Freezes one input and creates one independent workspace per Agent.
    pub(crate) async fn prepare(
        &self,
        task_id: &str,
        workspace_source: Option<&Path>,
        skills: Vec<SnapshotSkillInput>,
        agents: &[SnapshotAgentInput],
    ) -> Result<PreparedTaskFiles, AppError> {
        let app_data_directory = self.app_data_directory.clone();
        let task_id = task_id.to_string();
        let workspace_source = workspace_source.map(Path::to_path_buf);
        let agents = agents.to_vec();
        tokio::task::spawn_blocking(move || {
            prepare_task_files(
                &app_data_directory,
                &task_id,
                workspace_source.as_deref(),
                skills,
                &agents,
            )
        })
        .await
        .map_err(|_| AppError::TaskPreparationFailed)?
    }

    /// Removes one complete Task tree after unlocking its frozen Baseline.
    pub(crate) async fn remove_task_files(&self, task_id: &str) -> Result<(), AppError> {
        if !is_portable_segment(task_id) {
            return Err(AppError::TaskPreparationFailed);
        }
        let task_root = self.app_data_directory.join("task-runs").join(task_id);
        tokio::task::spawn_blocking(move || {
            if !task_root.exists() {
                return Ok(());
            }
            make_tree_writable(&task_root)?;
            fs::remove_dir_all(task_root).map_err(|_| AppError::TaskPreparationFailed)
        })
        .await
        .map_err(|_| AppError::TaskPreparationFailed)?
    }
}

/// Performs the filesystem transaction off the async runtime.
fn prepare_task_files(
    app_data_directory: &Path,
    task_id: &str,
    workspace_source: Option<&Path>,
    skills: Vec<SnapshotSkillInput>,
    agents: &[SnapshotAgentInput],
) -> Result<PreparedTaskFiles, AppError> {
    if !is_portable_segment(task_id) || agents.is_empty() || agents.len() > 6 {
        return Err(AppError::TaskPreparationFailed);
    }
    let task_relative = PathBuf::from("task-runs").join(task_id);
    let task_root = app_data_directory.join(&task_relative);
    if task_root.exists() {
        return Err(AppError::TaskPreparationFailed);
    }
    fs::create_dir_all(&task_root).map_err(|_| AppError::TaskPreparationFailed)?;
    let prepared = prepare_task_tree(
        app_data_directory,
        &task_relative,
        &task_root,
        workspace_source,
        skills,
        agents,
    );
    if prepared.is_err() {
        drop(fs::remove_dir_all(&task_root));
    }
    prepared
}

/// Builds the Baseline, merges Skills, then creates independent writable copies.
fn prepare_task_tree(
    app_data_directory: &Path,
    task_relative: &Path,
    task_root: &Path,
    workspace_source: Option<&Path>,
    skills: Vec<SnapshotSkillInput>,
    agents: &[SnapshotAgentInput],
) -> Result<PreparedTaskFiles, AppError> {
    let baseline_relative_path = task_relative.join("baseline");
    let baseline = app_data_directory.join(&baseline_relative_path);
    match workspace_source {
        Some(source) => copy_isolated_tree(source, &baseline)?,
        None => fs::create_dir_all(&baseline).map_err(|_| AppError::TaskPreparationFailed)?,
    }
    sanitize_git_metadata(&baseline)?;
    let task_skills = merge_skills(
        app_data_directory,
        &baseline_relative_path,
        &baseline,
        skills,
    )?;
    let mut executions = Vec::with_capacity(agents.len());
    for agent in agents {
        if !is_portable_segment(&agent.id) {
            return Err(AppError::TaskPreparationFailed);
        }
        let relative_path = task_relative
            .join("executions")
            .join(&agent.id)
            .join("workspace");
        let workspace = app_data_directory.join(&relative_path);
        copy_isolated_tree(&baseline, &workspace)?;
        make_tree_writable(&workspace)?;
        if agent.agent_kind == AgentKind::Claude {
            prepare_claude_skills(&workspace)?;
        }
        executions.push(PreparedExecution {
            task_agent_id: agent.id.clone(),
            relative_path: path_to_string(&relative_path)?,
        });
    }
    fs::create_dir_all(task_root.join("results")).map_err(|_| AppError::TaskPreparationFailed)?;
    make_tree_read_only(&baseline)?;

    Ok(PreparedTaskFiles {
        baseline_relative_path: path_to_string(&baseline_relative_path)?,
        executions,
        skills: task_skills,
    })
}

/// Copies a directory without hard links and materializes only links contained by its source root.
fn copy_isolated_tree(source: &Path, target: &Path) -> Result<(), AppError> {
    let source_root = fs::canonicalize(source).map_err(|_| AppError::TaskPreparationFailed)?;
    if !source_root.is_dir() {
        return Err(AppError::TaskPreparationFailed);
    }
    let mut active_directories = HashSet::new();
    copy_directory_entries(&source_root, target, &source_root, &mut active_directories)
}

/// Recursively copies regular content while preventing escaping or cyclic links.
fn copy_directory_entries(
    source: &Path,
    target: &Path,
    source_root: &Path,
    active_directories: &mut HashSet<PathBuf>,
) -> Result<(), AppError> {
    let canonical_source = fs::canonicalize(source).map_err(|_| AppError::TaskPreparationFailed)?;
    if !canonical_source.starts_with(source_root)
        || !active_directories.insert(canonical_source.clone())
    {
        return Err(AppError::TaskPreparationFailed);
    }
    fs::create_dir_all(target).map_err(|_| AppError::TaskPreparationFailed)?;
    for entry in fs::read_dir(&canonical_source).map_err(|_| AppError::TaskPreparationFailed)? {
        let entry = entry.map_err(|_| AppError::TaskPreparationFailed)?;
        let source_path = entry.path();
        let destination = target.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|_| AppError::TaskPreparationFailed)?;
        if file_type.is_symlink() {
            let linked = fs::canonicalize(&source_path)
                .map_err(|_| AppError::UnsafeWorkspaceLink(source_path.clone()))?;
            if !linked.starts_with(source_root) {
                return Err(AppError::UnsafeWorkspaceLink(source_path));
            }
            if linked.is_dir() {
                copy_directory_entries(&linked, &destination, source_root, active_directories)?;
            } else if linked.is_file() {
                fs::copy(linked, destination).map_err(|_| AppError::TaskPreparationFailed)?;
            } else {
                return Err(AppError::TaskPreparationFailed);
            }
        } else if file_type.is_dir() {
            copy_directory_entries(&source_path, &destination, source_root, active_directories)?;
        } else if file_type.is_file() {
            fs::copy(source_path, destination).map_err(|_| AppError::TaskPreparationFailed)?;
        }
    }
    active_directories.remove(&canonical_source);
    Ok(())
}

/// Captures source Skills, then copies only non-conflicting managed Skills.
fn merge_skills(
    app_data_directory: &Path,
    baseline_relative_path: &Path,
    baseline: &Path,
    skills: Vec<SnapshotSkillInput>,
) -> Result<Vec<TaskSkill>, AppError> {
    let skills_directory = baseline.join(".agents/skills");
    let mut effective = HashMap::new();
    if skills_directory.is_dir() {
        for entry in fs::read_dir(&skills_directory).map_err(|_| AppError::TaskPreparationFailed)? {
            let entry = entry.map_err(|_| AppError::TaskPreparationFailed)?;
            let folder_name = entry
                .file_name()
                .to_str()
                .filter(|name| is_portable_segment(name))
                .ok_or(AppError::TaskPreparationFailed)?
                .to_string();
            if entry.path().is_dir() && entry.path().join("SKILL.md").is_file() {
                effective.insert(
                    folder_name.to_ascii_lowercase(),
                    TaskSkill {
                        folder_name: folder_name.clone(),
                        origin: "workspace_source".to_string(),
                        library_skill_id: None,
                        relative_path: skill_relative_path(baseline_relative_path, &folder_name)?,
                    },
                );
            }
        }
    }
    for skill in skills {
        if !is_portable_segment(&skill.folder_name) {
            return Err(AppError::TaskPreparationFailed);
        }
        let key = skill.folder_name.to_ascii_lowercase();
        if effective.contains_key(&key) {
            continue;
        }
        let destination = skills_directory.join(&skill.folder_name);
        copy_isolated_tree(&skill.source_path, &destination)?;
        effective.insert(
            key,
            TaskSkill {
                folder_name: skill.folder_name.clone(),
                origin: skill.origin,
                library_skill_id: Some(skill.library_skill_id),
                relative_path: skill_relative_path(baseline_relative_path, &skill.folder_name)?,
            },
        );
    }
    let mut effective = effective.into_values().collect::<Vec<_>>();
    effective.sort_by_key(|skill| skill.folder_name.to_ascii_lowercase());
    for skill in &effective {
        if !app_data_directory.join(&skill.relative_path).is_dir() {
            return Err(AppError::TaskPreparationFailed);
        }
    }
    Ok(effective)
}

/// Returns one project Skill path relative to application data.
fn skill_relative_path(
    baseline_relative_path: &Path,
    folder_name: &str,
) -> Result<String, AppError> {
    path_to_string(
        &baseline_relative_path
            .join(".agents/skills")
            .join(folder_name),
    )
}

/// Prevents copied Git metadata from retaining writable links to a source repository.
fn sanitize_git_metadata(root: &Path) -> Result<(), AppError> {
    for entry in fs::read_dir(root).map_err(|_| AppError::TaskPreparationFailed)? {
        let entry = entry.map_err(|_| AppError::TaskPreparationFailed)?;
        if entry.file_name() == ".git" {
            let metadata =
                fs::symlink_metadata(entry.path()).map_err(|_| AppError::TaskPreparationFailed)?;
            if metadata.is_file() {
                fs::remove_file(entry.path()).map_err(|_| AppError::TaskPreparationFailed)?;
                run_git(entry.path().parent(), &["init", "--quiet"])?;
            } else if metadata.is_dir() {
                remove_git_remotes(root)?;
            }
        } else if entry.path().is_dir() {
            sanitize_git_metadata(&entry.path())?;
        }
    }
    Ok(())
}

/// Removes every copied remote so an Execution cannot push into the source repository.
fn remove_git_remotes(repository: &Path) -> Result<(), AppError> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["remote"])
        .output()
        .map_err(|_| AppError::TaskPreparationFailed)?;
    if !output.status.success() {
        return Err(AppError::TaskPreparationFailed);
    }
    let remotes = String::from_utf8(output.stdout).map_err(|_| AppError::TaskPreparationFailed)?;
    for remote in remotes.lines().filter(|remote| !remote.is_empty()) {
        run_git(Some(repository), &["remote", "remove", remote])?;
    }
    Ok(())
}

/// Runs one bounded Git metadata command without inheriting a project cwd.
fn run_git(repository: Option<&Path>, arguments: &[&str]) -> Result<(), AppError> {
    let mut command = Command::new("git");
    if let Some(repository) = repository {
        command.args(["-C"]).arg(repository);
    }
    let status = command
        .args(arguments)
        .status()
        .map_err(|_| AppError::TaskPreparationFailed)?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::TaskPreparationFailed)
    }
}

/// Adds Claude's project compatibility view only inside its own Execution.
fn prepare_claude_skills(workspace: &Path) -> Result<(), AppError> {
    let shared = workspace.join(".agents/skills");
    if !shared.is_dir() {
        return Ok(());
    }
    let claude_directory = workspace.join(".claude");
    let claude_skills = claude_directory.join("skills");
    match fs::symlink_metadata(&claude_skills) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            if fs::read_link(&claude_skills).map_err(|_| AppError::TaskPreparationFailed)?
                == Path::new("../.agents/skills")
            {
                return Ok(());
            }
            Err(AppError::TaskPreparationFailed)
        }
        Ok(metadata) if metadata.is_dir() => copy_missing_skills(&shared, &claude_skills),
        Ok(_) => Err(AppError::TaskPreparationFailed),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(&claude_directory).map_err(|_| AppError::TaskPreparationFailed)?;
            create_claude_skill_link(&claude_skills)
        }
        Err(_) => Err(AppError::TaskPreparationFailed),
    }
}

/// Copies only valid missing Skills into an existing real Claude Skill directory.
fn copy_missing_skills(shared: &Path, claude_skills: &Path) -> Result<(), AppError> {
    for entry in fs::read_dir(shared).map_err(|_| AppError::TaskPreparationFailed)? {
        let entry = entry.map_err(|_| AppError::TaskPreparationFailed)?;
        if entry.path().is_dir() && entry.path().join("SKILL.md").is_file() {
            let destination = claude_skills.join(entry.file_name());
            if !destination.exists() {
                copy_isolated_tree(&entry.path(), &destination)?;
            }
        }
    }
    Ok(())
}

/// Creates the relative Claude compatibility link supported by local desktop targets.
#[cfg(unix)]
fn create_claude_skill_link(path: &Path) -> Result<(), AppError> {
    std::os::unix::fs::symlink("../.agents/skills", path)
        .map_err(|_| AppError::TaskPreparationFailed)
}

/// Falls back to a real directory on platforms without Unix directory links.
#[cfg(not(unix))]
fn create_claude_skill_link(path: &Path) -> Result<(), AppError> {
    fs::create_dir_all(path).map_err(|_| AppError::TaskPreparationFailed)
}

/// Makes copied Execution files writable even when the Baseline is read-only.
fn make_tree_writable(path: &Path) -> Result<(), AppError> {
    set_tree_read_only(path, false)
}

/// Locks the frozen Baseline against accidental writes by later services.
fn make_tree_read_only(path: &Path) -> Result<(), AppError> {
    set_tree_read_only(path, true)
}

/// Updates child permissions before their parent so traversal remains possible.
fn set_tree_read_only(path: &Path, read_only: bool) -> Result<(), AppError> {
    if path.is_dir() {
        for entry in fs::read_dir(path).map_err(|_| AppError::TaskPreparationFailed)? {
            let entry = entry.map_err(|_| AppError::TaskPreparationFailed)?;
            let file_type = entry
                .file_type()
                .map_err(|_| AppError::TaskPreparationFailed)?;
            if !file_type.is_symlink() {
                set_tree_read_only(&entry.path(), read_only)?;
            }
        }
    }
    let mut permissions = fs::metadata(path)
        .map_err(|_| AppError::TaskPreparationFailed)?
        .permissions();
    permissions.set_readonly(read_only);
    fs::set_permissions(path, permissions).map_err(|_| AppError::TaskPreparationFailed)
}

/// Accepts identifiers safe to use as one local path segment.
fn is_portable_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

/// Rejects non-UTF-8 persisted paths instead of creating irrecoverable metadata.
fn path_to_string(path: &Path) -> Result<String, AppError> {
    path.to_str()
        .map(str::to_string)
        .ok_or(AppError::TaskPreparationFailed)
}

#[cfg(test)]
mod tests {
    use super::{make_tree_writable, SnapshotAgentInput, SnapshotService, SnapshotSkillInput};
    use crate::domain::agent_kind::AgentKind;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RESOURCE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn freezes_source_first_skills_into_independent_agent_workspaces() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-snapshot-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("workspace");
            let mounted_shared = root.join("library/shared");
            let mounted_extra = root.join("library/extra");
            std::fs::create_dir_all(source.join(".agents/skills/shared"))
                .expect("source Skill should be created");
            std::fs::create_dir_all(&mounted_shared).expect("mounted Skill should be created");
            std::fs::create_dir_all(&mounted_extra).expect("extra Skill should be created");
            std::fs::write(source.join("input.txt"), "baseline")
                .expect("source input should be written");
            std::fs::write(
                source.join(".agents/skills/shared/SKILL.md"),
                "name: Source shared\ndescription: source wins\n",
            )
            .expect("source Skill should be written");
            std::fs::write(
                mounted_shared.join("SKILL.md"),
                "name: Mounted shared\ndescription: should lose\n",
            )
            .expect("mounted Skill should be written");
            std::fs::write(
                mounted_extra.join("SKILL.md"),
                "name: Extra\ndescription: copied\n",
            )
            .expect("extra Skill should be written");
            let service = SnapshotService::new(root.join("app-data"));
            let agents = vec![
                SnapshotAgentInput {
                    id: "agent-codex".to_string(),
                    agent_kind: AgentKind::Codex,
                },
                SnapshotAgentInput {
                    id: "agent-claude".to_string(),
                    agent_kind: AgentKind::Claude,
                },
            ];

            let prepared = service
                .prepare(
                    "task-1",
                    Some(&source),
                    vec![
                        SnapshotSkillInput {
                            folder_name: "shared".to_string(),
                            source_path: mounted_shared,
                            origin: "workspace_mount".to_string(),
                            library_skill_id: "skill-shared".to_string(),
                        },
                        SnapshotSkillInput {
                            folder_name: "extra".to_string(),
                            source_path: mounted_extra,
                            origin: "workspace_mount".to_string(),
                            library_skill_id: "skill-extra".to_string(),
                        },
                    ],
                    &agents,
                )
                .await
                .expect("snapshot should prepare");
            let baseline = root.join("app-data").join(&prepared.baseline_relative_path);
            let codex = root
                .join("app-data")
                .join(&prepared.executions[0].relative_path);
            let claude = root
                .join("app-data")
                .join(&prepared.executions[1].relative_path);

            assert_eq!(
                std::fs::read_to_string(baseline.join(".agents/skills/shared/SKILL.md")).unwrap(),
                "name: Source shared\ndescription: source wins\n"
            );
            assert!(baseline.join(".agents/skills/extra/SKILL.md").is_file());
            std::fs::write(codex.join("input.txt"), "codex")
                .expect("Codex copy should be writable");
            assert_eq!(
                std::fs::read_to_string(claude.join("input.txt")).unwrap(),
                "baseline"
            );
            assert_eq!(
                std::fs::read_to_string(source.join("input.txt")).unwrap(),
                "baseline"
            );
            assert!(!codex.join(".claude/skills").exists());
            assert!(claude.join(".claude/skills").exists());

            make_tree_writable(&root.join("app-data"))
                .expect("read-only Baseline should unlock for cleanup");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_link_that_escapes_the_workspace_source() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-dangerous-link-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("workspace");
            std::fs::create_dir_all(&source).expect("source should be created");
            std::fs::write(root.join("outside.txt"), "private")
                .expect("outside fixture should be written");
            std::os::unix::fs::symlink("../outside.txt", source.join("outside-link"))
                .expect("escaping link should be created");
            let service = SnapshotService::new(root.join("app-data"));

            let result = service
                .prepare(
                    "task-dangerous",
                    Some(&source),
                    Vec::new(),
                    &[SnapshotAgentInput {
                        id: "agent-1".to_string(),
                        agent_kind: AgentKind::Codex,
                    }],
                )
                .await;

            assert_eq!(
                result,
                Err(crate::error::AppError::UnsafeWorkspaceLink(
                    source.canonicalize().unwrap().join("outside-link")
                ))
            );
            assert!(!root.join("app-data/task-runs/task-dangerous").exists());
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }

    #[test]
    fn replaces_an_external_gitdir_file_with_isolated_metadata() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-git-metadata-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("workspace");
            std::fs::create_dir_all(&source).expect("source should be created");
            std::fs::write(source.join(".git"), "gitdir: /tmp/source-common\n")
                .expect("external gitdir fixture should be written");
            let service = SnapshotService::new(root.join("app-data"));

            let prepared = service
                .prepare(
                    "task-git",
                    Some(&source),
                    Vec::new(),
                    &[SnapshotAgentInput {
                        id: "agent-1".to_string(),
                        agent_kind: AgentKind::Codex,
                    }],
                )
                .await
                .expect("snapshot should isolate Git metadata");
            let baseline = root.join("app-data").join(prepared.baseline_relative_path);
            let execution = root
                .join("app-data")
                .join(&prepared.executions[0].relative_path);

            assert!(baseline.join(".git").is_dir());
            assert!(execution.join(".git").is_dir());
            assert_ne!(
                std::fs::canonicalize(baseline.join(".git")).unwrap(),
                std::fs::canonicalize(execution.join(".git")).unwrap()
            );

            make_tree_writable(&root.join("app-data"))
                .expect("read-only Baseline should unlock for cleanup");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }
}
