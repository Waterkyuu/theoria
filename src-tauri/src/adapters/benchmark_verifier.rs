#[cfg(target_os = "macos")]
use crate::domain::benchmark::safe_relative_path;
use crate::domain::benchmark_task::{BenchmarkEvaluationCheck, BenchmarkEvaluationReport};
use crate::error::AppError;
#[cfg(target_os = "macos")]
use serde::Deserialize;
#[cfg(target_os = "macos")]
use std::ffi::OsString;
#[cfg(target_os = "macos")]
use std::io::Read;
use std::path::Path;
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::{Child, Command, ExitStatus, Stdio};
#[cfg(target_os = "macos")]
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
const MAX_REPORT_BYTES: u64 = 256 * 1024;
#[cfg(target_os = "macos")]
const VALIDATION_TIMEOUT: Duration = Duration::from_secs(10);

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChildCleanupOperation {
    Kill,
    Wait,
}
#[cfg(target_os = "macos")]
const PYTHON_RUNNER: &str = r#"import json, pathlib, runpy, sys
namespace = runpy.run_path(sys.argv[1], run_name="theoria_validator")
report = namespace["validate"](pathlib.Path.cwd())
print(json.dumps(report, separators=(",", ":")))"#;
#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
const SANDBOX_PROFILE: &str = r#"(version 1)
(allow default)
(deny network*)
(deny file-write*)
(deny file-read* (subpath "/Users") (subpath "/Volumes") (subpath "/private/var/folders") (subpath "/private/tmp"))
(allow file-read* (subpath (param "WORKSPACE")) (literal (param "SCRIPT")))
(deny process-exec)
(allow process-exec (subpath (param "PYTHON_ROOT")))"#;

#[cfg(target_os = "macos")]
const VALIDATION_PROFILE: &str = r#"(version 1)
(allow default)
(deny network*)
(deny file-write*)
(deny file-read* (subpath "/Users") (subpath "/Volumes") (subpath "/private/var/folders") (subpath "/private/tmp"))
(allow file-read* (literal (param "SCRIPT")))
(deny process-exec)
(allow process-exec (subpath (param "PYTHON_ROOT")))"#;

/// Isolated execution boundary for private Benchmark validation material.
pub(crate) trait BenchmarkVerifier: Send + Sync {
    /// Whether this host has a supported isolation tool and Python runtime.
    fn available(&self) -> bool;

    /// Parses one validator and verifies its fixed entrypoint without executing user code.
    fn validate(&self, script: &Path) -> Result<(), AppError>;

    /// Executes one immutable validator against a read-only execution workspace.
    fn evaluate(
        &self,
        script: &Path,
        workspace: &Path,
    ) -> Result<BenchmarkEvaluationReport, AppError>;
}

/// Host implementation that exposes Python only when verified OS isolation is available.
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SystemBenchmarkVerifier;

impl BenchmarkVerifier for SystemBenchmarkVerifier {
    fn available(&self) -> bool {
        system_verifier_available()
    }

    fn validate(&self, script: &Path) -> Result<(), AppError> {
        validate_python(script)
    }

    fn evaluate(
        &self,
        script: &Path,
        workspace: &Path,
    ) -> Result<BenchmarkEvaluationReport, AppError> {
        evaluate_python(script, workspace)
    }
}

#[cfg(target_os = "macos")]
fn system_verifier_available() -> bool {
    let Some((python, _)) = validated_python() else {
        return false;
    };
    let Ok(metadata) = std::fs::symlink_metadata("/usr/bin/sandbox-exec") else {
        return false;
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return false;
    }
    Command::new("/usr/bin/sandbox-exec")
        .args([
            "-p",
            "(version 1) (allow default) (deny network*) (deny file-write*)",
        ])
        .arg(python)
        .args(["-I", "-S", "-B", "-c", "pass"])
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

#[cfg(not(target_os = "macos"))]
fn system_verifier_available() -> bool {
    false
}

#[cfg(target_os = "macos")]
fn evaluate_python(script: &Path, workspace: &Path) -> Result<BenchmarkEvaluationReport, AppError> {
    let (python, python_root) = validated_python().ok_or(AppError::BenchmarkVerifierUnavailable)?;
    let workspace =
        std::fs::canonicalize(workspace).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    let script = checked_script(script)?;
    let mut command = Command::new("/usr/bin/sandbox-exec");
    command
        .arg("-D")
        .arg(parameter("WORKSPACE", &workspace))
        .arg("-D")
        .arg(parameter("SCRIPT", &script))
        .arg("-D")
        .arg(parameter("PYTHON_ROOT", &python_root))
        .args(["-p", SANDBOX_PROFILE])
        .arg(python)
        .args(["-I", "-S", "-B", "-c", PYTHON_RUNNER])
        .arg(&script)
        .current_dir(&workspace)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
    let stdout = child.stdout.take().ok_or(AppError::InvalidBenchmark)?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(MAX_REPORT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let status = wait_for_child(&mut child)?;
    let bytes = reader
        .join()
        .map_err(|_| AppError::WorkerFailed)?
        .map_err(|_| AppError::InvalidBenchmark)?;
    if !status.success() || bytes.len() as u64 > MAX_REPORT_BYTES {
        return Err(AppError::InvalidBenchmark);
    }
    parse_report(&bytes)
}

#[cfg(target_os = "macos")]
fn validate_python(script: &Path) -> Result<(), AppError> {
    let (python, python_root) = validated_python().ok_or(AppError::BenchmarkVerifierUnavailable)?;
    let script = checked_script(script)?;
    let mut command = Command::new("/usr/bin/sandbox-exec");
    command
        .arg("-D")
        .arg(parameter("SCRIPT", &script))
        .arg("-D")
        .arg(parameter("PYTHON_ROOT", &python_root))
        .args(["-p", VALIDATION_PROFILE])
        .arg(python)
        .args(["-I", "-S", "-B", "-c", PYTHON_VALIDATE])
        .arg(&script)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
    let status = wait_for_child(&mut child)?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::InvalidBenchmark)
    }
}

#[cfg(not(target_os = "macos"))]
fn validate_python(_script: &Path) -> Result<(), AppError> {
    Err(AppError::BenchmarkVerifierUnavailable)
}

#[cfg(not(target_os = "macos"))]
fn evaluate_python(
    _script: &Path,
    _workspace: &Path,
) -> Result<BenchmarkEvaluationReport, AppError> {
    Err(AppError::BenchmarkVerifierUnavailable)
}

#[cfg(target_os = "macos")]
fn wait_for_child(child: &mut Child) -> Result<ExitStatus, AppError> {
    let deadline = Instant::now() + VALIDATION_TIMEOUT;
    loop {
        if let Some(status) = child.try_wait().map_err(|_| AppError::InvalidBenchmark)? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            terminate_and_reap(|operation| match operation {
                ChildCleanupOperation::Kill => child.kill(),
                ChildCleanupOperation::Wait => child.wait().map(|_| ()),
            })?;
            return Err(AppError::InvalidBenchmark);
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(target_os = "macos")]
fn terminate_and_reap(
    mut operation: impl FnMut(ChildCleanupOperation) -> std::io::Result<()>,
) -> Result<(), AppError> {
    let termination = operation(ChildCleanupOperation::Kill);
    let reaping = operation(ChildCleanupOperation::Wait);
    if termination.is_err() || reaping.is_err() {
        Err(AppError::InvalidBenchmark)
    } else {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn parameter(name: &str, path: &Path) -> OsString {
    let mut value = OsString::from(name);
    value.push("=");
    value.push(path.as_os_str());
    value
}

#[cfg(target_os = "macos")]
fn validated_python() -> Option<(PathBuf, PathBuf)> {
    [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ]
    .into_iter()
    .find_map(|candidate| {
        let executable = std::fs::canonicalize(candidate).ok()?;
        let metadata = std::fs::symlink_metadata(&executable).ok()?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return None;
        }
        let root = executable.parent()?.parent()?.to_path_buf();
        Some((executable, root))
    })
}

#[cfg(target_os = "macos")]
fn checked_script(script: &Path) -> Result<PathBuf, AppError> {
    let metadata =
        std::fs::symlink_metadata(script).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 5 * 1024 * 1024
    {
        return Err(AppError::BenchmarkAssetUnavailable);
    }
    std::fs::canonicalize(script).map_err(|_| AppError::BenchmarkAssetUnavailable)
}

#[cfg(target_os = "macos")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PythonReport {
    /// Final binary result returned by the validator.
    passed: bool,
    /// Public checks displayed in execution details.
    checks: Vec<PythonCheck>,
}

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
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
    #[cfg(target_os = "macos")]
    use super::{terminate_and_reap, ChildCleanupOperation};
    use super::{BenchmarkVerifier, SystemBenchmarkVerifier};
    #[cfg(target_os = "macos")]
    use crate::error::AppError;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[cfg(target_os = "macos")]
    #[test]
    fn validator_cleanup_reaps_after_termination_fails() {
        let mut operations = Vec::new();
        let result = terminate_and_reap(|operation| {
            operations.push(operation);
            match operation {
                ChildCleanupOperation::Kill => Err(std::io::Error::other("kill failed")),
                ChildCleanupOperation::Wait => Ok(()),
            }
        });

        assert_eq!(result, Err(AppError::InvalidBenchmark));
        assert_eq!(
            operations,
            [ChildCleanupOperation::Kill, ChildCleanupOperation::Wait]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn python_validator_reads_only_its_workspace_and_cannot_open_network_sockets() {
        let verifier = SystemBenchmarkVerifier;
        if !verifier.available() {
            return;
        }
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
        connection = socket.socket()
        connection.bind(("127.0.0.1", 0))
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

    #[cfg(target_os = "macos")]
    #[test]
    fn python_validator_entrypoint_is_checked_without_running_the_script() {
        let verifier = SystemBenchmarkVerifier;
        if !verifier.available() {
            return;
        }
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
