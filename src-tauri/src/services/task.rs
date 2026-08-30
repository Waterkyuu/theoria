use crate::domain::agent_kind::AgentKind;
use crate::domain::task::{Task, TaskAgent, TaskDetail, TaskPermissions, TaskStatus};
use crate::error::AppError;
use crate::repositories::skill::SkillRepository;
use crate::repositories::task::TaskRepository;
use crate::repositories::workspace::WorkspaceRepository;
use crate::services::snapshot::{SnapshotAgentInput, SnapshotService, SnapshotSkillInput};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TASK_ID_SEQUENCE: AtomicU64 = AtomicU64::new(1);

/// Frozen Agent choice accepted when a Task is first created.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CreateTaskAgentInput {
    /// Local Agent product.
    pub(crate) agent_kind: AgentKind,
    /// Optional explicit model choice.
    pub(crate) model: Option<String>,
    /// Optional mode or reasoning choice.
    pub(crate) mode: Option<String>,
}

/// Complete Composer configuration accepted exactly once.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CreateTaskInput {
    /// Optional owning Workspace.
    pub(crate) workspace_id: Option<String>,
    /// User-visible Task title.
    pub(crate) title: String,
    /// Initial natural-language request.
    pub(crate) prompt: String,
    /// One through six ordered Agent choices.
    pub(crate) agents: Vec<CreateTaskAgentInput>,
    /// Frozen file access identifier.
    pub(crate) file_access: String,
    /// Frozen command execution identifier.
    pub(crate) command_execution: String,
    /// Managed Skill choices allowed only for a normal Task.
    pub(crate) skill_ids: Vec<String>,
}

/// Restores immutable Task conditions and scoped History from local storage.
#[derive(Clone)]
pub(crate) struct TaskService {
    /// Persisted Task aggregate boundary.
    repository: TaskRepository,
    /// Workspace source metadata boundary.
    workspace_repository: WorkspaceRepository,
    /// Managed Skill and Workspace mount metadata boundary.
    skill_repository: SkillRepository,
    /// Filesystem isolation boundary.
    snapshot_service: SnapshotService,
    /// Root used to locate managed Skill sources.
    app_data_directory: PathBuf,
}

impl TaskService {
    /// Creates a Task service over the shared repository.
    pub(crate) fn new(
        repository: TaskRepository,
        workspace_repository: WorkspaceRepository,
        skill_repository: SkillRepository,
        snapshot_service: SnapshotService,
        app_data_directory: PathBuf,
    ) -> Self {
        Self {
            repository,
            workspace_repository,
            skill_repository,
            snapshot_service,
            app_data_directory,
        }
    }

    /// Validates and freezes a Composer into one Baseline and isolated Executions.
    pub(crate) async fn create(&self, input: CreateTaskInput) -> Result<TaskDetail, AppError> {
        let title = validate_text(input.title, 120)?;
        let prompt = validate_text(input.prompt, 16_000)?;
        if input.agents.is_empty() || input.agents.len() > 6 {
            return Err(AppError::InvalidTask);
        }
        if !matches!(input.file_access.as_str(), "read_only" | "allow_edits")
            || !matches!(input.command_execution.as_str(), "deny" | "ask" | "allow")
        {
            return Err(AppError::InvalidTask);
        }
        let (workspace_source, library_skills, skill_origin) = self
            .task_sources(input.workspace_id.as_deref(), &input.skill_ids)
            .await?;
        let created_at_ms = current_time_ms()?;
        let sequence = TASK_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let task_id = format!("task-{created_at_ms}-{sequence}");
        let snapshot_agents = input
            .agents
            .iter()
            .enumerate()
            .map(|(slot, agent)| SnapshotAgentInput {
                id: format!("task-agent-{created_at_ms}-{sequence}-{slot}"),
                agent_kind: agent.agent_kind,
            })
            .collect::<Vec<_>>();
        let snapshot_skills = library_skills
            .into_iter()
            .map(|skill| SnapshotSkillInput {
                folder_name: skill.folder_name,
                source_path: self.app_data_directory.join(skill.storage_relative_path),
                origin: skill_origin.to_string(),
                library_skill_id: skill.id,
            })
            .collect();
        let prepared = self
            .snapshot_service
            .prepare(
                &task_id,
                workspace_source.as_deref(),
                snapshot_skills,
                &snapshot_agents,
            )
            .await?;
        let execution_paths = prepared
            .executions
            .into_iter()
            .map(|execution| (execution.task_agent_id, execution.relative_path))
            .collect::<HashMap<_, _>>();
        let mut agents = Vec::with_capacity(input.agents.len());
        for (slot, (configuration, snapshot_agent)) in
            input.agents.into_iter().zip(snapshot_agents).enumerate()
        {
            let execution_relative_path = execution_paths
                .get(&snapshot_agent.id)
                .cloned()
                .ok_or(AppError::TaskPreparationFailed)?;
            agents.push(TaskAgent {
                id: snapshot_agent.id,
                task_id: task_id.clone(),
                slot_index: i64::try_from(slot).map_err(|_| AppError::InvalidTask)?,
                agent_kind: configuration.agent_kind,
                model_snapshot: validate_optional_text(configuration.model, 200)?,
                mode_snapshot: validate_optional_text(configuration.mode, 200)?,
                session_id: None,
                execution_relative_path,
                status: TaskStatus::Preparing,
                created_at_ms,
                updated_at_ms: created_at_ms,
            });
        }
        let detail = TaskDetail {
            task: Task {
                id: task_id.clone(),
                workspace_id: input.workspace_id,
                title,
                prompt,
                baseline_relative_path: prepared.baseline_relative_path,
                status: TaskStatus::Preparing,
                configuration_locked_at_ms: Some(created_at_ms),
                created_at_ms,
                updated_at_ms: created_at_ms,
            },
            agents,
            permissions: TaskPermissions {
                file_access: input.file_access,
                command_execution: input.command_execution,
            },
            skills: prepared.skills,
            results: Vec::new(),
            turns: Vec::new(),
        };
        match self.repository.create(detail).await {
            Ok(detail) => Ok(detail),
            Err(_) => {
                self.snapshot_service.remove_task_files(&task_id).await?;
                Err(AppError::TaskDatabaseFailed)
            }
        }
    }

    /// Lists global Recent or one Workspace History as distinct scopes.
    pub(crate) async fn list(&self, workspace_id: Option<&str>) -> Result<Vec<Task>, AppError> {
        self.repository
            .list(workspace_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)
    }

    /// Restores one Task including all locked conditions and collected results.
    pub(crate) async fn get(&self, task_id: &str) -> Result<TaskDetail, AppError> {
        self.repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)
    }

    /// Selects an immutable Workspace source and its mounted Skills, or normal Task Skills.
    async fn task_sources(
        &self,
        workspace_id: Option<&str>,
        selected_skill_ids: &[String],
    ) -> Result<
        (
            Option<PathBuf>,
            Vec<crate::domain::skill::Skill>,
            &'static str,
        ),
        AppError,
    > {
        match workspace_id {
            Some(workspace_id) => {
                if !selected_skill_ids.is_empty() {
                    return Err(AppError::InvalidTask);
                }
                let workspace = self
                    .workspace_repository
                    .list()
                    .await
                    .map_err(|_| AppError::TaskDatabaseFailed)?
                    .into_iter()
                    .find(|workspace| workspace.id == workspace_id)
                    .ok_or(AppError::InvalidWorkspace)?;
                let skills = self
                    .skill_repository
                    .list_for_workspace(workspace_id)
                    .await
                    .map_err(|_| AppError::TaskDatabaseFailed)?;
                Ok((Some(workspace.source_path), skills, "workspace_mount"))
            }
            None => {
                let selected = selected_skill_ids.iter().collect::<HashSet<_>>();
                if selected.len() != selected_skill_ids.len() {
                    return Err(AppError::InvalidTask);
                }
                let skills = self
                    .skill_repository
                    .list()
                    .await
                    .map_err(|_| AppError::TaskDatabaseFailed)?
                    .into_iter()
                    .filter(|skill| selected.contains(&skill.id))
                    .collect::<Vec<_>>();
                if skills.len() != selected.len() {
                    return Err(AppError::InvalidSkill);
                }
                Ok((None, skills, "task_selection"))
            }
        }
    }
}

/// Trims one required Task field while enforcing its persisted bound.
fn validate_text(value: String, maximum: usize) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() || value.len() > maximum {
        return Err(AppError::InvalidTask);
    }
    Ok(value.to_string())
}

/// Trims one optional Agent snapshot and rejects oversized explicit values.
fn validate_optional_text(
    value: Option<String>,
    maximum: usize,
) -> Result<Option<String>, AppError> {
    value.map(|value| validate_text(value, maximum)).transpose()
}

/// Returns a positive Unix millisecond timestamp for Task identifiers and locking.
fn current_time_ms() -> Result<i64, AppError> {
    let milliseconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::TaskPreparationFailed)?
        .as_millis();
    i64::try_from(milliseconds).map_err(|_| AppError::TaskPreparationFailed)
}

#[cfg(test)]
mod tests {
    use super::{CreateTaskAgentInput, CreateTaskInput, TaskService};
    use crate::db::connection::connect_sqlite;
    use crate::db::migration::Migrator;
    use crate::domain::agent_kind::AgentKind;
    use crate::domain::skill::{NewSkill, SkillSourceType};
    use crate::domain::task::TaskStatus;
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::repositories::skill::SkillRepository;
    use crate::repositories::task::TaskRepository;
    use crate::repositories::workspace::WorkspaceRepository;
    use crate::services::snapshot::SnapshotService;
    use sea_orm_migration::MigratorTrait;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RESOURCE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn creates_locked_tasks_from_fresh_workspace_snapshots() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-task-service-test-{}-{sequence}",
                std::process::id()
            ));
            let source = root.join("workspace");
            let app_data = root.join("app-data");
            let managed_skill = app_data.join("skills/skill-1");
            std::fs::create_dir_all(&source).expect("Workspace fixture should be created");
            std::fs::create_dir_all(&managed_skill).expect("Skill fixture should be created");
            std::fs::write(source.join("input.txt"), "task-a")
                .expect("Workspace input should be written");
            std::fs::write(
                managed_skill.join("SKILL.md"),
                "name: Map\ndescription: Maps files\n",
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
            let workspace_repository = WorkspaceRepository::new(database.clone());
            workspace_repository
                .create(NewWorkspace {
                    id: "workspace-1".to_string(),
                    name: "Docs".to_string(),
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
                .mount("workspace-1", &skill, 100)
                .await
                .expect("Skill should mount");
            let snapshot_service = SnapshotService::new(app_data.clone());
            let service = TaskService::new(
                TaskRepository::new(database.clone()),
                workspace_repository,
                skill_repository,
                snapshot_service.clone(),
                app_data.clone(),
            );
            let input = || CreateTaskInput {
                workspace_id: Some("workspace-1".to_string()),
                title: "Compare agents".to_string(),
                prompt: "Read the input".to_string(),
                agents: vec![
                    CreateTaskAgentInput {
                        agent_kind: AgentKind::Codex,
                        model: Some("codex-model".to_string()),
                        mode: None,
                    },
                    CreateTaskAgentInput {
                        agent_kind: AgentKind::Claude,
                        model: Some("claude-model".to_string()),
                        mode: Some("high".to_string()),
                    },
                ],
                file_access: "allow_edits".to_string(),
                command_execution: "ask".to_string(),
                skill_ids: Vec::new(),
            };

            let task_a = service
                .create(input())
                .await
                .expect("Task A should prepare");
            let task_a_baseline = app_data.join(&task_a.task.baseline_relative_path);
            let first_execution = app_data.join(&task_a.agents[0].execution_relative_path);
            let second_execution = app_data.join(&task_a.agents[1].execution_relative_path);
            std::fs::write(first_execution.join("input.txt"), "agent-a")
                .expect("Execution should be writable");
            std::fs::write(source.join("input.txt"), "task-b")
                .expect("Workspace should remain user-editable");
            let task_b = service
                .create(input())
                .await
                .expect("Task B should prepare");
            let task_b_baseline = app_data.join(&task_b.task.baseline_relative_path);

            assert_eq!(task_a.task.status, TaskStatus::Preparing);
            assert!(task_a.task.configuration_locked_at_ms.is_some());
            assert_ne!(first_execution, second_execution);
            assert_eq!(
                std::fs::read_to_string(second_execution.join("input.txt")).unwrap(),
                "task-a"
            );
            assert_eq!(
                std::fs::read_to_string(task_a_baseline.join("input.txt")).unwrap(),
                "task-a"
            );
            assert_eq!(
                std::fs::read_to_string(task_b_baseline.join("input.txt")).unwrap(),
                "task-b"
            );
            assert_eq!(
                std::fs::read_to_string(source.join("input.txt")).unwrap(),
                "task-b"
            );
            assert!(task_a_baseline
                .join(".agents/skills/map/SKILL.md")
                .is_file());
            assert_eq!(service.get(&task_a.task.id).await.unwrap(), task_a);

            snapshot_service
                .remove_task_files(&task_a.task.id)
                .await
                .expect("Task A files should clean up");
            snapshot_service
                .remove_task_files(&task_b.task.id)
                .await
                .expect("Task B files should clean up");
            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }
}
