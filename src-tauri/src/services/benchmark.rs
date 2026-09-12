use crate::domain::benchmark::{
    safe_asset_id, BenchmarkCheck, BenchmarkDetail, BenchmarkDocument, BenchmarkDraft,
    BenchmarkMount, BenchmarkSummary, BenchmarkTag,
};
use crate::error::AppError;
use crate::repositories::benchmark::BenchmarkRepository;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static IDENTIFIER_SEQUENCE: AtomicU64 = AtomicU64::new(1);

/// Catalog use cases own publication rules; they do not start Agent processes.
#[derive(Clone)]
pub(crate) struct BenchmarkService {
    /// Transactional catalog persistence.
    repository: BenchmarkRepository,
    /// Application-owned immutable assets.
    asset_directory: PathBuf,
}
impl BenchmarkService {
    /// Keeps all material under the application data directory.
    pub(crate) fn new(repository: BenchmarkRepository, app_data: PathBuf) -> Self {
        Self {
            repository,
            asset_directory: app_data.join("benchmark-assets"),
        }
    }

    /// Picker values contain no files or executable configuration.
    pub(crate) async fn tags(&self) -> Result<Vec<BenchmarkTag>, AppError> {
        self.repository
            .tags()
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }

    /// The UI selects a Gravity export name; arbitrary paths and markup are rejected.
    pub(crate) async fn create_tag(
        &self,
        name: &str,
        icon: &str,
    ) -> Result<BenchmarkTag, AppError> {
        if name.trim().is_empty()
            || name.trim().chars().count() > 40
            || icon.is_empty()
            || icon.len() > 80
            || !icon.bytes().all(|c| c.is_ascii_alphanumeric())
        {
            return Err(AppError::InvalidBenchmark);
        }
        self.repository
            .create_tag(BenchmarkTag {
                id: new_id("tag")?,
                name: name.trim().to_string(),
                icon: icon.to_string(),
                is_system: false,
            })
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }

    /// Drafts may be incomplete but remain bounded and use the supported template format.
    pub(crate) async fn save_draft(
        &self,
        id: Option<String>,
        expected: Option<i64>,
        document: BenchmarkDocument,
    ) -> Result<BenchmarkDraft, AppError> {
        if id.is_some() != expected.is_some()
            || expected.is_some_and(|n| n < 1 || n == i64::MAX)
            || document.schema_version != 1
            || document.cases.len() > 100
        {
            return Err(AppError::InvalidBenchmark);
        }
        if serde_json::to_vec(&document)
            .map_err(|_| AppError::InvalidBenchmark)?
            .len()
            > 2 * 1024 * 1024
        {
            return Err(AppError::InvalidBenchmark);
        }
        let previous = match &id {
            Some(id) => Some(self.draft(id).await?),
            None => None,
        };
        let draft = BenchmarkDraft {
            id: match id {
                Some(id) => id,
                None => new_id("draft")?,
            },
            benchmark_id: previous.and_then(|draft| draft.benchmark_id),
            revision: expected.map_or(1, |n| n + 1),
            document,
            updated_at_ms: now_ms()?,
        };
        self.repository
            .save_draft(draft, expected)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkConflict)
    }

    /// The editor loads one draft body on selection rather than all bodies at once.
    pub(crate) async fn draft(&self, id: &str) -> Result<BenchmarkDraft, AppError> {
        self.repository
            .draft(id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)
    }
    /// Pages are bounded even when the user keeps many incomplete drafts.
    pub(crate) async fn drafts(&self, page: u32) -> Result<Vec<String>, AppError> {
        self.repository
            .draft_ids(page)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }

    /// Publication reads the saved revision; the client cannot inject different case content.
    pub(crate) async fn publish(
        &self,
        id: &str,
        expected: i64,
    ) -> Result<BenchmarkDetail, AppError> {
        let draft = self.draft(id).await?;
        if draft.revision != expected {
            return Err(AppError::BenchmarkConflict);
        }
        let issues = draft.document.publication_issues();
        if !issues.is_empty() {
            return Err(AppError::InvalidBenchmark);
        }
        for case in &draft.document.cases {
            for file in &case.input_files {
                if !safe_asset_id(&file.asset_id) {
                    return Err(AppError::BenchmarkAssetUnavailable);
                }
                let metadata =
                    tokio::fs::symlink_metadata(self.asset_directory.join(&file.asset_id))
                        .await
                        .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(AppError::BenchmarkAssetUnavailable);
                }
            }
            if case
                .checks
                .iter()
                .any(|check| matches!(check, BenchmarkCheck::Python { .. }))
            {
                return Err(AppError::BenchmarkVerifierUnavailable);
            }
        }
        let benchmark_id = match &draft.benchmark_id {
            Some(id) => id.clone(),
            None => new_id("benchmark")?,
        };
        let version = self
            .repository
            .publish(&draft, &benchmark_id, &new_id("version")?, now_ms()?)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkConflict)?;
        self.detail(&benchmark_id, Some(&version)).await
    }

    /// Validates bounded catalog filters and the supported ordering choices.
    pub(crate) async fn list(
        &self,
        search: &str,
        tags: &[String],
        author: Option<&str>,
        sort: &str,
        page: u32,
    ) -> Result<Vec<BenchmarkSummary>, AppError> {
        if search.len() > 1000
            || tags.len() > 100
            || tags.iter().any(|tag| tag.len() > 200)
            || !matches!(sort, "newest" | "updated" | "oldest" | "alphabetical")
            || author.is_some_and(|author| !matches!(author, "platform" | "myself"))
        {
            return Err(AppError::InvalidBenchmark);
        }
        self.repository
            .list(search.trim(), tags, author, sort, page)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }
    /// Both the public catalog and a workspace open this same immutable version detail.
    pub(crate) async fn detail(
        &self,
        id: &str,
        version: Option<&str>,
    ) -> Result<BenchmarkDetail, AppError> {
        self.repository
            .detail(id, version)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)
    }
    /// A workspace mount pins content without copying it into workspace source files.
    pub(crate) async fn mount(
        &self,
        workspace: String,
        benchmark: String,
        version: String,
    ) -> Result<BenchmarkMount, AppError> {
        self.repository
            .mount(BenchmarkMount {
                id: new_id("mount")?,
                workspace_id: workspace,
                benchmark_id: benchmark,
                version_id: version,
                created_at_ms: now_ms()?,
            })
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkReadOnly)
    }
    /// Mount lists are independent of global catalog filtering.
    pub(crate) async fn mounts(
        &self,
        workspace: &str,
        page: u32,
    ) -> Result<Vec<BenchmarkMount>, AppError> {
        self.repository
            .mounts(workspace, page)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }
    /// Unmount changes only the workspace relationship.
    pub(crate) async fn unmount(&self, workspace: &str, id: &str) -> Result<(), AppError> {
        self.repository
            .unmount(workspace, id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }
}

/// Timestamp plus process-local sequence avoids coupling business identifiers to SQL row ids.
fn new_id(prefix: &str) -> Result<String, AppError> {
    Ok(format!(
        "{prefix}-{}-{}",
        now_ms()?,
        IDENTIFIER_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}
/// UTC timestamps are persisted as integer milliseconds.
fn now_ms() -> Result<i64, AppError> {
    i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AppError::InvalidBenchmark)?
            .as_millis(),
    )
    .map_err(|_| AppError::InvalidBenchmark)
}

#[cfg(test)]
mod tests {
    use super::BenchmarkService;
    use crate::db::{connection::connect_sqlite, migration::Migrator};
    use crate::domain::benchmark::BenchmarkDocument;
    use crate::error::AppError;
    use crate::repositories::benchmark::BenchmarkRepository;
    use sea_orm_migration::MigratorTrait;
    use std::path::PathBuf;

    #[test]
    fn incomplete_draft_is_saved_but_cannot_be_published() {
        tauri::async_runtime::block_on(async {
            let database = connect_sqlite("sqlite::memory:")
                .await
                .expect("database should open");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let service =
                BenchmarkService::new(BenchmarkRepository::new(database.clone()), PathBuf::new());
            let draft = service
                .save_draft(
                    None,
                    None,
                    BenchmarkDocument {
                        schema_version: 1,
                        name: String::new(),
                        description: String::new(),
                        tag_id: None,
                        source: None,
                        cases: vec![],
                    },
                )
                .await
                .expect("incomplete draft should save");
            assert!(matches!(
                service.publish(&draft.id, draft.revision).await,
                Err(AppError::InvalidBenchmark)
            ));
            assert_eq!(
                service
                    .draft(&draft.id)
                    .await
                    .expect("draft must remain")
                    .document,
                draft.document
            );
            database.close().await.expect("database should close");
        });
    }
    #[test]
    fn publishes_complete_cases_and_mounts_one_fixed_version() {
        tauri::async_runtime::block_on(async {
            use crate::domain::benchmark::{BenchmarkCase, BenchmarkCheck};
            use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
            use crate::repositories::workspace::WorkspaceRepository;

            let database = connect_sqlite("sqlite::memory:")
                .await
                .expect("database should open");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            WorkspaceRepository::new(database.clone())
                .create(NewWorkspace {
                    id: "workspace-1".to_string(),
                    name: "Workspace".to_string(),
                    source_kind: WorkspaceSourceKind::External,
                    source_path: PathBuf::from("fixture"),
                    created_at_ms: 1,
                })
                .await
                .expect("workspace metadata should save");
            let service =
                BenchmarkService::new(BenchmarkRepository::new(database.clone()), PathBuf::new());
            let tag = service
                .create_tag("Code", "Code")
                .await
                .expect("tag should save");
            let document = BenchmarkDocument {
                schema_version: 1,
                name: "Case_% suite".to_string(),
                description: "Two cases".to_string(),
                tag_id: Some(tag.id.clone()),
                source: None,
                cases: ["One", "Two"]
                    .into_iter()
                    .map(|name| BenchmarkCase {
                        name: name.to_string(),
                        prompt: "Return 42".to_string(),
                        timeout_minutes: 10,
                        input_files: Vec::new(),
                        checks: vec![BenchmarkCheck::Answer {
                            expected: "42".to_string(),
                        }],
                    })
                    .collect(),
            };
            let draft = service
                .save_draft(None, None, document.clone())
                .await
                .expect("draft should save");
            let saved = service
                .save_draft(Some(draft.id.clone()), Some(1), document.clone())
                .await
                .expect("current revision should save");
            assert_eq!(saved.revision, 2);
            assert_eq!(
                service
                    .save_draft(Some(draft.id.clone()), Some(1), document.clone())
                    .await,
                Err(AppError::BenchmarkConflict)
            );
            assert_eq!(
                service
                    .draft(&draft.id)
                    .await
                    .expect("current draft should remain"),
                saved
            );
            let published = service
                .publish(&draft.id, 2)
                .await
                .expect("complete suite should publish");
            assert_eq!(published.summary.case_count, 2);
            assert_eq!(published.document.cases, document.cases);
            assert_eq!(
                service.draft(&draft.id).await,
                Err(AppError::BenchmarkNotFound)
            );
            let mut plain = document;
            plain.name = "Plain suite".to_string();
            let other = service
                .save_draft(None, None, plain)
                .await
                .expect("second draft should save");
            service
                .publish(&other.id, 1)
                .await
                .expect("second suite should publish");
            let filtered = service
                .list(
                    "%",
                    std::slice::from_ref(&tag.id),
                    Some("myself"),
                    "newest",
                    0,
                )
                .await
                .expect("literal search should run");
            assert_eq!(filtered.len(), 1);
            assert_eq!(filtered[0].id, published.summary.id);
            let ordered = service
                .list("", &[], None, "alphabetical", 0)
                .await
                .expect("sort");
            assert_eq!(ordered[0].id, published.summary.id);
            let mounted = service
                .mount(
                    "workspace-1".to_string(),
                    published.summary.id.clone(),
                    published.version_id.clone(),
                )
                .await
                .expect("version should mount");
            let repeated = service
                .mount(
                    "workspace-1".to_string(),
                    published.summary.id.clone(),
                    published.version_id.clone(),
                )
                .await
                .expect("repeated mount should succeed");
            assert_eq!(mounted, repeated);
            assert_eq!(
                service
                    .mounts("workspace-1", 0)
                    .await
                    .expect("mounts should list")
                    .len(),
                1
            );
            service
                .unmount("workspace-1", &mounted.id)
                .await
                .expect("mount should detach");
            assert!(service
                .mounts("workspace-1", 0)
                .await
                .expect("mounts should list")
                .is_empty());
            assert_eq!(
                service
                    .detail(&published.summary.id, Some(&published.version_id))
                    .await
                    .expect("published version must remain"),
                published
            );
            database.close().await.expect("database should close");
        });
    }
}
