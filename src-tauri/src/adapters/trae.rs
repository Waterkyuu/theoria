use crate::adapters::agent::{
    validate_execution_directory, AgentAdapter, AgentExecutionConfig, AgentSessionRunOutput,
    AgentStatusAdapter, AgentTurnOutcome,
};
use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput, TokenUsage};
use crate::domain::agent_status::{AgentLoginStatus, AgentRuntimeConfig};
use crate::error::AppError;
use serde::Deserialize;
use std::ffi::{OsStr, OsString};
use std::io::{self, BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::thread;
use std::time::{Duration, Instant};

const TRAE_RUN_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_EVENT_BYTES: u64 = 1024 * 1024;
const EVENT_QUEUE_CAPACITY: usize = 64;

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SystemTraeAdapter;

impl AgentStatusAdapter for SystemTraeAdapter {
    fn check_login(&self) -> Result<AgentLoginStatus, AppError> {
        let executable = match find_trae_executable() {
            Ok(executable) => executable,
            Err(AppError::TraeNotInstalled) => return Ok(AgentLoginStatus::default()),
            Err(error) => return Err(error),
        };
        let status = Command::new(executable)
            .args(["login", "status"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|_| AppError::TraeProbeFailed)?;

        Ok(AgentLoginStatus {
            installed: true,
            logged_in: status.success(),
            authentication_method: status.success().then(|| "Trae account".to_string()),
        })
    }

    fn load_runtime_config(&self) -> Result<AgentRuntimeConfig, AppError> {
        Ok(AgentRuntimeConfig::default())
    }
}

impl AgentAdapter for SystemTraeAdapter {
    fn run_task_with_config_cancellable(
        &self,
        query: &str,
        execution_directory: &Path,
        config: AgentExecutionConfig<'_>,
        cancelled: &AtomicBool,
    ) -> Result<AgentRunOutput, AppError> {
        self.run_session_turn_with_config_cancellable(
            query,
            execution_directory,
            config,
            None,
            cancelled,
        )
        .and_then(|run| match run.outcome {
            AgentTurnOutcome::Completed => Ok(run.output),
            AgentTurnOutcome::Waiting => Err(AppError::TraeNeedsInput),
        })
    }

    fn run_session_turn_with_config_cancellable(
        &self,
        query: &str,
        execution_directory: &Path,
        config: AgentExecutionConfig<'_>,
        session_id: Option<&str>,
        cancelled: &AtomicBool,
    ) -> Result<AgentSessionRunOutput, AppError> {
        validate_execution_directory(execution_directory)?;
        let executable = find_trae_executable()?;
        run_trae_task(
            &executable,
            query,
            execution_directory,
            config,
            session_id,
            cancelled,
        )
    }
}

#[derive(Debug, Deserialize)]
struct TraeEvent {
    #[serde(rename = "type")]
    event_type: String,
    thread_id: Option<String>,
    item: Option<TraeItem>,
    usage: Option<TraeUsage>,
}

#[derive(Debug, Deserialize)]
struct TraeItem {
    id: String,
    #[serde(rename = "type")]
    item_type: String,
    text: Option<String>,
    command: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TraeUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cached_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    reasoning_output_tokens: Option<u64>,
}

impl From<TraeUsage> for TokenUsage {
    fn from(usage: TraeUsage) -> Self {
        Self {
            total_tokens: usage.input_tokens.saturating_add(usage.output_tokens),
            input_tokens: usage.input_tokens,
            cached_input_tokens: usage.cached_input_tokens,
            cache_write_input_tokens: 0,
            output_tokens: usage.output_tokens,
            reasoning_output_tokens: usage.reasoning_output_tokens,
        }
    }
}

fn find_trae_executable() -> Result<OsString, AppError> {
    for executable in trae_executable_candidates() {
        match Command::new(&executable)
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
        {
            Ok(status) if status.success() => return Ok(executable),
            Ok(_) => continue,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(_) => return Err(AppError::TraeProbeFailed),
        }
    }

    Err(AppError::TraeNotInstalled)
}

fn run_trae_task(
    executable: &OsStr,
    query: &str,
    execution_directory: &Path,
    config: AgentExecutionConfig<'_>,
    session_id: Option<&str>,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    let started_at = Instant::now();
    let mut command = build_trae_task_command(executable, query, config, session_id);
    command.current_dir(execution_directory);
    let mut child = command.spawn().map_err(|_| AppError::TraeProtocolFailed)?;
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_child(&mut child)?;
            return Err(AppError::TraeProtocolFailed);
        }
    };
    let (event_sender, event_receiver) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
    let reader_handle = thread::spawn(move || read_stream_events(stdout, event_sender));
    let result = collect_trae_events(&event_receiver, started_at, cancelled);
    drop(event_receiver);

    if result.is_err() {
        terminate_child(&mut child)?;
    } else {
        let status = child.wait().map_err(|_| AppError::TraeProtocolFailed)?;
        if !status.success() {
            return Err(AppError::TraeTaskFailed);
        }
    }
    reader_handle
        .join()
        .map_err(|_| AppError::TraeProtocolFailed)?;

    result
}

fn build_trae_task_command(
    executable: &OsStr,
    query: &str,
    config: AgentExecutionConfig<'_>,
    session_id: Option<&str>,
) -> Command {
    let mut command = Command::new(executable);
    command.args(["exec", "--json", "--color", "never"]);
    if let Some(model) = config.model {
        command.args(["--model", model]);
    }
    let sandbox = if config.file_access == Some("allow_edits") {
        "workspace-write"
    } else {
        "read-only"
    };
    command.args(["--sandbox", sandbox]);
    let permission_mode =
        if config.file_access == Some("allow_edits") && config.command_execution == Some("allow") {
            "bypass_permissions"
        } else {
            "custom"
        };
    command.args(["--permission-mode", permission_mode]);
    if config.command_execution != Some("allow") {
        command.args(["--disallowed-tool", "Bash"]);
    }
    if let Some(session_id) = session_id {
        command.arg(format!("--resume={session_id}"));
    }
    command
        .arg(query)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

fn collect_trae_events(
    event_receiver: &Receiver<Result<String, AppError>>,
    started_at: Instant,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    let mut collector = AgentRunMetricsCollector::default();
    let mut response = String::new();
    let mut session_id = None;

    loop {
        let remaining = TRAE_RUN_TIMEOUT
            .checked_sub(started_at.elapsed())
            .ok_or(AppError::TraeTimedOut)?;
        let line = receive_cancellable_line(event_receiver, remaining, cancelled)?;
        let event: TraeEvent =
            serde_json::from_str(&line).map_err(|_| AppError::TraeProtocolFailed)?;

        match event.event_type.as_str() {
            "thread.started" => session_id = event.thread_id,
            "item.started" => {
                if let Some(item) = event.item {
                    record_item_started(&mut collector, &item, started_at.elapsed());
                }
            }
            "item.completed" => {
                if let Some(item) = event.item {
                    record_item_completed(
                        &mut collector,
                        &mut response,
                        &item,
                        started_at.elapsed(),
                    );
                }
            }
            "turn.completed" => {
                if let Some(usage) = event.usage {
                    collector.record_token_usage(usage.into());
                }
                return Ok(AgentSessionRunOutput {
                    output: AgentRunOutput {
                        response,
                        metrics: collector.finish(started_at.elapsed()),
                    },
                    session_id,
                    outcome: AgentTurnOutcome::Completed,
                });
            }
            "turn.failed" | "error" => return Err(AppError::TraeTaskFailed),
            _ => {}
        }
    }
}

fn record_item_started(
    collector: &mut AgentRunMetricsCollector,
    item: &TraeItem,
    elapsed: Duration,
) {
    match item.item_type.as_str() {
        "reasoning" => collector.record_thinking_started(&item.id, elapsed),
        "agent_message" => {}
        _ => collector.record_tool_started(&item.id, &tool_name(item), elapsed),
    }
}

fn record_item_completed(
    collector: &mut AgentRunMetricsCollector,
    response: &mut String,
    item: &TraeItem,
    elapsed: Duration,
) {
    match item.item_type.as_str() {
        "agent_message" => {
            if let Some(text) = item.text.as_deref() {
                collector.record_agent_delta(text, elapsed);
                response.push_str(text);
            }
        }
        "reasoning" => collector.record_thinking_finished(&item.id, elapsed),
        _ => {
            collector.record_tool_started(&item.id, &tool_name(item), elapsed);
            collector.record_tool_finished(&item.id, elapsed);
        }
    }
}

fn tool_name(item: &TraeItem) -> String {
    item.name
        .clone()
        .or_else(|| item.command.clone())
        .unwrap_or_else(|| item.item_type.clone())
}

fn receive_cancellable_line(
    event_receiver: &Receiver<Result<String, AppError>>,
    timeout: Duration,
    cancelled: &AtomicBool,
) -> Result<String, AppError> {
    let started_at = Instant::now();
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err(AppError::TraeTaskFailed);
        }
        let remaining = timeout
            .checked_sub(started_at.elapsed())
            .ok_or(AppError::TraeTimedOut)?;
        match event_receiver.recv_timeout(remaining.min(Duration::from_millis(100))) {
            Ok(result) => return result,
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => return Err(AppError::TraeProtocolFailed),
        }
    }
}

fn read_stream_events(stdout: impl io::Read, event_sender: SyncSender<Result<String, AppError>>) {
    let mut reader = BufReader::new(stdout);

    loop {
        let mut bytes = Vec::new();
        let result = reader
            .by_ref()
            .take(MAX_EVENT_BYTES + 1)
            .read_until(b'\n', &mut bytes);
        match result {
            Ok(0) => break,
            Ok(_) if bytes.len() as u64 > MAX_EVENT_BYTES => {
                if event_sender
                    .send(Err(AppError::TraeProtocolFailed))
                    .is_err()
                {
                    break;
                }
            }
            Ok(_) => {
                let line = String::from_utf8(bytes).map_err(|_| AppError::TraeProtocolFailed);
                if event_sender.send(line).is_err() {
                    break;
                }
            }
            Err(_) => {
                if event_sender
                    .send(Err(AppError::TraeProtocolFailed))
                    .is_err()
                {
                    break;
                }
            }
        }
    }
}

fn terminate_child(child: &mut Child) -> Result<(), AppError> {
    match child.kill() {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => {}
        Err(_) => return Err(AppError::TraeProtocolFailed),
    }
    child
        .wait()
        .map(|_| ())
        .map_err(|_| AppError::TraeProtocolFailed)
}

fn trae_executable_candidates() -> Vec<OsString> {
    let mut candidates = vec![OsString::from("traecli"), OsString::from("trae-cli")];

    #[cfg(target_os = "macos")]
    candidates.extend([
        OsString::from("/usr/local/bin/traecli"),
        OsString::from("/opt/homebrew/bin/traecli"),
    ]);

    candidates
}

#[cfg(test)]
mod tests {
    use super::{build_trae_task_command, collect_trae_events};
    use crate::adapters::agent::{AgentExecutionConfig, AgentTurnOutcome};
    use std::ffi::OsStr;
    use std::sync::atomic::AtomicBool;
    use std::sync::mpsc;
    use std::time::Instant;

    #[test]
    fn task_command_uses_frozen_sandbox_model_and_session() {
        let command = build_trae_task_command(
            OsStr::new("traecli"),
            "fix tests",
            AgentExecutionConfig {
                model: Some("kimi-k2"),
                mode: None,
                file_access: Some("allow_edits"),
                command_execution: Some("allow"),
            },
            Some("session-42"),
        );
        let args: Vec<_> = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();

        assert!(args.windows(2).any(|args| args == ["--model", "kimi-k2"]));
        assert!(args
            .windows(2)
            .any(|args| args == ["--sandbox", "workspace-write"]));
        assert!(args
            .windows(2)
            .any(|args| args == ["--permission-mode", "bypass_permissions"]));
        assert!(args.iter().any(|arg| arg == "--resume=session-42"));
        assert!(args.iter().any(|arg| arg == "--json"));
        assert_eq!(args.last().map(String::as_str), Some("fix tests"));
    }

    #[test]
    fn readonly_task_command_blocks_mutations_and_shell_commands() {
        let command = build_trae_task_command(
            OsStr::new("traecli"),
            "review code",
            AgentExecutionConfig {
                model: None,
                mode: None,
                file_access: Some("read_only"),
                command_execution: Some("deny"),
            },
            None,
        );
        let args: Vec<_> = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();

        assert!(args
            .windows(2)
            .any(|args| args == ["--sandbox", "read-only"]));
        assert!(args
            .windows(2)
            .any(|args| args == ["--disallowed-tool", "Bash"]));
    }

    #[test]
    fn collects_trae_thread_text_tools_and_usage() {
        let (sender, receiver) = mpsc::sync_channel(8);
        sender
            .send(Ok(
                r#"{"type":"thread.started","thread_id":"session-42"}"#.to_string()
            ))
            .expect("thread event should send");
        sender
            .send(Ok(r#"{"type":"item.started","item":{"id":"tool-1","type":"command_execution","command":"cargo test"}}"#.to_string()))
            .expect("tool start should send");
        sender
            .send(Ok(r#"{"type":"item.completed","item":{"id":"tool-1","type":"command_execution","command":"cargo test"}}"#.to_string()))
            .expect("tool completion should send");
        sender
            .send(Ok(r#"{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"Done"}}"#.to_string()))
            .expect("message event should send");
        sender
            .send(Ok(r#"{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":3,"output_tokens":2}}"#.to_string()))
            .expect("turn event should send");

        let run = collect_trae_events(&receiver, Instant::now(), &AtomicBool::new(false))
            .expect("valid Trae stream should complete");

        assert_eq!(run.output.response, "Done");
        assert_eq!(run.session_id.as_deref(), Some("session-42"));
        assert_eq!(run.outcome, AgentTurnOutcome::Completed);
        assert_eq!(run.output.metrics.tool_calls.len(), 1);
        assert_eq!(
            run.output
                .metrics
                .token_usage
                .map(|usage| usage.total_tokens),
            Some(12)
        );
    }
}
