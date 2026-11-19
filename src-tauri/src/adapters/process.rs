use crate::error::AppError;
use crate::platform::process::running_process_names;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use sysinfo::System;

/// One point-in-time snapshot of whether each supported Agent has a matching local process.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct AgentProcessStates {
    /// Indicates whether an exact Claude Code executable match was observed.
    pub(crate) claude: bool,
    /// Indicates whether an exact Codex executable match was observed.
    pub(crate) codex: bool,
    /// Indicates whether an exact OpenCode executable match was observed.
    pub(crate) opencode: bool,
    /// Indicates whether an exact WorkBuddy executable or application match was observed.
    pub(crate) workbuddy: bool,
}

/// Abstracts operating-system process discovery for the service and its tests.
pub(crate) trait AgentProcessAdapter {
    fn check_processes(&mut self) -> Result<AgentProcessStates, AppError>;
}

pub(crate) struct SystemAgentProcessAdapter {
    /// Native process table retained and refreshed by the application-wide monitor.
    system: System,
}

impl Default for SystemAgentProcessAdapter {
    fn default() -> Self {
        Self {
            system: System::new(),
        }
    }
}

impl AgentProcessAdapter for SystemAgentProcessAdapter {
    fn check_processes(&mut self) -> Result<AgentProcessStates, AppError> {
        Ok(process_states_from_names(running_process_names(
            &mut self.system,
        )))
    }
}

/// Maps platform process observations to the shared Agent running-state snapshot.
///
/// Matching intentionally uses exact executable basenames so helper renderers such as
/// `Codex Helper` do not make an idle Agent appear active.
fn process_states_from_names<I, S>(process_names: I) -> AgentProcessStates
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut states = AgentProcessStates::default();

    for process_name in process_names {
        let lowercase_path = process_name
            .as_ref()
            .trim()
            .replace('\\', "/")
            .to_ascii_lowercase();
        // WorkBuddy's macOS bundle keeps the generic Electron executable name, so its containing
        // application path is the stable identity available from the native process table.
        let is_workbuddy_desktop =
            lowercase_path.ends_with("/workbuddy ai.app/contents/macos/electron");
        let executable_name = Path::new(&lowercase_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        let executable_name = executable_name
            // Windows `tasklist` reports image names with the `.exe` suffix.
            .strip_suffix(".exe")
            .unwrap_or(executable_name);

        if is_workbuddy_desktop {
            states.workbuddy = true;
            continue;
        }

        match executable_name {
            "claude" => states.claude = true,
            "codex" => states.codex = true,
            "opencode" => states.opencode = true,
            "cbc" | "codebuddy" | "workbuddy" | "workbuddy ai" => states.workbuddy = true,
            _ => {}
        }
    }

    states
}

/// Drains bounded output and always reaps owned children; quiet jobs do not retain terminal logs.
pub(crate) fn run_owned_command(
    command: &mut Command,
    timeout: Duration,
    cancelled: &AtomicBool,
) -> Result<Vec<u8>, AppError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(AppError::WorkerFailed);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AppError::BenchmarkVerifierUnavailable
            } else {
                AppError::WorkerFailed
            }
        })?;
    let reader = child.stdout.take().map(|mut stdout| {
        std::thread::spawn(move || {
            let mut retained = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let read = stdout
                    .read(&mut buffer)
                    .map_err(|_| AppError::WorkerFailed)?;
                if read == 0 {
                    return Ok::<_, AppError>(retained);
                }
                let remaining = (256 * 1024 + 1usize).saturating_sub(retained.len());
                retained.extend_from_slice(&buffer[..read.min(remaining)]);
            }
        })
    });
    let deadline = Instant::now() + timeout;
    let result = loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                break if status.success() {
                    Ok(())
                } else {
                    Err(AppError::WorkerFailed)
                }
            }
            Err(_) => {
                child.kill().map_err(|_| AppError::WorkerFailed)?;
                child.wait().map_err(|_| AppError::WorkerFailed)?;
                break Err(AppError::WorkerFailed);
            }
            Ok(None) => {}
        }
        if cancelled.load(Ordering::Acquire) || Instant::now() >= deadline {
            // Give cooperative runners time to clean up before reaping an owned process.
            let pid = sysinfo::Pid::from_u32(child.id());
            let mut system = sysinfo::System::new();
            system.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::Some(&[pid]),
                false,
                sysinfo::ProcessRefreshKind::nothing(),
            );
            let signalled = system
                .process(pid)
                .is_some_and(|process| process.kill_with(sysinfo::Signal::Term).unwrap_or(false));
            if !signalled {
                child.kill().map_err(|_| AppError::WorkerFailed)?;
            }
            let cleanup_deadline = Instant::now() + Duration::from_secs(15);
            while child
                .try_wait()
                .map_err(|_| AppError::WorkerFailed)?
                .is_none()
            {
                if Instant::now() >= cleanup_deadline {
                    child.kill().map_err(|_| AppError::WorkerFailed)?;
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            child.wait().map_err(|_| AppError::WorkerFailed)?;
            break Err(AppError::WorkerFailed);
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let output = reader
        .map(|reader| reader.join().map_err(|_| AppError::WorkerFailed))
        .transpose()?
        .transpose()?
        .unwrap_or_default();
    result?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::process_states_from_names;

    #[test]
    fn detects_supported_agents_from_executable_names() {
        let states = process_states_from_names([
            "/usr/local/bin/claude",
            "/Applications/Codex.app/Contents/MacOS/Codex",
            "/home/test/.opencode/bin/opencode",
            "WorkBuddy AI.exe",
        ]);

        assert!(states.claude);
        assert!(states.codex);
        assert!(states.opencode);
        assert!(states.workbuddy);
    }

    #[test]
    fn detects_the_workbuddy_desktop_electron_process() {
        let states =
            process_states_from_names(["/Applications/WorkBuddy AI.app/Contents/MacOS/Electron"]);

        assert!(states.workbuddy);
    }

    #[test]
    fn ignores_helpers_and_unrelated_processes() {
        let states = process_states_from_names([
            "Claude Helper",
            "Codex Helper (Renderer)",
            "node",
            "agent-gauge",
        ]);

        assert!(!states.claude);
        assert!(!states.codex);
        assert!(!states.opencode);
        assert!(!states.workbuddy);
    }
    #[test]
    fn cancelling_an_owned_process_reaps_it_without_waiting_for_its_timeout() {
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        use std::time::{Duration, Instant};
        let root =
            std::env::temp_dir().join(format!("theoria-owned-process-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("fixture");
        let executable = root.join(format!("engine{}", std::env::consts::EXE_SUFFIX));
        let compiled = std::process::Command::new("rustc")
            .arg(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures/benchmark-docker.rs"),
            )
            .arg("-o")
            .arg(&executable)
            .status()
            .expect("compile engine fixture");
        assert!(compiled.success());
        let ready = root.join("ready");
        let cancellation = Arc::new(AtomicBool::new(false));
        let stopped = cancellation.clone();
        let child_ready = ready.clone();
        let worker = std::thread::spawn(move || {
            let mut command = std::process::Command::new(executable);
            command
                .arg("wait")
                .arg(child_ready)
                .stdout(std::process::Stdio::null());
            super::run_owned_command(&mut command, Duration::from_secs(60), &stopped)
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while !ready.exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        cancellation.store(true, Ordering::Release);
        assert!(worker.join().expect("worker").is_err());
        assert!(
            ready.exists(),
            "the real child must have started before cancellation"
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
