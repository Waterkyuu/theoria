use crate::error::AppError;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

const MAX_TEXT_DIFF_BYTES: u64 = 1024 * 1024;

/// Persisted artifact locations and file counters for one Agent Execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CollectedChanges {
    /// Text patch path relative to application data.
    pub(crate) changes_relative_path: String,
    /// Machine-readable summary path relative to application data.
    pub(crate) summary_relative_path: String,
    /// Added file count.
    pub(crate) added: usize,
    /// Modified file count.
    pub(crate) modified: usize,
    /// Deleted file count.
    pub(crate) deleted: usize,
}

/// Compares every Execution against its Task's one frozen Baseline.
#[derive(Debug, Clone)]
pub(crate) struct ResultCollector {
    /// Root directory owning Baselines, Executions, and result artifacts.
    app_data_directory: PathBuf,
}

impl ResultCollector {
    /// Creates a collector rooted in application-owned storage.
    pub(crate) fn new(app_data_directory: PathBuf) -> Self {
        Self { app_data_directory }
    }

    /// Saves one Execution's file changes relative to the common Baseline.
    pub(crate) async fn collect(
        &self,
        task_id: &str,
        task_agent_id: &str,
        baseline_relative_path: &Path,
        execution_relative_path: &Path,
    ) -> Result<CollectedChanges, AppError> {
        if !is_portable_segment(task_id) || !is_portable_segment(task_agent_id) {
            return Err(AppError::TaskResultFailed);
        }
        let app_data_directory = self.app_data_directory.clone();
        let task_id = task_id.to_string();
        let task_agent_id = task_agent_id.to_string();
        let baseline_relative_path = baseline_relative_path.to_path_buf();
        let execution_relative_path = execution_relative_path.to_path_buf();
        tokio::task::spawn_blocking(move || {
            collect_changes(
                &app_data_directory,
                &task_id,
                &task_agent_id,
                &baseline_relative_path,
                &execution_relative_path,
            )
        })
        .await
        .map_err(|_| AppError::TaskResultFailed)?
    }
}

/// One regular file used for bounded content comparison.
#[derive(Debug, Clone)]
struct FileEntry {
    /// Absolute file location.
    path: PathBuf,
    /// File size used for binary summaries and a fast inequality check.
    size: u64,
}

/// Machine-readable file change saved beside the text patch.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileChangeSummary {
    /// Path relative to both Baseline and Execution.
    path: String,
    /// Added, modified, or deleted.
    change: &'static str,
    /// True when a bounded UTF-8 text diff is unavailable.
    binary: bool,
    /// Final size for added or modified files and original size for deleted files.
    size: u64,
    /// Retained Execution artifact path for non-deleted files.
    artifact_relative_path: Option<String>,
}

/// Summary document consumed by Agent Panels and file result views.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangesSummary {
    /// Added file count.
    added: usize,
    /// Modified file count.
    modified: usize,
    /// Deleted file count.
    deleted: usize,
    /// Stable path-ordered changes.
    files: Vec<FileChangeSummary>,
}

/// Collects one deterministic Baseline-to-Execution result artifact set.
fn collect_changes(
    app_data_directory: &Path,
    task_id: &str,
    task_agent_id: &str,
    baseline_relative_path: &Path,
    execution_relative_path: &Path,
) -> Result<CollectedChanges, AppError> {
    let baseline = app_data_directory.join(baseline_relative_path);
    let execution = app_data_directory.join(execution_relative_path);
    if !baseline.is_dir() || !execution.is_dir() {
        return Err(AppError::TaskResultFailed);
    }
    let baseline_files = collect_regular_files(&baseline)?;
    let execution_files = collect_regular_files(&execution)?;
    let paths = baseline_files
        .keys()
        .chain(execution_files.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut patch = String::new();
    let mut files = Vec::new();
    let mut added = 0;
    let mut modified = 0;
    let mut deleted = 0;
    for relative_path in paths {
        let before = baseline_files.get(&relative_path);
        let after = execution_files.get(&relative_path);
        let change = match (before, after) {
            (None, Some(_)) => {
                added += 1;
                "added"
            }
            (Some(_), None) => {
                deleted += 1;
                "deleted"
            }
            (Some(before), Some(after)) if !files_equal(before, after)? => {
                modified += 1;
                "modified"
            }
            _ => continue,
        };
        let display_path = display_relative_path(&relative_path);
        let before_text = before.map(read_bounded_text).transpose()?.flatten();
        let after_text = after.map(read_bounded_text).transpose()?.flatten();
        let binary = before.is_some_and(|_| before_text.is_none())
            || after.is_some_and(|_| after_text.is_none());
        append_patch(
            &mut patch,
            &display_path,
            change,
            before_text.as_deref(),
            after_text.as_deref(),
            binary,
        );
        let final_entry = after.or(before).ok_or(AppError::TaskResultFailed)?;
        let artifact_relative_path = after
            .map(|_| execution_relative_path.join(&relative_path))
            .map(|path| display_relative_path(&path));
        files.push(FileChangeSummary {
            path: display_path,
            change,
            binary,
            size: final_entry.size,
            artifact_relative_path,
        });
    }
    let summary = ChangesSummary {
        added,
        modified,
        deleted,
        files,
    };
    let result_relative = PathBuf::from("task-runs")
        .join(task_id)
        .join("results")
        .join(task_agent_id);
    let result_directory = app_data_directory.join(&result_relative);
    fs::create_dir_all(&result_directory).map_err(|_| AppError::TaskResultFailed)?;
    let changes_relative_path = result_relative.join("changes.patch");
    let summary_relative_path = result_relative.join("summary.json");
    fs::write(app_data_directory.join(&changes_relative_path), patch)
        .map_err(|_| AppError::TaskResultFailed)?;
    let summary_json =
        serde_json::to_vec_pretty(&summary).map_err(|_| AppError::TaskResultFailed)?;
    fs::write(
        app_data_directory.join(&summary_relative_path),
        summary_json,
    )
    .map_err(|_| AppError::TaskResultFailed)?;

    Ok(CollectedChanges {
        changes_relative_path: display_relative_path(&changes_relative_path),
        summary_relative_path: display_relative_path(&summary_relative_path),
        added,
        modified,
        deleted,
    })
}

/// Walks user-visible files while excluding isolated Git and Claude compatibility metadata.
fn collect_regular_files(root: &Path) -> Result<BTreeMap<PathBuf, FileEntry>, AppError> {
    let mut files = BTreeMap::new();
    collect_directory(root, root, &mut files)?;
    Ok(files)
}

/// Recursively records regular files without following runtime-created links.
fn collect_directory(
    root: &Path,
    directory: &Path,
    files: &mut BTreeMap<PathBuf, FileEntry>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(directory).map_err(|_| AppError::TaskResultFailed)? {
        let entry = entry.map_err(|_| AppError::TaskResultFailed)?;
        let path = entry.path();
        let relative_path = path
            .strip_prefix(root)
            .map_err(|_| AppError::TaskResultFailed)?
            .to_path_buf();
        if should_ignore(&relative_path) {
            continue;
        }
        let file_type = entry.file_type().map_err(|_| AppError::TaskResultFailed)?;
        if file_type.is_dir() {
            collect_directory(root, &path, files)?;
        } else if file_type.is_file() {
            let size = entry
                .metadata()
                .map_err(|_| AppError::TaskResultFailed)?
                .len();
            files.insert(relative_path, FileEntry { path, size });
        }
    }
    Ok(())
}

/// Hides Git implementation files and Claude's compatibility mirror from user result changes.
fn should_ignore(relative_path: &Path) -> bool {
    relative_path.starts_with(".git") || relative_path.starts_with(".claude/skills")
}

/// Compares regular files with bounded memory and no metadata assumptions beyond size.
fn files_equal(left: &FileEntry, right: &FileEntry) -> Result<bool, AppError> {
    if left.size != right.size {
        return Ok(false);
    }
    let left = fs::File::open(&left.path).map_err(|_| AppError::TaskResultFailed)?;
    let right = fs::File::open(&right.path).map_err(|_| AppError::TaskResultFailed)?;
    let mut left = BufReader::new(left);
    let mut right = BufReader::new(right);
    let mut left_buffer = [0_u8; 8192];
    let mut right_buffer = [0_u8; 8192];
    loop {
        let left_count = left
            .read(&mut left_buffer)
            .map_err(|_| AppError::TaskResultFailed)?;
        let right_count = right
            .read(&mut right_buffer)
            .map_err(|_| AppError::TaskResultFailed)?;
        if left_count != right_count || left_buffer[..left_count] != right_buffer[..right_count] {
            return Ok(false);
        }
        if left_count == 0 {
            return Ok(true);
        }
    }
}

/// Reads small UTF-8 files for patches and classifies everything else as binary.
fn read_bounded_text(entry: &FileEntry) -> Result<Option<String>, AppError> {
    if entry.size > MAX_TEXT_DIFF_BYTES {
        return Ok(None);
    }
    let bytes = fs::read(&entry.path).map_err(|_| AppError::TaskResultFailed)?;
    Ok(String::from_utf8(bytes).ok())
}

/// Appends a concise line-oriented text diff or binary marker.
fn append_patch(
    patch: &mut String,
    path: &str,
    change: &str,
    before: Option<&str>,
    after: Option<&str>,
    binary: bool,
) {
    let before_label = if change == "added" {
        "/dev/null".to_string()
    } else {
        format!("a/{path}")
    };
    let after_label = if change == "deleted" {
        "/dev/null".to_string()
    } else {
        format!("b/{path}")
    };
    patch.push_str(&format!("--- {before_label}\n+++ {after_label}\n"));
    if binary {
        patch.push_str("Binary files differ\n\n");
        return;
    }
    patch.push_str("@@ content @@\n");
    if let Some(before) = before {
        for line in before.lines() {
            patch.push_str(&format!("-{line}\n"));
        }
    }
    if let Some(after) = after {
        for line in after.lines() {
            patch.push_str(&format!("+{line}\n"));
        }
    }
    patch.push('\n');
}

/// Uses slash-separated lossy text only for portable user-facing artifact metadata.
fn display_relative_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Accepts identifiers safe to use as one result directory segment.
fn is_portable_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[cfg(test)]
mod tests {
    use super::ResultCollector;
    use std::path::Path;
    use std::sync::atomic::{AtomicU64, Ordering};

    static RESOURCE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn compares_each_execution_to_the_same_baseline() {
        tauri::async_runtime::block_on(async {
            let sequence = RESOURCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "theoria-result-test-{}-{sequence}",
                std::process::id()
            ));
            let baseline = root.join("task-runs/task-1/baseline");
            let agent_a = root.join("task-runs/task-1/executions/agent-a/workspace");
            let agent_b = root.join("task-runs/task-1/executions/agent-b/workspace");
            std::fs::create_dir_all(&baseline).expect("Baseline should be created");
            std::fs::create_dir_all(&agent_a).expect("Agent A should be created");
            std::fs::create_dir_all(&agent_b).expect("Agent B should be created");
            std::fs::write(baseline.join("answer.txt"), "baseline\n")
                .expect("Baseline should be written");
            std::fs::write(agent_a.join("answer.txt"), "agent a\n")
                .expect("Agent A should be written");
            std::fs::write(agent_b.join("answer.txt"), "agent b\n")
                .expect("Agent B should be written");
            let collector = ResultCollector::new(root.clone());

            let result_a = collector
                .collect(
                    "task-1",
                    "agent-a",
                    Path::new("task-runs/task-1/baseline"),
                    Path::new("task-runs/task-1/executions/agent-a/workspace"),
                )
                .await
                .expect("Agent A result should collect");
            let result_b = collector
                .collect(
                    "task-1",
                    "agent-b",
                    Path::new("task-runs/task-1/baseline"),
                    Path::new("task-runs/task-1/executions/agent-b/workspace"),
                )
                .await
                .expect("Agent B result should collect");
            let patch_a = std::fs::read_to_string(root.join(result_a.changes_relative_path))
                .expect("Agent A patch should read");
            let patch_b = std::fs::read_to_string(root.join(result_b.changes_relative_path))
                .expect("Agent B patch should read");

            assert!(patch_a.contains("-baseline"));
            assert!(patch_a.contains("+agent a"));
            assert!(!patch_a.contains("agent b"));
            assert!(patch_b.contains("-baseline"));
            assert!(patch_b.contains("+agent b"));
            assert!(!patch_b.contains("agent a"));
            assert_eq!(result_a.modified, 1);
            assert_eq!(result_b.modified, 1);

            std::fs::remove_dir_all(root).expect("fixture should be removable");
        });
    }
}
