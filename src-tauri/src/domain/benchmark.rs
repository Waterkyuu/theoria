use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Versioned editor and import document; no machine paths or Agent credentials belong here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BenchmarkDocument {
    /// Template format understood by this application.
    pub(crate) schema_version: u32,
    /// Catalog title, allowed to be empty in a draft.
    pub(crate) name: String,
    /// Purpose and expected Agent work.
    pub(crate) description: String,
    /// Local classification selected before publication.
    pub(crate) tag_id: Option<String>,
    /// Attribution retained by imports and duplicates.
    pub(crate) source: Option<String>,
    /// Independent cases in display order.
    pub(crate) cases: Vec<BenchmarkCase>,
}

/// A case always starts a new Agent session with its own input files.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BenchmarkCase {
    /// Unique title within the published suite.
    pub(crate) name: String,
    /// Complete request sent to every participating Agent.
    pub(crate) prompt: String,
    /// Runtime deadline shared by all participants.
    pub(crate) timeout_minutes: u32,
    /// Public inputs; verifier material is stored separately.
    pub(crate) input_files: Vec<BenchmarkFile>,
    /// All checks must pass for this case to pass.
    pub(crate) checks: Vec<BenchmarkCheck>,
}

/// Reference to an immutable application-owned file, independent of the import location.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BenchmarkFile {
    /// Portable relative path used inside the case workspace.
    pub(crate) path: String,
    /// Opaque identifier assigned when the file was copied into managed storage.
    pub(crate) asset_id: String,
}

/// Saved grading criteria; the Agent cannot supply or replace these rules.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum BenchmarkCheck {
    Answer {
        /// Expected final answer, compared after trimming edge whitespace.
        expected: String,
    },
    FileExists {
        /// Required output path relative to the case workspace.
        path: String,
    },
    FileText {
        /// Output file to compare exactly.
        path: String,
        /// Expected UTF-8 file content.
        expected: String,
    },
    FileJson {
        /// Output JSON file to compare structurally.
        path: String,
        /// Serialized JSON; parsed only at the verification boundary.
        expected: String,
    },
    Python {
        /// Managed verifier script, never copied into public inputs.
        script: BenchmarkFile,
    },
}

/// Field-addressable validation failures used by the editor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkValidationIssue {
    /// Field path such as cases.0.name.
    pub(crate) field: String,
    /// Stable reason translated by the frontend.
    pub(crate) code: &'static str,
}

impl BenchmarkDocument {
    /// Applies publication requirements without preventing incomplete draft editing.
    pub(crate) fn publication_issues(&self) -> Vec<BenchmarkValidationIssue> {
        let mut issues = Vec::new();
        if self.schema_version != 1 {
            issue(&mut issues, "schemaVersion", "unsupported_schema");
        }
        if self.name.trim().is_empty() || self.name.chars().count() > 80 {
            issue(&mut issues, "name", "invalid_name");
        }
        if self.description.trim().is_empty() || self.description.chars().count() > 1000 {
            issue(&mut issues, "description", "invalid_description");
        }
        if self
            .tag_id
            .as_deref()
            .is_none_or(|id| id.is_empty() || id == "uncategorized")
        {
            issue(&mut issues, "tagId", "tag_required");
        }
        if self.cases.is_empty() || self.cases.len() > 100 {
            issue(&mut issues, "cases", "invalid_case_count");
        }
        let mut names = HashSet::new();
        for (index, case) in self.cases.iter().enumerate() {
            let field = format!("cases.{index}");
            if case.name.trim().is_empty() || case.name.chars().count() > 120 {
                issue(&mut issues, &format!("{field}.name"), "invalid_name");
            }
            if !names.insert(case.name.trim()) {
                issue(&mut issues, &format!("{field}.name"), "duplicate_case");
            }
            if case.prompt.trim().is_empty() || case.prompt.len() > 16000 {
                issue(&mut issues, &format!("{field}.prompt"), "invalid_prompt");
            }
            if !(1..=60).contains(&case.timeout_minutes) {
                issue(
                    &mut issues,
                    &format!("{field}.timeoutMinutes"),
                    "invalid_timeout",
                );
            }
            if case.checks.is_empty() || case.checks.len() > 32 {
                issue(&mut issues, &format!("{field}.checks"), "checks_required");
            }
            if case.input_files.len() > 256 {
                issue(
                    &mut issues,
                    &format!("{field}.inputFiles"),
                    "too_many_files",
                );
            }
            let mut paths = HashSet::new();
            for file in &case.input_files {
                if !safe_relative_path(&file.path) || !safe_asset_id(&file.asset_id) {
                    issue(&mut issues, &format!("{field}.inputFiles"), "unsafe_path");
                }
                if !paths.insert(file.path.to_lowercase()) {
                    issue(
                        &mut issues,
                        &format!("{field}.inputFiles"),
                        "duplicate_path",
                    );
                }
            }
            for check in &case.checks {
                match check {
                    BenchmarkCheck::Answer { expected }
                        if expected.trim().is_empty() || expected.len() > 65536 =>
                    {
                        issue(&mut issues, &format!("{field}.checks"), "invalid_expected")
                    }
                    BenchmarkCheck::FileExists { path }
                    | BenchmarkCheck::FileText { path, .. }
                    | BenchmarkCheck::FileJson { path, .. }
                        if !safe_relative_path(path) =>
                    {
                        issue(&mut issues, &format!("{field}.checks"), "unsafe_path")
                    }
                    BenchmarkCheck::FileJson { expected, .. }
                        if expected.len() > 65536
                            || serde_json::from_str::<serde::de::IgnoredAny>(expected).is_err() =>
                    {
                        issue(&mut issues, &format!("{field}.checks"), "invalid_json")
                    }
                    BenchmarkCheck::FileText { expected, .. } if expected.len() > 65536 => {
                        issue(&mut issues, &format!("{field}.checks"), "invalid_expected")
                    }
                    BenchmarkCheck::Python { script }
                        if !safe_relative_path(&script.path)
                            || !safe_asset_id(&script.asset_id) =>
                    {
                        issue(&mut issues, &format!("{field}.checks"), "unsafe_path")
                    }
                    _ => {}
                }
            }
        }
        issues
    }
}

/// Portable file names reject Windows drive syntax and traversal on every host.
pub(crate) fn safe_relative_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 1024
        && !path.contains(['\\', ':', '\0'])
        && path.split('/').all(|part| {
            !part.is_empty() && part != "." && part != ".." && !part.ends_with([' ', '.'])
        })
}

/// Asset identifiers never act as arbitrary paths into the user's computer.
pub(crate) fn safe_asset_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// Keeps validation reports compact and independent of UI language.
fn issue(issues: &mut Vec<BenchmarkValidationIssue>, field: &str, code: &'static str) {
    issues.push(BenchmarkValidationIssue {
        field: field.to_string(),
        code,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publication_rejects_missing_criteria_duplicate_cases_and_escaping_paths() {
        let case = BenchmarkCase {
            name: "Same".into(),
            prompt: "Do the work".into(),
            timeout_minutes: 10,
            input_files: vec![BenchmarkFile {
                path: "../secret".into(),
                asset_id: "asset-1".into(),
            }],
            checks: vec![],
        };
        let document = BenchmarkDocument {
            schema_version: 1,
            name: "Suite".into(),
            description: "Measure work".into(),
            tag_id: Some("tag-1".into()),
            source: None,
            cases: vec![case.clone(), case],
        };
        let issues = document.publication_issues();
        assert!(issues.iter().any(|issue| issue.code == "unsafe_path"));
        assert!(issues.iter().any(|issue| issue.code == "duplicate_case"));
        assert!(issues.iter().any(|issue| issue.code == "checks_required"));
    }
    #[test]
    fn publication_rejects_invalid_json_criteria() {
        let document = BenchmarkDocument {
            schema_version: 1,
            name: "JSON suite".to_string(),
            description: "Validate output".to_string(),
            tag_id: Some("tag-1".to_string()),
            source: None,
            cases: vec![BenchmarkCase {
                name: "Report".to_string(),
                prompt: "Create report.json".to_string(),
                timeout_minutes: 10,
                input_files: Vec::new(),
                checks: vec![BenchmarkCheck::FileJson {
                    path: "report.json".to_string(),
                    expected: "{".to_string(),
                }],
            }],
        };
        assert!(document
            .publication_issues()
            .iter()
            .any(|issue| issue.code == "invalid_json"));
    }
}

/// Benchmark catalog value exchanged between persistence and application services.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkTag {
    /// Stable local classification identifier.
    pub(crate) id: String,
    /// Display name of the classification.
    pub(crate) name: String,
    /// Gravity icon export name.
    pub(crate) icon: String,
    /// Whether this immutable fallback tag is owned by the application.
    pub(crate) is_system: bool,
}

/// Benchmark catalog value exchanged between persistence and application services.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkDraft {
    /// Stable editor draft identifier.
    pub(crate) id: String,
    /// Published definition being edited, when present.
    pub(crate) benchmark_id: Option<String>,
    /// Optimistic concurrency revision.
    pub(crate) revision: i64,
    /// Editable definition including incomplete cases.
    pub(crate) document: BenchmarkDocument,
    /// Last save time in UTC milliseconds.
    pub(crate) updated_at_ms: i64,
}

/// Benchmark catalog value exchanged between persistence and application services.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkSummary {
    /// Stable definition identifier.
    pub(crate) id: String,
    /// Current catalog title.
    pub(crate) name: String,
    /// Current catalog description.
    pub(crate) description: String,
    /// Exactly one local classification.
    pub(crate) tag_id: String,
    /// Platform or myself, assigned by the application.
    pub(crate) author: String,
    /// Optional source attribution.
    pub(crate) source: Option<String>,
    /// Whether new mounts are disabled.
    pub(crate) archived: bool,
    /// Latest published immutable version.
    pub(crate) version_id: String,
    /// Monotonic content version number.
    pub(crate) version_number: i64,
    /// Number of cases in the latest version.
    pub(crate) case_count: i64,
    /// Definition creation time in UTC milliseconds.
    pub(crate) created_at_ms: i64,
}

/// Benchmark catalog value exchanged between persistence and application services.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkDetail {
    /// Current catalog metadata.
    pub(crate) summary: BenchmarkSummary,
    /// Version explicitly selected for this detail.
    pub(crate) version_id: String,
    /// Selected content version number.
    pub(crate) version_number: i64,
    /// Immutable case content with current display metadata.
    pub(crate) document: BenchmarkDocument,
}

/// Benchmark catalog value exchanged between persistence and application services.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BenchmarkMount {
    /// Stable mount identifier.
    pub(crate) id: String,
    /// Workspace owning the mount.
    pub(crate) workspace_id: String,
    /// Mounted benchmark definition.
    pub(crate) benchmark_id: String,
    /// Explicitly pinned content version.
    pub(crate) version_id: String,
    /// Mount creation time in UTC milliseconds.
    pub(crate) created_at_ms: i64,
}
