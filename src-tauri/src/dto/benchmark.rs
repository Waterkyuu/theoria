use crate::domain::benchmark::{
    BenchmarkAssetPreview, BenchmarkDetail, BenchmarkDocument, BenchmarkDraft, BenchmarkFile,
    BenchmarkImportPreview, BenchmarkImportPreviewCase, BenchmarkMount, BenchmarkSummary,
    BenchmarkTag,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Explicit catalog response exposed to the local frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkTagResponse {
    /// Stable local classification identifier.
    id: String,
    /// Display name of the classification.
    name: String,
    /// Gravity icon export name.
    icon: String,
}
impl From<BenchmarkTag> for BenchmarkTagResponse {
    fn from(value: BenchmarkTag) -> Self {
        Self {
            id: value.id,
            name: value.name,
            icon: value.icon,
        }
    }
}

/// Explicit catalog response exposed to the local frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkDraftResponse {
    /// Stable editor draft identifier.
    id: String,
    /// Published definition being edited, when present.
    benchmark_id: Option<String>,
    /// Optimistic concurrency revision.
    revision: i64,
    /// Editable definition including incomplete cases.
    document: BenchmarkDocument,
    /// Last save time in UTC milliseconds.
    updated_at_ms: i64,
}
impl From<BenchmarkDraft> for BenchmarkDraftResponse {
    fn from(value: BenchmarkDraft) -> Self {
        Self {
            id: value.id,
            benchmark_id: value.benchmark_id,
            revision: value.revision,
            document: value.document,
            updated_at_ms: value.updated_at_ms,
        }
    }
}

/// Explicit catalog response exposed to the local frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkSummaryResponse {
    /// Stable definition identifier.
    id: String,
    /// Current catalog title.
    name: String,
    /// Current catalog description.
    description: String,
    /// Exactly one local classification.
    tag_id: String,
    /// Platform or myself, assigned by the application.
    author: String,
    /// Optional source attribution.
    source: Option<String>,
    /// Whether new mounts are disabled.
    archived: bool,
    /// Latest published immutable version.
    version_id: String,
    /// Monotonic content version number.
    version_number: i64,
    /// Number of cases in the latest version.
    case_count: i64,
    /// Definition creation time in UTC milliseconds.
    created_at_ms: i64,
}
impl From<BenchmarkSummary> for BenchmarkSummaryResponse {
    fn from(value: BenchmarkSummary) -> Self {
        Self {
            id: value.id,
            name: value.name,
            description: value.description,
            tag_id: value.tag_id,
            author: value.author,
            source: value.source,
            archived: value.archived,
            version_id: value.version_id,
            version_number: value.version_number,
            case_count: value.case_count,
            created_at_ms: value.created_at_ms,
        }
    }
}

/// Explicit catalog response exposed to the local frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkDetailResponse {
    /// Current catalog metadata.
    summary: BenchmarkSummaryResponse,
    /// Version explicitly selected for this detail.
    version_id: String,
    /// Selected content version number.
    version_number: i64,
    /// Immutable case content with current display metadata.
    document: BenchmarkDocument,
}
impl From<BenchmarkDetail> for BenchmarkDetailResponse {
    fn from(value: BenchmarkDetail) -> Self {
        Self {
            summary: value.summary.into(),
            version_id: value.version_id,
            version_number: value.version_number,
            document: value.document,
        }
    }
}

/// Explicit catalog response exposed to the local frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkMountResponse {
    /// Stable mount identifier.
    id: String,
    /// Workspace owning the mount.
    workspace_id: String,
    /// Mounted benchmark definition.
    benchmark_id: String,
    /// Explicitly pinned content version.
    version_id: String,
    /// Optional pin time used by Workspace navigation ordering.
    pinned_at_ms: Option<i64>,
    /// Mount creation time in UTC milliseconds.
    created_at_ms: i64,
}
impl From<BenchmarkMount> for BenchmarkMountResponse {
    fn from(value: BenchmarkMount) -> Self {
        Self {
            id: value.id,
            workspace_id: value.workspace_id,
            benchmark_id: value.benchmark_id,
            version_id: value.version_id,
            pinned_at_ms: value.pinned_at_ms,
            created_at_ms: value.created_at_ms,
        }
    }
}

/// Managed file reference returned after an explicit picker selection is copied.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkFileResponse {
    /// Portable destination inside the isolated Case directory.
    pub(crate) path: String,
    /// Opaque managed identifier stored in the draft.
    pub(crate) asset_id: String,
}

impl From<BenchmarkFile> for BenchmarkFileResponse {
    fn from(value: BenchmarkFile) -> Self {
        Self {
            path: value.path,
            asset_id: value.asset_id,
        }
    }
}

/// Safe bounded content returned by the managed-asset preview endpoint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkAssetPreviewResponse {
    /// Opaque managed identifier requested by the caller.
    pub(crate) asset_id: String,
    /// Complete file size before preview truncation.
    pub(crate) size_bytes: u64,
    /// UTF-8 prefix, or absent for binary content.
    pub(crate) text: Option<String>,
    /// Whether bytes after the returned prefix were omitted.
    pub(crate) truncated: bool,
}

impl From<BenchmarkAssetPreview> for BenchmarkAssetPreviewResponse {
    fn from(value: BenchmarkAssetPreview) -> Self {
        Self {
            asset_id: value.asset_id,
            size_bytes: value.size_bytes,
            text: value.text,
            truncated: value.truncated,
        }
    }
}

/// One Case row in a folder import preview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkImportPreviewCaseResponse {
    /// Case title from the portable template.
    pub(crate) name: String,
    /// Configured execution deadline.
    pub(crate) timeout_minutes: u32,
    /// Number of public input files for this Case.
    pub(crate) input_file_count: usize,
    /// Stable check discriminants without verifier content.
    pub(crate) check_kinds: Vec<String>,
}

impl From<BenchmarkImportPreviewCase> for BenchmarkImportPreviewCaseResponse {
    fn from(value: BenchmarkImportPreviewCase) -> Self {
        Self {
            name: value.name,
            timeout_minutes: value.timeout_minutes,
            input_file_count: value.input_file_count,
            check_kinds: value.check_kinds,
        }
    }
}

/// Folder summary returned before the user chooses a local Tag and confirms import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkImportPreviewResponse {
    /// Proposed catalog name.
    pub(crate) name: String,
    /// Proposed catalog description.
    pub(crate) description: String,
    /// Optional external attribution.
    pub(crate) source: Option<String>,
    /// Bounded Case summaries in template order.
    pub(crate) cases: Vec<BenchmarkImportPreviewCaseResponse>,
    /// Total public inputs and private verifier files.
    pub(crate) file_count: usize,
    /// Field-addressable problems retained for draft repair.
    pub(crate) issues: Vec<crate::domain::benchmark::BenchmarkValidationIssue>,
}

impl From<BenchmarkImportPreview> for BenchmarkImportPreviewResponse {
    fn from(value: BenchmarkImportPreview) -> Self {
        Self {
            name: value.name,
            description: value.description,
            source: value.source,
            cases: value.cases.into_iter().map(Into::into).collect(),
            file_count: value.file_count,
            issues: value.issues,
        }
    }
}

/// Editor save command; an existing draft requires its exact revision.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveBenchmarkDraftRequest {
    /// Existing draft or absent for a new document.
    pub(crate) draft_id: Option<String>,
    /// Personal published definition to update, only when creating a new draft.
    pub(crate) benchmark_id: Option<String>,
    /// Revision currently displayed by the editor.
    pub(crate) expected_revision: Option<i64>,
    /// Complete editable template.
    pub(crate) document: BenchmarkDocument,
}
/// Catalog search parameters bounded by the service.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ListBenchmarksRequest {
    /// Name and description search.
    pub(crate) search: String,
    /// Selected classification filters, combined with OR.
    pub(crate) tag_ids: Vec<String>,
    /// Explicit catalog ordering.
    pub(crate) sort: String,
    /// Optional platform or myself filter.
    pub(crate) author: Option<String>,
    /// Zero-based page in newest-first order.
    pub(crate) page: u32,
}
/// Required revision prevents publishing stale editor content.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PublishBenchmarkRequest {
    /// Saved draft to publish.
    pub(crate) draft_id: String,
    /// Revision reviewed by the user.
    pub(crate) expected_revision: i64,
}
/// Pins a specific published version in a workspace.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MountBenchmarkRequest {
    /// Workspace selected by the user.
    pub(crate) workspace_id: String,
    /// Published definition to mount.
    pub(crate) benchmark_id: String,
    /// Explicit version shown by the caller.
    pub(crate) version_id: String,
}

/// Typed request validated by the Benchmark application service.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CreateBenchmarkTagRequest {
    /// User-visible classification name.
    pub(crate) name: String,
    /// Selected Gravity icon export.
    pub(crate) icon: String,
}

/// Archives one published personal Benchmark definition.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ArchiveBenchmarkRequest {
    /// Personal published definition to hide from the default catalog.
    pub(crate) benchmark_id: String,
}

/// Explicitly changes the immutable version pinned by one existing mount.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct UpdateBenchmarkMountRequest {
    /// Workspace that owns the existing mount.
    pub(crate) workspace_id: String,
    /// Existing mount whose pinned version changes.
    pub(crate) mount_id: String,
    /// Immutable published version selected by the user.
    pub(crate) version_id: String,
}

/// Changes whether one Benchmark mount is ordered above ordinary mounts.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SetBenchmarkMountPinRequest {
    /// Workspace that owns the existing mount.
    pub(crate) workspace_id: String,
    /// Existing mount whose pin state changes.
    pub(crate) mount_id: String,
    /// Whether the mount should appear in the pinned group.
    pub(crate) is_pinned: bool,
}

/// Typed request validated by the Benchmark application service.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GetBenchmarkDraftRequest {
    /// Saved editor document identifier.
    pub(crate) draft_id: String,
}

/// Typed request validated by the Benchmark application service.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ListBenchmarkDraftsRequest {
    /// Zero-based page of personal drafts.
    pub(crate) page: u32,
}

/// Typed request validated by the Benchmark application service.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GetBenchmarkRequest {
    /// Published definition identifier.
    pub(crate) benchmark_id: String,
    /// Selected version or latest when absent.
    pub(crate) version_id: Option<String>,
}

/// Typed request validated by the Benchmark application service.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ListWorkspaceBenchmarksRequest {
    /// Workspace whose mounts are listed.
    pub(crate) workspace_id: String,
    /// Zero-based mount page.
    pub(crate) page: u32,
}

/// Typed request validated by the Benchmark application service.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct UnmountBenchmarkRequest {
    /// Workspace owning the relationship.
    pub(crate) workspace_id: String,
    /// Relationship to remove without deleting results.
    pub(crate) mount_id: String,
}

/// Opens a Theoria template folder without creating persistence.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreviewBenchmarkImportRequest {
    /// Folder explicitly selected by the native picker.
    pub(crate) source_path: PathBuf,
}

/// Copies one recognized template folder into a tagged MySelf draft.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ImportBenchmarkFolderRequest {
    /// Folder previously shown in the import preview.
    pub(crate) source_path: PathBuf,
    /// Local non-system classification selected before import.
    pub(crate) tag_id: String,
}

/// Copies one explicitly selected regular file into managed Benchmark storage.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ImportBenchmarkAssetRequest {
    /// Regular file explicitly selected by the native picker.
    pub(crate) source_path: PathBuf,
    /// Portable destination used inside a Case workspace.
    pub(crate) path: String,
}

/// Stores an edited UTF-8 file as a new immutable managed asset.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveBenchmarkTextAssetRequest {
    /// Portable destination used inside a Case workspace.
    pub(crate) path: String,
    /// Complete UTF-8 file content from the bounded editor.
    pub(crate) text: String,
}

/// Reads a bounded preview from one opaque managed asset identifier.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreviewBenchmarkAssetRequest {
    /// Opaque identifier returned by a prior managed import.
    pub(crate) asset_id: String,
}

/// Opens a managed document with an application explicitly selected by the user.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OpenBenchmarkAssetRequest {
    /// Opaque identifier returned by a prior managed import.
    pub(crate) asset_id: String,
    /// Application selected through the native file picker.
    pub(crate) application_path: PathBuf,
}

/// Portable root document stored as `benchmark.json` in a Theoria template folder.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BenchmarkImportTemplate {
    /// Portable format version understood by this application.
    pub(crate) schema_version: u32,
    /// Proposed catalog title, defaulted for field-level preview validation.
    #[serde(default)]
    pub(crate) name: String,
    /// Proposed purpose, defaulted for field-level preview validation.
    #[serde(default)]
    pub(crate) description: String,
    /// Optional attribution retained by the imported draft.
    pub(crate) source: Option<String>,
    /// Independent Cases in display order.
    #[serde(default)]
    pub(crate) cases: Vec<BenchmarkImportCase>,
}

/// Portable Case whose file sources are relative to the selected template root.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BenchmarkImportCase {
    /// Case title, unique after publication.
    #[serde(default)]
    pub(crate) name: String,
    /// Complete request sent to every selected Agent.
    #[serde(default)]
    pub(crate) prompt: String,
    /// Execution deadline in minutes.
    #[serde(default)]
    pub(crate) timeout_minutes: u32,
    /// Public files copied into this Case workspace.
    #[serde(default)]
    pub(crate) input_files: Vec<BenchmarkImportFile>,
    /// Private grading criteria evaluated after execution.
    #[serde(default)]
    pub(crate) checks: Vec<BenchmarkImportCheck>,
}

/// Separates the execution path from the portable source path copied at import time.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BenchmarkImportFile {
    /// Portable destination path used by the Case or verifier.
    #[serde(default)]
    pub(crate) path: String,
    /// Portable path relative to the selected template root.
    #[serde(default)]
    pub(crate) source: String,
}

/// Supported V1 checks without application-assigned asset identifiers.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum BenchmarkImportCheck {
    Answer {
        /// Expected final answer after edge-whitespace trimming.
        #[serde(default)]
        expected: String,
    },
    FileExists {
        /// Required output path relative to the Case workspace.
        #[serde(default)]
        path: String,
    },
    FileText {
        /// Output text file relative to the Case workspace.
        #[serde(default)]
        path: String,
        /// Exact expected UTF-8 content.
        #[serde(default)]
        expected: String,
    },
    FileJson {
        /// Output JSON file relative to the Case workspace.
        #[serde(default)]
        path: String,
        /// Serialized JSON compared structurally.
        #[serde(default)]
        expected: String,
    },
    Python {
        /// Private validator copied separately from public Case inputs.
        script: BenchmarkImportFile,
    },
}

impl BenchmarkImportCheck {
    pub(crate) fn kind(&self) -> &'static str {
        match self {
            Self::Answer { .. } => "answer",
            Self::FileExists { .. } => "file_exists",
            Self::FileText { .. } => "file_text",
            Self::FileJson { .. } => "file_json",
            Self::Python { .. } => "python",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::BenchmarkMountResponse;
    use crate::domain::benchmark::BenchmarkMount;

    #[test]
    fn serializes_mount_pin_state_for_workspace_navigation() {
        let response = BenchmarkMountResponse::from(BenchmarkMount {
            id: "mount-1".to_string(),
            workspace_id: "workspace-1".to_string(),
            benchmark_id: "benchmark-1".to_string(),
            version_id: "version-1".to_string(),
            pinned_at_ms: Some(42),
            created_at_ms: 1,
        });

        assert_eq!(
            serde_json::to_value(response).expect("mount response should serialize")["pinnedAtMs"],
            42
        );
    }
}
