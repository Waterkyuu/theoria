use crate::adapters::process::run_owned_command;
use crate::domain::benchmark::safe_relative_path;
use crate::domain::benchmark_task::{BenchmarkEvaluationCheck, BenchmarkEvaluationReport};
use crate::error::AppError;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

pub(crate) const VERIFIER_IMAGE: &str = "python:3.13.18-slim";
const MAX_REPORT_BYTES: usize = 256 * 1024;
const VALIDATION_TIMEOUT: Duration = Duration::from_secs(10);
static CONTAINER_SEQUENCE: AtomicU64 = AtomicU64::new(1);

const PYTHON_RUNNER: &str = r#"import json, pathlib, runpy, sys
namespace = runpy.run_path(sys.argv[1], run_name="theoria_validator")
report = namespace["validate"](pathlib.Path.cwd())
print(json.dumps(report, separators=(",", ":")))"#;
const PYTHON_VALIDATE: &str = r#"import ast, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"), filename="validator.py")
valid = any(
    isinstance(node, ast.FunctionDef)
    and node.name == "validate"
    and len(node.args.posonlyargs) + len(node.args.args) == 1
    and not node.args.vararg
    and not node.args.kwarg
    and not node.args.kwonlyargs
    for node in tree.body
)
raise SystemExit(0 if valid else 2)"#;

/// Isolation and report contract shared by macOS, Windows, and Linux.
pub(crate) trait BenchmarkVerifier: Send + Sync {
    /// Probes the actual engine and cached image instead of assuming capabilities from the OS.
    fn available(&self) -> bool;
    /// Parses the fixed entrypoint without executing validator code.
    fn validate(&self, script: &Path) -> Result<(), AppError>;
    /// Evaluates inside a network-disabled container with read-only inputs.
    fn evaluate(
        &self,
        script: &Path,
        workspace: &Path,
    ) -> Result<BenchmarkEvaluationReport, AppError>;
}

#[derive(Debug, Clone)]
pub(crate) struct SystemBenchmarkVerifier {
    /// Container engine executable; never a host-OS capability flag.
    docker: PathBuf,
}

impl Default for SystemBenchmarkVerifier {
    fn default() -> Self {
        Self {
            docker: PathBuf::from("docker"),
        }
    }
}

impl BenchmarkVerifier for SystemBenchmarkVerifier {
    fn available(&self) -> bool {
        self.run_python(None, None, "pass").is_ok()
    }

    fn validate(&self, script: &Path) -> Result<(), AppError> {
        let script = checked_script(script)?;
        self.run_python(Some(&script), None, PYTHON_VALIDATE)
            .map(|_| ())
            .map_err(|error| match error {
                AppError::WorkerFailed => AppError::InvalidBenchmark,
                error => error,
            })
    }

    fn evaluate(
        &self,
        script: &Path,
        workspace: &Path,
    ) -> Result<BenchmarkEvaluationReport, AppError> {
        let script = checked_script(script)?;
        let workspace =
            std::fs::canonicalize(workspace).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
        parse_report(&self.run_python(Some(&script), Some(&workspace), PYTHON_RUNNER)?)
    }
}

impl SystemBenchmarkVerifier {
    /// One fixed isolation policy applies to probes, syntax validation, and evaluation on every host.
    fn run_python(
        &self,
        script: Option<&Path>,
        workspace: Option<&Path>,
        code: &str,
    ) -> Result<Vec<u8>, AppError> {
        let name = format!(
            "theoria-verifier-{}-{}",
            std::process::id(),
            CONTAINER_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let mut command = Command::new(&self.docker);
        command
            .args(["run", "--rm", "--pull", "never", "--name"])
            .arg(&name)
            .args([
                "--network",
                "none",
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges",
                "--pids-limit",
                "64",
                "--memory",
                "128m",
                "--cpus",
                "1",
            ]);
        if let Some(script) = script {
            command
                .arg("--mount")
                .arg(bind_mount(script, "/validator.py"));
        }
        if let Some(workspace) = workspace {
            command
                .arg("--mount")
                .arg(bind_mount(workspace, "/workspace"))
                .args(["--workdir", "/workspace"]);
        }
        command
            .arg(VERIFIER_IMAGE)
            .args(["python3", "-I", "-S", "-B", "-c", code, "/validator.py"])
            .stdout(Stdio::piped());
        let cancellation = AtomicBool::new(false);
        let report = run_owned_command(&mut command, VALIDATION_TIMEOUT, &cancellation);
        if report.is_err() {
            // Killing a Docker CLI does not stop its container; remove only this invocation's name.
            run_owned_command(
                Command::new(&self.docker)
                    .args(["rm", "--force", &name])
                    .stdout(Stdio::null()),
                Duration::from_secs(5),
                &cancellation,
            )?;
        }
        let report = report?;
        if report.len() > MAX_REPORT_BYTES {
            return Err(AppError::InvalidBenchmark);
        }
        Ok(report)
    }
}

/// Docker's mount value is CSV, so quote the entire source field, including commas and spaces.
fn bind_mount(source: &Path, target: &str) -> String {
    let source = source.to_string_lossy();
    let source = source.strip_prefix(r"\\?\").unwrap_or(&source);
    format!(
        "type=bind,\"source={}\",target={target},readonly",
        source.replace('"', "\"\"")
    )
}

/// Only an immutable regular file may cross the container's private verifier boundary.
fn checked_script(script: &Path) -> Result<PathBuf, AppError> {
    let metadata =
        std::fs::symlink_metadata(script).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 5 * 1024 * 1024
    {
        return Err(AppError::BenchmarkAssetUnavailable);
    }
    std::fs::canonicalize(script).map_err(|_| AppError::BenchmarkAssetUnavailable)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PythonReport {
    /// Final binary result returned by the validator.
    passed: bool,
    /// Public checks displayed in execution details.
    checks: Vec<PythonCheck>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PythonCheck {
    /// Result of this validator assertion.
    passed: bool,
    /// Bounded public explanation without diagnostic output.
    message: String,
    /// Optional relative artifact path addressed by this assertion.
    path: Option<String>,
}

fn parse_report(bytes: &[u8]) -> Result<BenchmarkEvaluationReport, AppError> {
    let report: PythonReport =
        serde_json::from_slice(bytes).map_err(|_| AppError::InvalidBenchmark)?;
    if report.checks.is_empty()
        || report.checks.len() > 64
        || report.passed != report.checks.iter().all(|check| check.passed)
        || report.checks.iter().any(|check| {
            check.message.trim().is_empty()
                || check.message.chars().count() > 1000
                || check
                    .path
                    .as_deref()
                    .is_some_and(|path| !safe_relative_path(path))
        })
    {
        return Err(AppError::InvalidBenchmark);
    }
    Ok(BenchmarkEvaluationReport {
        rewards: None,
        runner_version: None,
        task_checksum: None,
        passed: report.passed,
        checks: report
            .checks
            .into_iter()
            .map(|check| BenchmarkEvaluationCheck {
                kind: "python".to_string(),
                path: check.path,
                passed: check.passed,
                message: check.message,
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::{BenchmarkVerifier, SystemBenchmarkVerifier};
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn routes_validation_through_the_same_container_contract_on_every_host() {
        let root =
            std::env::temp_dir().join(format!("theoria-docker-verifier-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("fixture directory");
        let executable = root.join(format!("docker-fixture{}", std::env::consts::EXE_SUFFIX));
        let status = std::process::Command::new("rustc")
            .arg(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures/benchmark-docker.rs"),
            )
            .arg("-o")
            .arg(&executable)
            .status()
            .expect("compile the portable engine fixture");
        assert!(status.success());
        let verifier = SystemBenchmarkVerifier {
            docker: executable.clone(),
        };
        let script = root.join("validator.py");
        std::fs::write(&script, "def validate(workspace):\n    return {'passed':False,'checks':[{'passed':False,'message':'native','path':None}]}\n").expect("validator");
        let workspace = root.join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace");
        assert!(
            verifier.available(),
            "availability must come from a real engine probe on every host"
        );
        verifier.validate(&script).expect("syntax check");
        let invalid = root.join("invalid.py");
        std::fs::write(&invalid, "def other(workspace): pass").expect("invalid entrypoint");
        assert_eq!(
            verifier.validate(&invalid),
            Err(crate::error::AppError::InvalidBenchmark)
        );
        let report = verifier
            .evaluate(&script, &workspace)
            .expect("container report");
        assert!(
            report.passed,
            "the configured container runner must own scoring"
        );
        assert_eq!(report.checks[0].message, "engine_report");
        let arguments = std::fs::read_to_string(executable.with_extension("audit"))
            .expect("engine invocations");
        assert!(arguments.contains("--network\nnone"));
        assert!(arguments.contains("--read-only"));
        assert!(arguments.contains("readonly"));
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    #[ignore = "requires Docker and the pinned Python verifier image"]
    fn python_validator_reads_only_its_workspace_and_cannot_open_network_sockets() {
        let verifier = SystemBenchmarkVerifier::default();
        assert!(
            verifier.available(),
            "Docker and the pinned verifier image must be available"
        );
        let root = std::env::temp_dir().join(format!(
            "theoria-verifier-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let workspace = root.join("workspace");
        std::fs::create_dir_all(&workspace).expect("workspace");
        std::fs::write(root.join("secret.txt"), "not visible").expect("private fixture");
        let script = root.join("validator.py");
        std::fs::write(
            &script,
            r#"
def validate(workspace):
    try:
        (workspace.parent / "secret.txt").read_text()
        file_blocked = False
    except OSError:
        file_blocked = True
    try:
        import socket
        connection = socket.create_connection(("1.1.1.1", 443), timeout=0.25)
        network_blocked = False
    except OSError:
        network_blocked = True
    return {"passed": file_blocked and network_blocked, "checks": [
        {"passed": file_blocked, "message": "file_blocked", "path": None},
        {"passed": network_blocked, "message": "network_blocked", "path": None}
    ]}
"#,
        )
        .expect("validator fixture");

        let report = verifier.evaluate(&script, &workspace).expect("evaluation");
        assert!(report.passed, "{report:?}");
        assert_eq!(report.checks[0].message, "file_blocked");

        std::fs::remove_dir_all(root).expect("fixture cleanup");
    }

    #[test]
    #[ignore = "requires Docker and the pinned Python verifier image"]
    fn python_validator_entrypoint_is_checked_without_running_the_script() {
        let verifier = SystemBenchmarkVerifier::default();
        assert!(
            verifier.available(),
            "Docker and the pinned verifier image must be available"
        );
        let root = std::env::temp_dir().join(format!(
            "theoria-verifier-validation-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).expect("fixture directory");
        let marker = root.join("must-not-exist.txt");
        let valid = root.join("valid.py");
        std::fs::write(
            &valid,
            format!(
                "from pathlib import Path\nPath({marker:?}).write_text('executed')\ndef validate(workspace):\n    return {{'passed': True, 'checks': [{{'passed': True, 'message': 'ok', 'path': None}}]}}\n"
            ),
        )
        .expect("valid fixture");
        let invalid = root.join("invalid.py");
        std::fs::write(&invalid, "def other(workspace):\n    return {}\n")
            .expect("invalid fixture");

        verifier.validate(&valid).expect("valid entrypoint");
        assert!(
            !marker.exists(),
            "publication validation executed the script"
        );
        assert_eq!(
            verifier.validate(&invalid),
            Err(crate::error::AppError::InvalidBenchmark)
        );

        std::fs::remove_dir_all(root).expect("fixture cleanup");
    }
}
