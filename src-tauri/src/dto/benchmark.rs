use crate::domain::benchmark::{
    BenchmarkDetail, BenchmarkDocument, BenchmarkDraft, BenchmarkMount, BenchmarkSummary,
    BenchmarkTag,
};
use serde::{Deserialize, Serialize};

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
    /// Whether this immutable fallback tag is owned by the application.
    is_system: bool,
}
impl From<BenchmarkTag> for BenchmarkTagResponse {
    fn from(value: BenchmarkTag) -> Self {
        Self {
            id: value.id,
            name: value.name,
            icon: value.icon,
            is_system: value.is_system,
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
            created_at_ms: value.created_at_ms,
        }
    }
}

/// Editor save command; an existing draft requires its exact revision.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SaveBenchmarkDraftRequest {
    /// Existing draft or absent for a new document.
    pub(crate) draft_id: Option<String>,
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
    /// Optional local classification filter.
    pub(crate) tag_id: Option<String>,
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
