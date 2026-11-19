use crate::adapters::process::run_owned_command;
use crate::domain::benchmark_task::{
    BenchmarkAgentProfile, BenchmarkEvaluationCheck, BenchmarkEvaluationReport,
    BenchmarkExecutionMetrics, BenchmarkExecutionResult, BenchmarkRunner, BenchmarkTokenUsage,
};
use crate::error::AppError;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const HARBOR_VERSION: &str = "0.26.0";
const MAX_REPORT_BYTES: u64 = 4 * 1024 * 1024;

/// Only fields consumed by Theoria are decoded; upstream credentials and traces are excluded.
#[derive(Deserialize)]
struct HarborTrial {
    /// Missing versions denote upstream schema 1.
    schema_version: Option<u32>,
    /// Exact dataset task selected by this execution.
    task_name: String,
    /// Upstream task content identity, retained with the score.
    task_checksum: String,
    /// A partially written/running result cannot be graded.
    finished_at: Option<String>,
    /// Persisted start time preserves duration when importing after a process restart.
    started_at: Option<String>,
    /// Runtime identity actually reported by Harbor.
    agent_info: HarborAgent,
    /// Usage remains optional when the CLI did not report it.
    agent_result: Option<HarborUsage>,
    /// Numeric upstream rewards, independent of process exit status.
    verifier_result: Option<HarborVerifier>,
    /// An exception takes precedence over any stale reward.
    exception_info: Option<HarborException>,
}

#[derive(Deserialize)]
struct HarborAgent {
    /// Harbor integration identifier.
    name: String,
    /// Observed installed CLI release.
    version: String,
    /// Model identity actually observed by the integration.
    model_info: Option<HarborModel>,
}

#[derive(Deserialize)]
struct HarborModel {
    /// Provider-native model identifier.
    name: String,
    /// Provider slug when known to the runner.
    provider: Option<String>,
}

#[derive(Deserialize)]
struct HarborUsage {
    /// All input tokens, including cached tokens.
    n_input_tokens: Option<u64>,
    /// Cached input subset, when reported.
    n_cache_tokens: Option<u64>,
    /// Generated tokens.
    n_output_tokens: Option<u64>,
    /// Provider-reported USD charge.
    cost_usd: Option<f64>,
}

#[derive(Deserialize)]
struct HarborVerifier {
    /// Retained verbatim rather than replacing upstream scoring with local checks.
    rewards: Option<BTreeMap<String, serde_json::Number>>,
}

#[derive(Deserialize)]
struct HarborException {
    /// Stable upstream category; messages and tracebacks are not persisted in summaries.
    exception_type: String,
}

/// Pinning the executable protects the stored config/result protocol from silent CLI changes.
fn executable() -> PathBuf {
    let name = if cfg!(windows) {
        "harbor.exe"
    } else {
        "harbor"
    };
    let local = dirs::home_dir().map(|home| home.join(".local").join("bin").join(name));
    local
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from(name))
}

/// The desktop preflight checks runner and Docker independently of host CLI login state.
pub(crate) fn preflight(
    cancelled: &AtomicBool,
) -> Result<(), crate::domain::benchmark_task::BenchmarkPreflightIssueKind> {
    use crate::domain::benchmark_task::BenchmarkPreflightIssueKind;
    let version = run_owned_command(
        Command::new(executable())
            .arg("--version")
            .stdout(Stdio::piped()),
        Duration::from_secs(10),
        cancelled,
    )
    .map_err(|_| BenchmarkPreflightIssueKind::RunnerUnavailable)?;
    if !String::from_utf8_lossy(&version)
        .split_whitespace()
        .any(|token| token == HARBOR_VERSION)
    {
        return Err(BenchmarkPreflightIssueKind::RunnerUnavailable);
    }
    run_owned_command(
        Command::new("docker")
            .args(["info", "--format", "{{.ServerVersion}}"])
            .stdout(Stdio::null()),
        Duration::from_secs(10),
        cancelled,
    )
    .map_err(|_| BenchmarkPreflightIssueKind::EnvironmentUnavailable)?;
    Ok(())
}

/// One Theoria trial owns one single-trial Harbor job; neither layer can multiply attempts/retries.
fn job_config(
    runner: &BenchmarkRunner,
    task: &str,
    profile: &BenchmarkAgentProfile,
    root: &Path,
) -> Result<serde_json::Value, AppError> {
    let BenchmarkRunner::Harbor { dataset, version } = runner else {
        return Err(AppError::InvalidBenchmark);
    };
    let agent_name = if profile.agent_kind == "claude" {
        "claude-code"
    } else {
        &profile.agent_kind
    };
    let mut kwargs = serde_json::Map::new();
    if let Some(mode) = &profile.mode {
        kwargs.insert("reasoning_effort".into(), mode.clone().into());
    }
    if let Some(version) = &profile.version {
        kwargs.insert("version".into(), version.clone().into());
    }
    Ok(serde_json::json!({
        "schema_version":1, "job_name":"trial", "jobs_dir":root, "n_attempts":1, "n_concurrent_trials":1,
        "retry":{"max_retries":0}, "quiet":true, "environment":{"type":"docker", "delete":true},
        "datasets":[{"name":dataset, "version":version, "task_names":[task]}],
        "agents":[{"name":agent_name,"model_name":profile.model,"kwargs":kwargs}]
    }))
}

/// Imports only a complete, matching trial from the pinned upstream schema.
fn parse_trial(
    text: &str,
    task: &str,
    profile: &BenchmarkAgentProfile,
    duration_ms: u64,
) -> Result<BenchmarkExecutionResult, AppError> {
    let trial: HarborTrial = serde_json::from_str(text).map_err(|_| AppError::InvalidBenchmark)?;
    let agent_name = if profile.agent_kind == "claude" {
        "claude-code"
    } else {
        &profile.agent_kind
    };
    if trial.schema_version.unwrap_or(1) != 1
        || trial.task_name != task
        || trial.agent_info.name != agent_name
        || trial.finished_at.as_ref().is_none_or(String::is_empty)
    {
        return Err(AppError::InvalidBenchmark);
    }
    let duration_ms = match (&trial.started_at, &trial.finished_at) {
        (Some(started), Some(finished)) => {
            let started = chrono::DateTime::parse_from_rfc3339(started)
                .map_err(|_| AppError::InvalidBenchmark)?;
            let finished = chrono::DateTime::parse_from_rfc3339(finished)
                .map_err(|_| AppError::InvalidBenchmark)?;
            u64::try_from((finished - started).num_milliseconds())
                .map_err(|_| AppError::InvalidBenchmark)?
        }
        _ if duration_ms > 0 => duration_ms,
        _ => return Err(AppError::InvalidBenchmark),
    };
    let runtime_model = trial.agent_info.model_info.map(|model| {
        model.provider.map_or_else(
            || model.name.clone(),
            |provider| format!("{provider}/{}", model.name),
        )
    });
    let usage = trial.agent_result;
    let token_usage = usage.as_ref().and_then(|usage| {
        Some(BenchmarkTokenUsage {
            total_tokens: usage.n_input_tokens?.checked_add(usage.n_output_tokens?)?,
            input_tokens: usage.n_input_tokens?,
            output_tokens: usage.n_output_tokens?,
            cached_input_tokens: usage.n_cache_tokens.unwrap_or(0),
            cache_write_input_tokens: 0,
            reasoning_output_tokens: None,
        })
    });
    let cost_nano_usd = usage
        .and_then(|usage| usage.cost_usd)
        .filter(|cost| cost.is_finite() && *cost >= 0.0 && *cost < u64::MAX as f64 / 1e9)
        .map(|cost| (cost * 1e9).round() as u64);
    let termination_reason = trial.exception_info.map(|error| {
        match error.exception_type.as_str() {
            "AgentTimeoutError" => "timed_out",
            "AgentExecutionError" | "AgentError" => "agent_error",
            "CancelledError" => "cancelled",
            "VerifierTimeoutError"
            | "VerifierError"
            | "RewardFileNotFoundError"
            | "RewardFileParseError" => "evaluation_error",
            _ => "environment_error",
        }
        .to_string()
    });
    let report = if termination_reason.is_none() {
        let rewards = trial
            .verifier_result
            .and_then(|verifier| verifier.rewards)
            .ok_or(AppError::InvalidBenchmark)?;
        let score = rewards
            .get("reward")
            .and_then(serde_json::Number::as_f64)
            .ok_or(AppError::InvalidBenchmark)?;
        if !(0.0..=1.0).contains(&score) {
            return Err(AppError::InvalidBenchmark);
        }
        Some(BenchmarkEvaluationReport {
            passed: score == 1.0,
            rewards: Some(rewards),
            runner_version: Some(HARBOR_VERSION.into()),
            task_checksum: Some(trial.task_checksum),
            checks: vec![BenchmarkEvaluationCheck {
                kind: "harbor".into(),
                path: None,
                passed: score == 1.0,
                message: if score == 1.0 {
                    "upstream_passed"
                } else {
                    "upstream_failed"
                }
                .into(),
            }],
        })
    } else {
        None
    };
    Ok(BenchmarkExecutionResult {
        session_id: None,
        response_text: None,
        termination_reason,
        report,
        metrics: Some(BenchmarkExecutionMetrics {
            total_duration_ms: duration_ms,
            cost_nano_usd,
            runtime: Some(BenchmarkAgentProfile {
                version: (trial.agent_info.version != "unknown")
                    .then_some(trial.agent_info.version),
                model: runtime_model,
                mode: None,
                ..profile.clone()
            }),
            time_to_first_token_ms: None,
            token_usage,
            tool_call_count: 0,
            tool_calls: Vec::new(),
        }),
        finished_at_ms: i64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| AppError::WorkerFailed)?
                .as_millis(),
        )
        .map_err(|_| AppError::WorkerFailed)?,
    })
}

/// Reads only direct trial directories and regular files; partial JSON is retried on resume.
fn completed_trial(
    job: &Path,
    task: &str,
    profile: &BenchmarkAgentProfile,
    duration_ms: u64,
) -> Result<Option<(BenchmarkExecutionResult, PathBuf)>, AppError> {
    if !job.exists() {
        return Ok(None);
    }
    let mut imported = None;
    for entry in std::fs::read_dir(job)
        .map_err(|_| AppError::TaskResultFailed)?
        .take(101)
    {
        let entry = entry.map_err(|_| AppError::TaskResultFailed)?;
        if !entry
            .file_type()
            .map_err(|_| AppError::TaskResultFailed)?
            .is_dir()
        {
            continue;
        }
        let path = entry.path().join("result.json");
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_REPORT_BYTES
        {
            return Err(AppError::TaskResultFailed);
        }
        let text = std::fs::read_to_string(&path).map_err(|_| AppError::TaskResultFailed)?;
        if let Ok(result) = parse_trial(&text, task, profile, duration_ms) {
            if result.termination_reason.as_deref() == Some("cancelled") {
                continue;
            }
            if imported.is_some() {
                return Err(AppError::TaskResultFailed);
            }
            imported = Some((result, entry.path()));
        }
    }
    Ok(imported)
}

/// Keeps the upstream job outside the public workspace so resume never erases its progress.
pub(crate) fn run_trial(
    runner: &BenchmarkRunner,
    task: &str,
    profile: &BenchmarkAgentProfile,
    workspace: &Path,
    timeout: Duration,
    cancelled: &AtomicBool,
) -> Result<BenchmarkExecutionResult, AppError> {
    let root = workspace
        .parent()
        .ok_or(AppError::TaskPreparationFailed)?
        .join("harbor");
    std::fs::create_dir_all(&root).map_err(|_| AppError::TaskPreparationFailed)?;
    let root = std::fs::canonicalize(root).map_err(|_| AppError::TaskPreparationFailed)?;
    let job = root.join("trial");
    let started = Instant::now();
    let previous = completed_trial(&job, task, profile, 0)?;
    let imported = if let Some(previous) = previous {
        previous
    } else {
        preflight(cancelled).map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
        let config = root.join("config.json");
        std::fs::write(
            &config,
            serde_json::to_vec_pretty(&job_config(runner, task, profile, &root)?)
                .map_err(|_| AppError::InvalidBenchmark)?,
        )
        .map_err(|_| AppError::TaskPreparationFailed)?;
        let mut command = Command::new(executable());
        if job.join("config.json").is_file() {
            command.args(["jobs", "resume", "--job-path"]).arg(&job);
        } else {
            command.args(["run", "--config"]).arg(&config);
        }
        let process = run_owned_command(command.stdout(Stdio::null()), timeout, cancelled);
        if cancelled.load(Ordering::Acquire) {
            return Err(AppError::WorkerFailed);
        }
        let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
        let result = completed_trial(&job, task, profile, duration_ms)?;
        if let Some(result) = result {
            result
        } else {
            if started.elapsed() >= timeout {
                return Ok(BenchmarkExecutionResult {
                    session_id: None,
                    response_text: None,
                    metrics: None,
                    report: None,
                    termination_reason: Some("timed_out".into()),
                    finished_at_ms: i64::try_from(
                        SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .map_err(|_| AppError::WorkerFailed)?
                            .as_millis(),
                    )
                    .map_err(|_| AppError::WorkerFailed)?,
                });
            }
            process.map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
            return Err(AppError::TaskResultFailed);
        }
    };
    let (result, trial_directory) = imported;
    // Keep a safe, typed report rather than copying upstream credentials or exception tracebacks.
    std::fs::write(workspace.join("harbor-report.json"), serde_json::to_vec_pretty(&serde_json::json!({"runnerVersion":HARBOR_VERSION,"report":result.report,"metrics":result.metrics,"terminationReason":result.termination_reason})).map_err(|_| AppError::TaskResultFailed)?)
        .map_err(|_| AppError::TaskResultFailed)?;
    let artifacts = trial_directory.join("artifacts");
    if artifacts.exists() {
        copy_artifacts(&artifacts, &workspace.join("artifacts"), &mut 0, &mut 0)?;
    }
    Ok(result)
}

/// Artifact imports reject links and bound both file count and bytes at the external boundary.
fn copy_artifacts(
    source: &Path,
    target: &Path,
    files: &mut usize,
    bytes: &mut u64,
) -> Result<(), AppError> {
    if std::fs::symlink_metadata(source)
        .map_err(|_| AppError::TaskResultFailed)?
        .file_type()
        .is_symlink()
    {
        return Err(AppError::TaskResultFailed);
    }
    std::fs::create_dir_all(target).map_err(|_| AppError::TaskResultFailed)?;
    for entry in std::fs::read_dir(source).map_err(|_| AppError::TaskResultFailed)? {
        let entry = entry.map_err(|_| AppError::TaskResultFailed)?;
        *files += 1;
        let metadata = entry.metadata().map_err(|_| AppError::TaskResultFailed)?;
        if *files > 1000
            || *bytes > 20 * 1024 * 1024
            || entry
                .file_type()
                .map_err(|_| AppError::TaskResultFailed)?
                .is_symlink()
        {
            return Err(AppError::TaskResultFailed);
        }
        if metadata.is_dir() {
            copy_artifacts(&entry.path(), &target.join(entry.file_name()), files, bytes)?;
        } else if metadata.is_file() {
            *bytes = bytes.saturating_add(metadata.len());
            if *bytes > 20 * 1024 * 1024 {
                return Err(AppError::TaskResultFailed);
            }
            std::fs::copy(entry.path(), target.join(entry.file_name()))
                .map_err(|_| AppError::TaskResultFailed)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_trial;
    use crate::domain::benchmark_task::BenchmarkAgentProfile;

    /// Minimal upstream protocol fixture; deliberately excludes prompts, credentials and traces.
    fn trial() -> serde_json::Value {
        serde_json::json!({
            "schema_version":1, "task_name":"build-cython-ext", "started_at":"2026-11-19T09:59:59Z", "finished_at":"2026-11-19T10:00:00Z",
            "task_checksum":"abc123", "agent_info":{"name":"codex","version":"0.61.0","model_info":{"name":"test-model","provider":"openai"}},
            "agent_result":{"n_input_tokens":100,"n_cache_tokens":20,"n_output_tokens":30,"cost_usd":0.002},
            "verifier_result":{"rewards":{"reward":1.0}}, "exception_info":null
        })
    }

    #[test]
    fn recovers_a_finished_job_and_imports_only_its_report_and_artifacts() {
        use crate::domain::benchmark_task::BenchmarkRunner;
        use std::sync::atomic::AtomicBool;
        use std::time::Duration;
        let root =
            std::env::temp_dir().join(format!("theoria-harbor-import-{}", std::process::id()));
        let workspace = root.join("workspace");
        let trial_directory = root.join("harbor/trial/recorded-trial");
        std::fs::create_dir_all(&workspace).expect("workspace");
        std::fs::create_dir_all(trial_directory.join("artifacts")).expect("job artifacts");
        let mut result = trial();
        result["config"] =
            serde_json::json!({"agent":{"env":{"PRIVATE_KEY":"must-not-be-imported"}}});
        std::fs::write(trial_directory.join("result.json"), result.to_string())
            .expect("upstream result");
        std::fs::write(
            trial_directory.join("artifacts/fix.patch"),
            "patch artifact",
        )
        .expect("artifact");
        let runner = BenchmarkRunner::Harbor {
            dataset: "terminal-bench".into(),
            version: "2.0".into(),
        };
        let profile = BenchmarkAgentProfile {
            agent_kind: "codex".into(),
            model: Some("openai/test-model".into()),
            ..Default::default()
        };
        let imported = super::run_trial(
            &runner,
            "build-cython-ext",
            &profile,
            &workspace,
            Duration::from_secs(1),
            &AtomicBool::new(false),
        )
        .expect("recover completed trial without starting a runner");
        assert!(imported.report.expect("report").passed);
        assert_eq!(imported.metrics.expect("metrics").total_duration_ms, 1000);
        assert_eq!(
            std::fs::read_to_string(workspace.join("artifacts/fix.patch"))
                .expect("copied artifact"),
            "patch artifact"
        );
        let report =
            std::fs::read_to_string(workspace.join("harbor-report.json")).expect("safe report");
        assert!(!report.contains("must-not-be-imported"));
        assert!(
            report.contains("abc123"),
            "the task checksum must survive import"
        );
        #[cfg(unix)]
        {
            let outside = root.join("outside.txt");
            std::fs::write(&outside, "private fixture").expect("outside file");
            std::os::unix::fs::symlink(&outside, trial_directory.join("artifacts/escape"))
                .expect("hostile artifact");
            let rejected = super::copy_artifacts(
                &trial_directory.join("artifacts"),
                &root.join("rejected"),
                &mut 0,
                &mut 0,
            );
            assert!(rejected.is_err());
            assert!(!root.join("rejected/escape").exists());
        }
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn pins_one_task_without_automatic_retries_or_extra_attempts() {
        let profile = BenchmarkAgentProfile {
            agent_kind: "claude".into(),
            model: Some("anthropic/test-model".into()),
            mode: Some("high".into()),
            version: Some("1.2.3".into()),
            ..Default::default()
        };
        let runner = crate::domain::benchmark_task::BenchmarkRunner::Harbor {
            dataset: "terminal-bench".into(),
            version: "2.0".into(),
        };
        let config = super::job_config(
            &runner,
            "build-cython-ext",
            &profile,
            std::path::Path::new("jobs"),
        )
        .expect("job");
        assert_eq!(config["datasets"][0]["version"], "2.0");
        assert_eq!(
            config["datasets"][0]["task_names"],
            serde_json::json!(["build-cython-ext"])
        );
        assert_eq!(config["agents"][0]["name"], "claude-code");
        assert_eq!(config["agents"][0]["kwargs"]["version"], "1.2.3");
        assert_eq!(config["retry"]["max_retries"], 0);
        assert_eq!(config["n_attempts"], 1);
    }

    #[test]
    fn imports_scores_usage_and_actual_runtime_from_a_completed_trial() {
        let profile = BenchmarkAgentProfile {
            agent_kind: "codex".into(),
            model: Some("openai/test-model".into()),
            ..Default::default()
        };
        let imported = parse_trial(&trial().to_string(), "build-cython-ext", &profile, 500);
        assert!(
            imported.is_ok(),
            "completed trials must import without terminal scraping"
        );
        let imported = imported.expect("trial");
        assert!(imported.report.expect("verdict").passed);
        let metrics = imported.metrics.expect("reported metrics");
        assert_eq!(metrics.token_usage.expect("usage").total_tokens, 130);
        assert_eq!(metrics.total_duration_ms, 1000);
        assert_eq!(metrics.cost_nano_usd, Some(2_000_000));
        assert_eq!(
            metrics.runtime.expect("runtime").version.as_deref(),
            Some("0.61.0")
        );
    }

    #[test]
    fn never_counts_an_exception_or_unfinished_trial_as_a_pass() {
        let profile = BenchmarkAgentProfile {
            agent_kind: "codex".into(),
            ..Default::default()
        };
        let mut interrupted = trial();
        interrupted["exception_info"] = serde_json::json!({"exception_type":"AgentTimeoutError"});
        let result = parse_trial(&interrupted.to_string(), "build-cython-ext", &profile, 500)
            .expect("classified error");
        assert!(result.report.is_none());
        assert_eq!(result.termination_reason.as_deref(), Some("timed_out"));
        interrupted["finished_at"] = serde_json::Value::Null;
        assert!(parse_trial(&interrupted.to_string(), "build-cython-ext", &profile, 500).is_err());
    }

    #[test]
    fn rejects_wrong_tasks_and_future_protocols() {
        let profile = BenchmarkAgentProfile {
            agent_kind: "codex".into(),
            ..Default::default()
        };
        assert!(parse_trial(&trial().to_string(), "different-task", &profile, 500).is_err());
        let mut future = trial();
        future["schema_version"] = 2.into();
        assert!(parse_trial(&future.to_string(), "build-cython-ext", &profile, 500).is_err());
    }
}
