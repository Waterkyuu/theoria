use crate::domain::agent_kind::AgentKind;
use crate::domain::agent_status::AgentLoginStatus;
use crate::domain::benchmark::{safe_asset_id, BenchmarkCheck};
use crate::domain::benchmark_task::{
    BenchmarkPreflightIssue, BenchmarkPreflightIssueKind, BenchmarkTaskConfiguration,
    BenchmarkTaskPreview,
};
use crate::error::AppError;
use crate::repositories::benchmark::BenchmarkRepository;
use std::collections::HashSet;
use std::path::PathBuf;

/// Benchmark execution configuration is independent of catalog editing and work Task inputs.
#[derive(Clone)]
pub(crate) struct BenchmarkTaskService {
    /// Published definitions and workspace mounts.
    repository: BenchmarkRepository,
    /// Root of the immutable input assets.
    asset_directory: PathBuf,
}

impl BenchmarkTaskService {
    /// Reads only application-owned benchmark materials during preflight.
    pub(crate) fn new(repository: BenchmarkRepository, app_data: PathBuf) -> Self {
        Self {
            repository,
            asset_directory: app_data.join("benchmark-assets"),
        }
    }

    /// Probes the external product boundary on a blocking worker without loading model settings.
    pub(crate) async fn preview(
        &self,
        configuration: BenchmarkTaskConfiguration,
        mut probe: impl FnMut(AgentKind) -> Result<AgentLoginStatus, AppError> + Send + 'static,
    ) -> Result<BenchmarkTaskPreview, AppError> {
        if [
            &configuration.workspace_id,
            &configuration.mount_id,
            &configuration.expected_version_id,
        ]
        .iter()
        .any(|id| id.is_empty() || id.len() > 200)
            || configuration.agent_kinds.is_empty()
            || configuration.agent_kinds.len() > 4
            || configuration
                .agent_kinds
                .iter()
                .collect::<HashSet<_>>()
                .len()
                != configuration.agent_kinds.len()
            || !matches!(
                configuration.permissions.file_access.as_str(),
                "read_only" | "allow_edits"
            )
            || !matches!(
                configuration.permissions.command_execution.as_str(),
                "deny" | "ask" | "allow"
            )
        {
            return Err(AppError::InvalidBenchmark);
        }
        let mount = self
            .repository
            .workspace_mount(&configuration.workspace_id, &configuration.mount_id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        if mount.version_id != configuration.expected_version_id {
            return Err(AppError::BenchmarkConflict);
        }
        let benchmark = self
            .repository
            .detail(&mount.benchmark_id, Some(&mount.version_id))
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        // A deleted tag may become Uncategorized; that metadata change does not invalidate a published version.
        if benchmark.document.schema_version != 1
            || benchmark.document.cases.is_empty()
            || benchmark.document.cases.len() > 100
        {
            return Err(AppError::InvalidBenchmark);
        }
        let mut issues = Vec::new();
        for (position, case) in benchmark.document.cases.iter().enumerate() {
            let mut missing_asset = false;
            for file in &case.input_files {
                if !safe_asset_id(&file.asset_id) {
                    missing_asset = true;
                    break;
                }
                match tokio::fs::symlink_metadata(self.asset_directory.join(&file.asset_id)).await {
                    Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
                    _ => {
                        missing_asset = true;
                        break;
                    }
                }
            }
            if missing_asset {
                issues.push(BenchmarkPreflightIssue {
                    kind: BenchmarkPreflightIssueKind::AssetUnavailable,
                    agent_kind: None,
                    case_position: Some(position),
                });
            }
            if case
                .checks
                .iter()
                .any(|check| matches!(check, BenchmarkCheck::Python { .. }))
            {
                issues.push(BenchmarkPreflightIssue {
                    kind: BenchmarkPreflightIssueKind::VerifierUnavailable,
                    agent_kind: None,
                    case_position: Some(position),
                });
            }
        }
        let agent_kinds = configuration.agent_kinds.clone();
        let agent_issues = tokio::task::spawn_blocking(move || {
            agent_kinds
                .into_iter()
                .filter_map(|agent_kind| {
                    let kind = match probe(agent_kind) {
                        Ok(login) if !login.installed => {
                            BenchmarkPreflightIssueKind::AgentNotInstalled
                        }
                        Ok(login) if !login.logged_in => {
                            BenchmarkPreflightIssueKind::AgentNotAuthenticated
                        }
                        Err(_) => BenchmarkPreflightIssueKind::AgentCheckFailed,
                        Ok(_) => return None,
                    };
                    Some(BenchmarkPreflightIssue {
                        kind,
                        agent_kind: Some(agent_kind),
                        case_position: None,
                    })
                })
                .collect::<Vec<_>>()
        })
        .await
        .map_err(|_| AppError::WorkerFailed)?;
        issues.extend(agent_issues);
        Ok(BenchmarkTaskPreview {
            configuration,
            benchmark,
            issues,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::connect_sqlite, migration::Migrator};
    use crate::domain::benchmark::{
        BenchmarkCase, BenchmarkCheck, BenchmarkDocument, BenchmarkFile,
    };
    use crate::domain::task::TaskPermissions;
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::repositories::{task::TaskRepository, workspace::WorkspaceRepository};
    use crate::services::benchmark::BenchmarkService;
    use sea_orm_migration::MigratorTrait;

    #[test]
    fn preview_keeps_all_cases_and_permissions_without_creating_tasks() {
        tauri::async_runtime::block_on(async {
            let database = connect_sqlite("sqlite::memory:").await.expect("database");
            Migrator::up(&database, None).await.expect("schema");
            WorkspaceRepository::new(database.clone())
                .create(NewWorkspace {
                    id: "workspace".into(),
                    name: "Workspace".into(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: PathBuf::from("unused-workspace-input"),
                    created_at_ms: 1,
                })
                .await
                .expect("workspace");
            let repository = BenchmarkRepository::new(database.clone());
            let catalog = BenchmarkService::new(repository.clone(), PathBuf::new());
            let tag = catalog.create_tag("Coding", "Code").await.expect("tag");
            let directory =
                std::env::temp_dir().join(format!("theoria-benchmark-preflight-{}", tag.id));
            tokio::fs::create_dir(&directory)
                .await
                .expect("owned fixture directory");
            tokio::fs::create_dir(directory.join("benchmark-assets"))
                .await
                .expect("asset directory");
            let asset = directory.join("benchmark-assets").join("fixture-input");
            tokio::fs::write(&asset, "starting material")
                .await
                .expect("input asset");
            let catalog = BenchmarkService::new(repository.clone(), directory.clone());
            let document = BenchmarkDocument {
                schema_version: 1,
                name: "Two cases".into(),
                description: "Fixed suite".into(),
                tag_id: Some(tag.id),
                source: None,
                cases: ["First", "Second"]
                    .into_iter()
                    .map(|name| BenchmarkCase {
                        name: name.into(),
                        prompt: "Return 42".into(),
                        timeout_minutes: 1,
                        input_files: vec![BenchmarkFile {
                            path: "input.txt".into(),
                            asset_id: "fixture-input".into(),
                        }],
                        checks: vec![BenchmarkCheck::Answer {
                            expected: "42".into(),
                        }],
                    })
                    .collect(),
            };
            let draft = catalog
                .save_draft(None, None, document.clone())
                .await
                .expect("draft");
            let detail = catalog
                .publish(&draft.id, draft.revision)
                .await
                .expect("publish");
            let mount = catalog
                .mount(
                    "workspace".into(),
                    detail.summary.id.clone(),
                    detail.version_id.clone(),
                )
                .await
                .expect("mount");
            let configuration = BenchmarkTaskConfiguration {
                workspace_id: "workspace".into(),
                mount_id: mount.id,
                expected_version_id: detail.version_id,
                agent_kinds: vec![AgentKind::Claude, AgentKind::Codex],
                permissions: TaskPermissions {
                    file_access: "read_only".into(),
                    command_execution: "deny".into(),
                },
            };
            let service = BenchmarkTaskService::new(repository, directory.clone());
            let preview = service
                .preview(configuration.clone(), |_| {
                    Ok(AgentLoginStatus {
                        installed: true,
                        logged_in: true,
                        authentication_method: None,
                    })
                })
                .await
                .expect("valid mount should produce a preview");
            assert_eq!(preview.configuration, configuration);
            assert_eq!(preview.benchmark.document.cases, document.cases);
            assert!(preview.issues.is_empty());
            let response = serde_json::to_string(
                &crate::dto::benchmark_task::BenchmarkTaskPreviewResponse::from(preview),
            )
            .expect("IPC preview");
            assert!(response.contains("\"executionCount\":4"));
            assert!(!response.contains("Return 42"));
            assert!(!response.contains("fixture-input"));
            assert!(TaskRepository::new(database.clone())
                .list(Some("workspace"))
                .await
                .expect("tasks")
                .is_empty());

            let mut stale = configuration.clone();
            stale.expected_version_id = "stale-version".into();
            assert!(matches!(
                service
                    .preview(stale, |_| panic!("stale request must not probe agents"))
                    .await,
                Err(AppError::BenchmarkConflict)
            ));
            let mut foreign = configuration.clone();
            foreign.workspace_id = "another-workspace".into();
            assert!(matches!(
                service
                    .preview(foreign, |_| panic!("foreign mount must not probe agents"))
                    .await,
                Err(AppError::BenchmarkNotFound)
            ));
            let mut duplicate = configuration.clone();
            duplicate.agent_kinds = vec![AgentKind::Codex, AgentKind::Codex];
            assert!(matches!(
                service
                    .preview(duplicate, |_| panic!("duplicate products must be rejected"))
                    .await,
                Err(AppError::InvalidBenchmark)
            ));
            let unavailable = service
                .preview(configuration.clone(), |kind| match kind {
                    AgentKind::Claude => Ok(AgentLoginStatus::default()),
                    _ => Err(AppError::WorkerFailed),
                })
                .await
                .expect("probe failures should remain displayable");
            assert_eq!(unavailable.issues.len(), 2);
            assert_eq!(unavailable.benchmark.document.cases.len(), 2);
            tokio::fs::remove_file(&asset)
                .await
                .expect("remove published input");
            let missing = service
                .preview(configuration, |_| {
                    Ok(AgentLoginStatus {
                        installed: true,
                        logged_in: true,
                        authentication_method: None,
                    })
                })
                .await
                .expect("missing materials must remain visible");
            assert_eq!(
                missing
                    .issues
                    .iter()
                    .map(|issue| (issue.kind, issue.case_position))
                    .collect::<Vec<_>>(),
                vec![
                    (BenchmarkPreflightIssueKind::AssetUnavailable, Some(0)),
                    (BenchmarkPreflightIssueKind::AssetUnavailable, Some(1)),
                ]
            );
            database.close().await.expect("close database");
            tokio::fs::remove_dir_all(directory)
                .await
                .expect("clean fixture");
        });
    }
}
