use crate::adapters::benchmark_verifier::BenchmarkVerifier;
use crate::domain::benchmark::{
    safe_asset_id, safe_relative_path, BenchmarkAssetPreview, BenchmarkCase, BenchmarkCheck,
    BenchmarkDetail, BenchmarkDocument, BenchmarkDraft, BenchmarkFile, BenchmarkImportPreview,
    BenchmarkImportPreviewCase, BenchmarkMount, BenchmarkSummary, BenchmarkTag,
    BenchmarkValidationIssue,
};
use crate::dto::benchmark::{BenchmarkImportCheck, BenchmarkImportFile, BenchmarkImportTemplate};
use crate::error::AppError;
use crate::repositories::benchmark::BenchmarkRepository;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

static IDENTIFIER_SEQUENCE: AtomicU64 = AtomicU64::new(1);
const MAX_TEMPLATE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ASSET_BYTES: u64 = 5 * 1024 * 1024;
const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PREVIEW_BYTES: usize = 256 * 1024;

/// Catalog use cases own publication rules; they do not start Agent processes.
#[derive(Clone)]
pub(crate) struct BenchmarkService {
    /// Transactional catalog persistence.
    repository: BenchmarkRepository,
    /// Application-owned immutable assets.
    asset_directory: PathBuf,
    /// Host capability required before Python validator drafts may be published.
    verifier: Arc<dyn BenchmarkVerifier>,
}
impl BenchmarkService {
    /// Keeps all material under the application data directory.
    pub(crate) fn new(
        repository: BenchmarkRepository,
        app_data: PathBuf,
        verifier: Arc<dyn BenchmarkVerifier>,
    ) -> Self {
        Self {
            repository,
            asset_directory: app_data.join("benchmark-assets"),
            verifier,
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
        validate_tag_fields(name, icon)?;
        self.repository
            .create_tag(BenchmarkTag {
                id: new_id("tag")?,
                name: name.trim().to_string(),
                icon: icon.to_string(),
            })
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }

    /// Validates one portable folder and returns only display-safe metadata.
    pub(crate) async fn preview_import(
        &self,
        source_path: PathBuf,
    ) -> Result<BenchmarkImportPreview, AppError> {
        let (root, template) = load_import_template(source_path).await?;
        let document = preview_document(&template);
        let mut issues = document
            .publication_issues()
            .into_iter()
            .filter(|issue| issue.code != "tag_required")
            .collect::<Vec<_>>();
        let mut total_bytes = 0_u64;
        let mut file_count = 0_usize;
        for (case_index, case) in template.cases.iter().enumerate() {
            for (file_index, file) in case.input_files.iter().enumerate() {
                file_count += 1;
                match inspect_template_file(&root, file).await {
                    Ok(size) => total_bytes = total_bytes.saturating_add(size),
                    Err(code) => issues.push(crate::domain::benchmark::BenchmarkValidationIssue {
                        field: format!("cases.{case_index}.inputFiles.{file_index}"),
                        code,
                    }),
                }
            }
            for (check_index, check) in case.checks.iter().enumerate() {
                if let BenchmarkImportCheck::Python { script } = check {
                    file_count += 1;
                    match inspect_template_file(&root, script).await {
                        Ok(size) => total_bytes = total_bytes.saturating_add(size),
                        Err(code) => {
                            issues.push(crate::domain::benchmark::BenchmarkValidationIssue {
                                field: format!("cases.{case_index}.checks.{check_index}.script"),
                                code,
                            })
                        }
                    }
                }
            }
        }
        if file_count > 256 {
            issues.push(crate::domain::benchmark::BenchmarkValidationIssue {
                field: "cases".to_string(),
                code: "too_many_files",
            });
        }
        if total_bytes > MAX_IMPORT_BYTES {
            issues.push(crate::domain::benchmark::BenchmarkValidationIssue {
                field: "cases".to_string(),
                code: "import_too_large",
            });
        }
        Ok(BenchmarkImportPreview {
            name: template.name,
            description: template.description,
            source: template.source,
            cases: template
                .cases
                .into_iter()
                .map(|case| BenchmarkImportPreviewCase {
                    name: case.name,
                    timeout_minutes: case.timeout_minutes,
                    input_file_count: case.input_files.len(),
                    check_kinds: case
                        .checks
                        .iter()
                        .map(|check| check.kind().to_string())
                        .collect(),
                })
                .collect(),
            file_count,
            issues,
        })
    }

    /// Copies valid references and creates one editable draft from a recognized folder.
    pub(crate) async fn import_folder(
        &self,
        source_path: PathBuf,
        tag_id: &str,
    ) -> Result<BenchmarkDraft, AppError> {
        validate_id(tag_id)?;
        self.repository
            .tag(tag_id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)?;
        let (root, template) = load_import_template(source_path).await?;
        if template.cases.len() > 100 {
            return Err(AppError::InvalidBenchmark);
        }
        let mut copied_ids = Vec::new();
        let mut copied_bytes = 0_u64;
        let result = async {
            let mut cases = Vec::with_capacity(template.cases.len());
            for case in template.cases {
                let mut input_files = Vec::with_capacity(case.input_files.len());
                for file in case.input_files {
                    input_files.push(
                        self.copy_template_reference(
                            &root,
                            file,
                            &mut copied_ids,
                            &mut copied_bytes,
                        )
                        .await?,
                    );
                }
                let mut checks = Vec::with_capacity(case.checks.len());
                for check in case.checks {
                    checks.push(match check {
                        BenchmarkImportCheck::Answer { expected } => {
                            BenchmarkCheck::Answer { expected }
                        }
                        BenchmarkImportCheck::FileExists { path } => {
                            BenchmarkCheck::FileExists { path }
                        }
                        BenchmarkImportCheck::FileText { path, expected } => {
                            BenchmarkCheck::FileText { path, expected }
                        }
                        BenchmarkImportCheck::FileJson { path, expected } => {
                            BenchmarkCheck::FileJson { path, expected }
                        }
                        BenchmarkImportCheck::Python { script } => BenchmarkCheck::Python {
                            script: self
                                .copy_template_reference(
                                    &root,
                                    script,
                                    &mut copied_ids,
                                    &mut copied_bytes,
                                )
                                .await?,
                        },
                    });
                }
                cases.push(BenchmarkCase {
                    name: case.name,
                    prompt: case.prompt,
                    timeout_minutes: case.timeout_minutes,
                    input_files,
                    checks,
                });
            }
            self.save_draft(
                None,
                None,
                None,
                BenchmarkDocument {
                    schema_version: template.schema_version,
                    name: template.name,
                    description: template.description,
                    tag_id: Some(tag_id.to_string()),
                    source: template.source.or_else(|| {
                        root.file_name()
                            .and_then(|name| name.to_str())
                            .map(|name| format!("Imported from {name}"))
                    }),
                    cases,
                },
            )
            .await
        }
        .await;
        match result {
            Ok(draft) => Ok(draft),
            Err(error) => {
                // The import failure remains authoritative; rollback still attempts every asset.
                let _cleanup_result = remove_managed_files(
                    copied_ids
                        .into_iter()
                        .map(|asset_id| self.asset_directory.join(asset_id)),
                )
                .await;
                Err(error)
            }
        }
    }

    /// Copies one explicitly selected file into opaque application-owned storage.
    pub(crate) async fn import_asset(
        &self,
        source_path: PathBuf,
        path: &str,
    ) -> Result<BenchmarkFile, AppError> {
        if !safe_relative_path(path) {
            return Err(AppError::InvalidBenchmark);
        }
        let metadata = tokio::fs::symlink_metadata(&source_path)
            .await
            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_ASSET_BYTES
        {
            return Err(AppError::BenchmarkAssetUnavailable);
        }
        let canonical = tokio::fs::canonicalize(source_path)
            .await
            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        self.copy_managed_asset(&canonical, path).await
    }

    /// Stores text edits as a new immutable asset instead of mutating published content.
    pub(crate) async fn save_text_asset(
        &self,
        path: &str,
        text: &str,
    ) -> Result<BenchmarkFile, AppError> {
        if !safe_relative_path(path) || text.len() as u64 > MAX_ASSET_BYTES {
            return Err(AppError::InvalidBenchmark);
        }
        tokio::fs::create_dir_all(&self.asset_directory)
            .await
            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        let asset_id = new_id("asset")?;
        let staging = self.asset_directory.join(format!(".{asset_id}.tmp"));
        let destination = self.asset_directory.join(&asset_id);
        if tokio::fs::write(&staging, text.as_bytes()).await.is_err()
            || tokio::fs::rename(&staging, destination).await.is_err()
        {
            remove_managed_file(&staging).await?;
            return Err(AppError::BenchmarkAssetUnavailable);
        }
        Ok(BenchmarkFile {
            path: path.to_string(),
            asset_id,
        })
    }

    /// Returns a bounded preview and never exposes a managed filesystem path.
    pub(crate) async fn asset_preview(
        &self,
        asset_id: &str,
    ) -> Result<BenchmarkAssetPreview, AppError> {
        if !safe_asset_id(asset_id) {
            return Err(AppError::InvalidBenchmark);
        }
        let path = self.asset_directory.join(asset_id);
        let metadata = tokio::fs::symlink_metadata(&path)
            .await
            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_ASSET_BYTES
        {
            return Err(AppError::BenchmarkAssetUnavailable);
        }
        let bytes = tokio::fs::read(path)
            .await
            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        let truncated = bytes.len() > MAX_PREVIEW_BYTES;
        let prefix = &bytes[..bytes.len().min(MAX_PREVIEW_BYTES)];
        Ok(BenchmarkAssetPreview {
            asset_id: asset_id.to_string(),
            size_bytes: metadata.len(),
            text: std::str::from_utf8(prefix).ok().map(str::to_string),
            truncated,
        })
    }

    async fn copy_template_reference(
        &self,
        root: &std::path::Path,
        file: BenchmarkImportFile,
        copied_ids: &mut Vec<String>,
        copied_bytes: &mut u64,
    ) -> Result<BenchmarkFile, AppError> {
        let size = match inspect_template_file(root, &file).await {
            Ok(size) => size,
            Err(_) => {
                return Ok(BenchmarkFile {
                    path: file.path,
                    asset_id: String::new(),
                })
            }
        };
        if copied_bytes.saturating_add(size) > MAX_IMPORT_BYTES {
            return Ok(BenchmarkFile {
                path: file.path,
                asset_id: String::new(),
            });
        }
        let source = tokio::fs::canonicalize(root.join(&file.source))
            .await
            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        let managed = self.copy_managed_asset(&source, &file.path).await?;
        *copied_bytes += size;
        copied_ids.push(managed.asset_id.clone());
        Ok(managed)
    }

    async fn copy_managed_asset(
        &self,
        source: &std::path::Path,
        path: &str,
    ) -> Result<BenchmarkFile, AppError> {
        tokio::fs::create_dir_all(&self.asset_directory)
            .await
            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        let asset_id = new_id("asset")?;
        let staging = self.asset_directory.join(format!(".{asset_id}.tmp"));
        let destination = self.asset_directory.join(&asset_id);
        if tokio::fs::copy(source, &staging).await.is_err() {
            remove_managed_file(&staging).await?;
            return Err(AppError::BenchmarkAssetUnavailable);
        }
        if tokio::fs::rename(&staging, &destination).await.is_err() {
            remove_managed_file(&staging).await?;
            return Err(AppError::BenchmarkAssetUnavailable);
        }
        Ok(BenchmarkFile {
            path: path.to_string(),
            asset_id,
        })
    }

    /// Drafts may be incomplete but remain bounded and use the supported template format.
    pub(crate) async fn save_draft(
        &self,
        id: Option<String>,
        expected: Option<i64>,
        benchmark_id: Option<String>,
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
        let benchmark_id = match previous {
            Some(previous) => {
                if benchmark_id
                    .as_ref()
                    .is_some_and(|id| Some(id) != previous.benchmark_id.as_ref())
                {
                    return Err(AppError::InvalidBenchmark);
                }
                previous.benchmark_id
            }
            None => match benchmark_id {
                Some(benchmark_id) => {
                    let definition = self.detail(&benchmark_id, None).await?;
                    if definition.summary.author != "myself" || definition.summary.archived {
                        return Err(AppError::BenchmarkReadOnly);
                    }
                    if let Some(draft) = self
                        .repository
                        .draft_for_benchmark(&benchmark_id)
                        .await
                        .map_err(|_| AppError::BenchmarkDatabaseFailed)?
                    {
                        return Ok(draft);
                    }
                    Some(benchmark_id)
                }
                None => None,
            },
        };
        let draft = BenchmarkDraft {
            id: match id {
                Some(id) => id,
                None => new_id("draft")?,
            },
            benchmark_id,
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
            return Err(AppError::BenchmarkValidationFailed(issues));
        }
        let uses_python = draft.document.cases.iter().any(|case| {
            case.checks
                .iter()
                .any(|check| matches!(check, BenchmarkCheck::Python { .. }))
        });
        if uses_python {
            let verifier = self.verifier.clone();
            if !tokio::task::spawn_blocking(move || verifier.available())
                .await
                .map_err(|_| AppError::WorkerFailed)?
            {
                return Err(AppError::BenchmarkVerifierUnavailable);
            }
        }
        let mut script_issues = Vec::new();
        for (case_index, case) in draft.document.cases.iter().enumerate() {
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
            for (check_index, check) in case.checks.iter().enumerate() {
                if let BenchmarkCheck::Python { script } = check {
                    if !safe_asset_id(&script.asset_id) {
                        return Err(AppError::BenchmarkAssetUnavailable);
                    }
                    let metadata =
                        tokio::fs::symlink_metadata(self.asset_directory.join(&script.asset_id))
                            .await
                            .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
                    if !metadata.is_file() || metadata.file_type().is_symlink() {
                        return Err(AppError::BenchmarkAssetUnavailable);
                    }
                    let verifier = self.verifier.clone();
                    let script_path = self.asset_directory.join(&script.asset_id);
                    match tokio::task::spawn_blocking(move || verifier.validate(&script_path))
                        .await
                        .map_err(|_| AppError::WorkerFailed)?
                    {
                        Ok(()) => {}
                        Err(AppError::InvalidBenchmark) => {
                            script_issues.push(BenchmarkValidationIssue {
                                field: format!("cases.{case_index}.checks.{check_index}.script"),
                                code: "invalid_python",
                            });
                        }
                        Err(error) => return Err(error),
                    }
                }
            }
        }
        if !script_issues.is_empty() {
            return Err(AppError::BenchmarkValidationFailed(script_issues));
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

    /// Archives one personal definition without removing mounts, versions, or Task history.
    pub(crate) async fn archive(&self, id: &str) -> Result<BenchmarkDetail, AppError> {
        validate_id(id)?;
        let current = self.detail(id, None).await?;
        if current.summary.author != "myself" {
            return Err(AppError::BenchmarkReadOnly);
        }
        if !current.summary.archived
            && !self
                .repository
                .archive(id, now_ms()?)
                .await
                .map_err(|_| AppError::BenchmarkDatabaseFailed)?
        {
            return Err(AppError::BenchmarkConflict);
        }
        self.detail(id, None).await
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
                pinned_at_ms: None,
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

    /// Explicitly moves an existing mount to another version of the same definition.
    pub(crate) async fn update_mount(
        &self,
        workspace: &str,
        mount: &str,
        version: &str,
    ) -> Result<BenchmarkMount, AppError> {
        validate_id(workspace)?;
        validate_id(mount)?;
        validate_id(version)?;
        self.repository
            .update_mount(workspace, mount, version)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)
    }
    /// Pins or unpins one Workspace mount while preserving its selected version.
    pub(crate) async fn set_mount_pin(
        &self,
        workspace: &str,
        mount: &str,
        is_pinned: bool,
    ) -> Result<BenchmarkMount, AppError> {
        validate_id(workspace)?;
        validate_id(mount)?;
        let pinned_at_ms = if is_pinned { Some(now_ms()?) } else { None };
        self.repository
            .set_mount_pin(workspace, mount, pinned_at_ms)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)?
            .ok_or(AppError::BenchmarkNotFound)
    }
    /// Unmount changes only the workspace relationship.
    pub(crate) async fn unmount(&self, workspace: &str, id: &str) -> Result<(), AppError> {
        self.repository
            .unmount(workspace, id)
            .await
            .map_err(|_| AppError::BenchmarkDatabaseFailed)
    }
}

/// Treats an already-absent staging file as cleaned while surfacing real filesystem failures.
async fn remove_managed_file(path: &Path) -> Result<(), AppError> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(_) => Err(AppError::BenchmarkAssetUnavailable),
    }
}

/// Attempts every managed-file deletion and reports whether any cleanup failed.
async fn remove_managed_files(paths: impl IntoIterator<Item = PathBuf>) -> Result<(), AppError> {
    let mut first_error = None;
    for path in paths {
        if let Err(error) = remove_managed_file(&path).await {
            first_error.get_or_insert(error);
        }
    }
    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

async fn load_import_template(
    source_path: PathBuf,
) -> Result<(PathBuf, BenchmarkImportTemplate), AppError> {
    let source_metadata = tokio::fs::symlink_metadata(&source_path)
        .await
        .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    if !source_metadata.is_dir() || source_metadata.file_type().is_symlink() {
        return Err(AppError::BenchmarkAssetUnavailable);
    }
    let root = tokio::fs::canonicalize(source_path)
        .await
        .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    let manifest = root.join("benchmark.json");
    let manifest_metadata = tokio::fs::symlink_metadata(&manifest)
        .await
        .map_err(|_| AppError::InvalidBenchmark)?;
    if !manifest_metadata.is_file()
        || manifest_metadata.file_type().is_symlink()
        || manifest_metadata.len() > MAX_TEMPLATE_BYTES
    {
        return Err(AppError::InvalidBenchmark);
    }
    let contents = tokio::fs::read(manifest)
        .await
        .map_err(|_| AppError::InvalidBenchmark)?;
    let template = serde_json::from_slice(&contents).map_err(|_| AppError::InvalidBenchmark)?;
    Ok((root, template))
}

async fn inspect_template_file(
    root: &std::path::Path,
    file: &BenchmarkImportFile,
) -> Result<u64, &'static str> {
    if !safe_relative_path(&file.path) || !safe_relative_path(&file.source) {
        return Err("unsafe_path");
    }
    let source = root.join(&file.source);
    let metadata = tokio::fs::symlink_metadata(&source)
        .await
        .map_err(|_| "missing_file")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("unsafe_path");
    }
    if metadata.len() > MAX_ASSET_BYTES {
        return Err("file_too_large");
    }
    let canonical = tokio::fs::canonicalize(source)
        .await
        .map_err(|_| "missing_file")?;
    if !canonical.starts_with(root) {
        return Err("unsafe_path");
    }
    Ok(metadata.len())
}

fn preview_document(template: &BenchmarkImportTemplate) -> BenchmarkDocument {
    BenchmarkDocument {
        schema_version: template.schema_version,
        name: template.name.clone(),
        description: template.description.clone(),
        tag_id: Some("preview".to_string()),
        source: template.source.clone(),
        cases: template
            .cases
            .iter()
            .map(|case| BenchmarkCase {
                name: case.name.clone(),
                prompt: case.prompt.clone(),
                timeout_minutes: case.timeout_minutes,
                input_files: case.input_files.iter().map(preview_file).collect(),
                checks: case.checks.iter().map(preview_check).collect(),
            })
            .collect(),
    }
}

fn preview_file(file: &BenchmarkImportFile) -> BenchmarkFile {
    BenchmarkFile {
        path: file.path.clone(),
        asset_id: "pending".to_string(),
    }
}

fn preview_check(check: &BenchmarkImportCheck) -> BenchmarkCheck {
    match check {
        BenchmarkImportCheck::Answer { expected } => BenchmarkCheck::Answer {
            expected: expected.clone(),
        },
        BenchmarkImportCheck::FileExists { path } => {
            BenchmarkCheck::FileExists { path: path.clone() }
        }
        BenchmarkImportCheck::FileText { path, expected } => BenchmarkCheck::FileText {
            path: path.clone(),
            expected: expected.clone(),
        },
        BenchmarkImportCheck::FileJson { path, expected } => BenchmarkCheck::FileJson {
            path: path.clone(),
            expected: expected.clone(),
        },
        BenchmarkImportCheck::Python { script } => BenchmarkCheck::Python {
            script: preview_file(script),
        },
    }
}

fn validate_tag_fields(name: &str, icon: &str) -> Result<(), AppError> {
    if name.trim().is_empty()
        || name.trim().chars().count() > 40
        || icon.is_empty()
        || icon.len() > 80
        || !icon.bytes().all(|c| c.is_ascii_alphanumeric())
    {
        Err(AppError::InvalidBenchmark)
    } else {
        Ok(())
    }
}

fn validate_id(id: &str) -> Result<(), AppError> {
    if id.is_empty() || id.len() > 200 {
        Err(AppError::InvalidBenchmark)
    } else {
        Ok(())
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
    use super::{remove_managed_files, BenchmarkService};
    use crate::adapters::benchmark_verifier::{BenchmarkVerifier, SystemBenchmarkVerifier};
    use crate::db::{connection::connect_sqlite, migration::Migrator};
    use crate::domain::benchmark::{
        BenchmarkCase, BenchmarkCheck, BenchmarkDocument, BenchmarkFile,
    };
    use crate::domain::benchmark_task::BenchmarkEvaluationReport;
    use crate::domain::workspace::{NewWorkspace, WorkspaceSourceKind};
    use crate::error::AppError;
    use crate::repositories::benchmark::BenchmarkRepository;
    use crate::repositories::workspace::WorkspaceRepository;
    use sea_orm_migration::MigratorTrait;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;

    fn verifier() -> Arc<dyn BenchmarkVerifier> {
        Arc::new(SystemBenchmarkVerifier)
    }

    #[test]
    fn managed_file_cleanup_attempts_every_path_after_a_failure() {
        tauri::async_runtime::block_on(async {
            let root = std::env::temp_dir().join(format!(
                "theoria-benchmark-cleanup-{}-{}",
                std::process::id(),
                super::IDENTIFIER_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            let undeletable_as_file = root.join("directory");
            let later_file = root.join("later-file");
            std::fs::create_dir_all(&undeletable_as_file).expect("directory fixture");
            std::fs::write(&later_file, "fixture").expect("file fixture");

            let result = remove_managed_files([undeletable_as_file, later_file.clone()]).await;
            let later_file_exists = later_file.exists();
            std::fs::remove_dir_all(root).expect("fixture cleanup");

            assert_eq!(result, Err(AppError::BenchmarkAssetUnavailable));
            assert!(
                !later_file_exists,
                "cleanup must continue after one failure"
            );
        });
    }

    #[derive(Debug)]
    struct RejectingVerifier;

    impl BenchmarkVerifier for RejectingVerifier {
        fn available(&self) -> bool {
            true
        }

        fn validate(&self, _script: &Path) -> Result<(), AppError> {
            Err(AppError::InvalidBenchmark)
        }

        fn evaluate(
            &self,
            _script: &Path,
            _workspace: &Path,
        ) -> Result<BenchmarkEvaluationReport, AppError> {
            unreachable!("publication must not execute validators")
        }
    }

    #[test]
    fn incomplete_draft_is_saved_but_cannot_be_published() {
        tauri::async_runtime::block_on(async {
            let database = connect_sqlite("sqlite::memory:")
                .await
                .expect("database should open");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let service = BenchmarkService::new(
                BenchmarkRepository::new(database.clone()),
                PathBuf::new(),
                verifier(),
            );
            let draft = service
                .save_draft(
                    None,
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
            let error = service
                .publish(&draft.id, draft.revision)
                .await
                .expect_err("incomplete draft must not publish");
            let AppError::BenchmarkValidationFailed(issues) = error else {
                panic!("publication should preserve validation issues");
            };
            assert!(issues
                .iter()
                .any(|issue| issue.field == "name" && issue.code == "invalid_name"));
            assert!(issues
                .iter()
                .any(|issue| issue.field == "cases" && issue.code == "invalid_case_count"));
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
    fn editing_a_benchmark_reopens_its_existing_draft() {
        tauri::async_runtime::block_on(async {
            let database = connect_sqlite("sqlite::memory:")
                .await
                .expect("database should open");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let service = BenchmarkService::new(
                BenchmarkRepository::new(database.clone()),
                PathBuf::new(),
                verifier(),
            );
            let tag = service.create_tag("Code", "Code").await.expect("tag");
            let document = BenchmarkDocument {
                schema_version: 1,
                name: "Personal suite".to_string(),
                description: "Editable benchmark".to_string(),
                tag_id: Some(tag.id),
                source: None,
                cases: vec![BenchmarkCase {
                    name: "One".to_string(),
                    prompt: "Return 42".to_string(),
                    timeout_minutes: 1,
                    input_files: Vec::new(),
                    checks: vec![BenchmarkCheck::Answer {
                        expected: "42".to_string(),
                    }],
                }],
            };
            let initial = service
                .save_draft(None, None, None, document.clone())
                .await
                .expect("initial draft");
            let published = service
                .publish(&initial.id, initial.revision)
                .await
                .expect("published benchmark");
            let mut edited_document = document.clone();
            edited_document.cases[0].prompt = "Return forty-two".to_string();
            let existing = service
                .save_draft(
                    None,
                    None,
                    Some(published.summary.id.clone()),
                    edited_document.clone(),
                )
                .await
                .expect("linked draft");

            let reopened = service
                .save_draft(None, None, Some(published.summary.id), document)
                .await
                .expect("existing linked draft should reopen");

            assert_eq!(reopened.id, existing.id);
            assert_eq!(reopened.revision, existing.revision);
            assert_eq!(reopened.document, edited_document);
            database.close().await.expect("database should close");
        });
    }

    #[test]
    fn publication_reports_the_exact_invalid_python_check() {
        tauri::async_runtime::block_on(async {
            let database = connect_sqlite("sqlite::memory:")
                .await
                .expect("database should open");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let root = std::env::temp_dir().join(format!(
                "theoria-benchmark-publish-{}-{}",
                std::process::id(),
                super::IDENTIFIER_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir_all(root.join("benchmark-assets")).expect("asset directory");
            std::fs::write(
                root.join("benchmark-assets/asset-script"),
                "def other(workspace):\n    return {}\n",
            )
            .expect("script fixture");
            let service = BenchmarkService::new(
                BenchmarkRepository::new(database.clone()),
                root.clone(),
                Arc::new(RejectingVerifier),
            );
            let tag = service.create_tag("Python", "Code").await.expect("tag");
            let draft = service
                .save_draft(
                    None,
                    None,
                    None,
                    BenchmarkDocument {
                        schema_version: 1,
                        name: "Python suite".to_string(),
                        description: "Validate output".to_string(),
                        tag_id: Some(tag.id),
                        source: None,
                        cases: vec![BenchmarkCase {
                            name: "One".to_string(),
                            prompt: "Create a report".to_string(),
                            timeout_minutes: 5,
                            input_files: Vec::new(),
                            checks: vec![BenchmarkCheck::Python {
                                script: BenchmarkFile {
                                    path: "validator.py".to_string(),
                                    asset_id: "asset-script".to_string(),
                                },
                            }],
                        }],
                    },
                )
                .await
                .expect("draft");

            let AppError::BenchmarkValidationFailed(issues) = service
                .publish(&draft.id, draft.revision)
                .await
                .expect_err("invalid Python must not publish")
            else {
                panic!("invalid Python should return field-addressable validation");
            };
            assert_eq!(issues.len(), 1);
            assert_eq!(issues[0].field, "cases.0.checks.0.script");
            assert_eq!(issues[0].code, "invalid_python");

            std::fs::remove_dir_all(root).expect("fixture cleanup");
            database.close().await.expect("database should close");
        });
    }
    #[test]
    fn publishes_complete_cases_and_mounts_one_fixed_version() {
        tauri::async_runtime::block_on(async {
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
            let service = BenchmarkService::new(
                BenchmarkRepository::new(database.clone()),
                PathBuf::new(),
                verifier(),
            );
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
                .save_draft(None, None, None, document.clone())
                .await
                .expect("draft should save");
            let saved = service
                .save_draft(Some(draft.id.clone()), Some(1), None, document.clone())
                .await
                .expect("current revision should save");
            assert_eq!(saved.revision, 2);
            assert_eq!(
                service
                    .save_draft(Some(draft.id.clone()), Some(1), None, document.clone())
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
            let mut updated_document = document.clone();
            updated_document.cases[0].prompt = "Return forty-two".to_string();
            let update_draft = service
                .save_draft(
                    None,
                    None,
                    Some(published.summary.id.clone()),
                    updated_document.clone(),
                )
                .await
                .expect("personal definition should be editable");
            assert_eq!(
                update_draft.benchmark_id.as_deref(),
                Some(published.summary.id.as_str())
            );
            let updated = service
                .publish(&update_draft.id, update_draft.revision)
                .await
                .expect("edit should publish a new version");
            assert_eq!(updated.summary.id, published.summary.id);
            assert_eq!(updated.version_number, 2);
            assert_eq!(updated.document, updated_document);
            let mut plain = document;
            plain.name = "Plain suite".to_string();
            let other = service
                .save_draft(None, None, None, plain)
                .await
                .expect("second draft should save");
            let other_published = service
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
            let other_mount = service
                .mount(
                    "workspace-1".to_string(),
                    other_published.summary.id,
                    other_published.version_id,
                )
                .await
                .expect("second version should mount");
            let pinned = service
                .set_mount_pin("workspace-1", &mounted.id, true)
                .await
                .expect("mount should pin");
            assert!(pinned.pinned_at_ms.is_some());
            assert_eq!(
                service
                    .mounts("workspace-1", 0)
                    .await
                    .expect("pinned mounts should list first")[0]
                    .id,
                mounted.id
            );
            let updated_mount = service
                .update_mount("workspace-1", &mounted.id, &updated.version_id)
                .await
                .expect("mount should update explicitly");
            assert_eq!(updated_mount.version_id, updated.version_id);
            assert_eq!(
                service
                    .mounts("workspace-1", 0)
                    .await
                    .expect("mounts should list")
                    .len(),
                2
            );
            service
                .unmount("workspace-1", &mounted.id)
                .await
                .expect("mount should detach");
            service
                .unmount("workspace-1", &other_mount.id)
                .await
                .expect("second mount should detach");
            assert!(service
                .mounts("workspace-1", 0)
                .await
                .expect("mounts should list")
                .is_empty());
            let historical = service
                .detail(&published.summary.id, Some(&published.version_id))
                .await
                .expect("published version must remain");
            assert_eq!(historical.version_id, published.version_id);
            assert_eq!(historical.version_number, published.version_number);
            assert_eq!(historical.document.cases, published.document.cases);
            let archived = service
                .archive(&published.summary.id)
                .await
                .expect("personal benchmark should archive");
            assert!(archived.summary.archived);
            assert!(service
                .list("", &[], None, "newest", 0)
                .await
                .expect("catalog")
                .iter()
                .all(|item| item.id != published.summary.id));
            assert_eq!(
                service
                    .mount(
                        "workspace-1".to_string(),
                        published.summary.id.clone(),
                        updated.version_id,
                    )
                    .await,
                Err(AppError::BenchmarkReadOnly)
            );
            database.close().await.expect("database should close");
        });
    }

    #[test]
    fn imports_a_theoria_folder_and_copies_every_referenced_asset() {
        tauri::async_runtime::block_on(async {
            let database = connect_sqlite("sqlite::memory:")
                .await
                .expect("database should open");
            Migrator::up(&database, None)
                .await
                .expect("schema should initialize");
            let root = std::env::temp_dir().join(format!(
                "theoria-benchmark-import-{}-{}",
                std::process::id(),
                super::IDENTIFIER_SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            let source = root.join("source");
            let storage = root.join("storage");
            std::fs::create_dir_all(source.join("files")).expect("source directory");
            std::fs::write(source.join("files/input.txt"), "fixture input").expect("input file");
            std::fs::write(source.join("validator.py"), "print('validator')").expect("validator");
            std::fs::write(
                source.join("benchmark.json"),
                serde_json::to_vec_pretty(&serde_json::json!({
                    "schemaVersion": 1,
                    "name": "Imported suite",
                    "description": "Imported from a portable template",
                    "source": "fixture-suite",
                    "cases": [{
                        "name": "One",
                        "prompt": "Create output.json",
                        "timeoutMinutes": 5,
                        "inputFiles": [{"path": "input.txt", "source": "files/input.txt"}],
                        "checks": [
                            {"kind": "file_json", "path": "output.json", "expected": "{\"ok\":true}"},
                            {"kind": "python", "script": {"path": "validator.py", "source": "validator.py"}}
                        ]
                    }]
                }))
                .expect("template JSON"),
            )
            .expect("template file");
            let service = BenchmarkService::new(
                BenchmarkRepository::new(database.clone()),
                storage.clone(),
                verifier(),
            );
            let tag = service.create_tag("Imported", "Folder").await.expect("tag");

            let preview = service
                .preview_import(source.clone())
                .await
                .expect("preview");
            assert_eq!(preview.name, "Imported suite");
            assert_eq!(preview.file_count, 2);
            assert!(preview.issues.is_empty());
            let draft = service
                .import_folder(source.clone(), &tag.id)
                .await
                .expect("import");
            assert_eq!(draft.document.tag_id, Some(tag.id));
            assert_eq!(draft.document.cases[0].input_files.len(), 1);
            let input = &draft.document.cases[0].input_files[0];
            assert_eq!(input.path, "input.txt");
            assert_eq!(
                std::fs::read_to_string(storage.join("benchmark-assets").join(&input.asset_id))
                    .expect("managed input"),
                "fixture input"
            );
            let asset = service
                .import_asset(source.join("files/input.txt"), "copy.txt")
                .await
                .expect("single file import");
            let asset_preview = service
                .asset_preview(&asset.asset_id)
                .await
                .expect("asset preview");
            assert_eq!(asset_preview.text.as_deref(), Some("fixture input"));
            let edited = service
                .save_text_asset("copy.txt", "edited fixture")
                .await
                .expect("edited asset");
            assert_ne!(edited.asset_id, asset.asset_id);
            assert_eq!(
                service
                    .asset_preview(&edited.asset_id)
                    .await
                    .expect("edited preview")
                    .text
                    .as_deref(),
                Some("edited fixture")
            );

            database.close().await.expect("database should close");
            std::fs::remove_dir_all(root).expect("temporary import should be removed");
        });
    }
}
