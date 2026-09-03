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

const QODER_RUN_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_EVENT_BYTES: u64 = 1024 * 1024;
const EVENT_QUEUE_CAPACITY: usize = 64;

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SystemQoderAdapter;

impl AgentStatusAdapter for SystemQoderAdapter {
    fn check_login(&self) -> Result<AgentLoginStatus, AppError> {
        let executable = match find_qoder_executable() {
            Ok(executable) => executable,
            Err(AppError::QoderNotInstalled) => return Ok(AgentLoginStatus::default()),
            Err(error) => return Err(error),
        };
        let output = Command::new(executable)
            .args(["status", "--output", "json"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| AppError::QoderProbeFailed)?;
        if !output.status.success() {
            return Err(AppError::QoderProbeFailed);
        }
        let stdout = String::from_utf8(output.stdout).map_err(|_| AppError::QoderProbeFailed)?;

        login_from_status_json(&stdout)
    }

    fn load_runtime_config(&self) -> Result<AgentRuntimeConfig, AppError> {
        Ok(AgentRuntimeConfig::default())
    }
}

impl AgentAdapter for SystemQoderAdapter {
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
            AgentTurnOutcome::Waiting => Err(AppError::QoderNeedsInput),
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
        let executable = find_qoder_executable()?;
        run_qoder_task(
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
struct QoderStatus {
    /// Login state reported by `qoder status --output json`.
    logged_in: bool,
}

#[derive(Debug, Deserialize)]
struct StreamMessage {
    /// Top-level Qoder stream message discriminator.
    #[serde(rename = "type")]
    message_type: String,
    /// Optional subtype that refines result messages.
    subtype: Option<String>,
    /// Final assistant response carried by a result message.
    result: Option<String>,
    /// Token usage sometimes carried by the final result.
    usage: Option<StreamUsage>,
    /// Indicates whether a result message represents a failed task.
    is_error: Option<bool>,
    /// Full conversation message carried by assistant and user events.
    message: Option<StreamConversationMessage>,
    /// Opaque Qoder session identifier emitted during the run.
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamConversationMessage {
    /// Ordered reasoning, text, tool-use, and tool-result blocks.
    #[serde(default)]
    content: Vec<StreamConversationContent>,
    /// Token usage reported on a complete assistant message.
    usage: Option<StreamUsage>,
}

#[derive(Debug, Deserialize)]
struct StreamConversationContent {
    /// Content discriminator such as text, tool_use, or tool_result.
    #[serde(rename = "type")]
    content_type: String,
    /// Assistant text for a text content block.
    text: Option<String>,
    /// Unique identifier present on a tool_use block.
    id: Option<String>,
    /// Tool name present on a tool_use block.
    name: Option<String>,
    /// Identifier linking a tool_result to its tool_use block.
    tool_use_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamUsage {
    /// Total model input tokens reported for the turn.
    #[serde(default)]
    input_tokens: u64,
    /// Tokens generated in the model output.
    #[serde(default)]
    output_tokens: u64,
    /// Input tokens written into the prompt cache.
    #[serde(default, alias = "cache_creation_tokens")]
    cache_creation_input_tokens: u64,
    /// Input tokens served from the prompt cache.
    #[serde(default, alias = "cache_read_tokens")]
    cache_read_input_tokens: u64,
}

impl From<StreamUsage> for TokenUsage {
    fn from(usage: StreamUsage) -> Self {
        Self {
            total_tokens: usage.input_tokens.saturating_add(usage.output_tokens),
            input_tokens: usage.input_tokens,
            cached_input_tokens: usage.cache_read_input_tokens,
            cache_write_input_tokens: usage.cache_creation_input_tokens,
            output_tokens: usage.output_tokens,
            reasoning_output_tokens: None,
        }
    }
}

/// Parses only the documented login field so status output cannot expose account details.
fn login_from_status_json(status: &str) -> Result<AgentLoginStatus, AppError> {
    let status: QoderStatus =
        serde_json::from_str(status).map_err(|_| AppError::QoderProbeFailed)?;

    Ok(AgentLoginStatus {
        installed: true,
        logged_in: status.logged_in,
        authentication_method: status.logged_in.then(|| "Qoder account".to_string()),
    })
}

/// Selects the first Qoder CLI executable that answers its version probe successfully.
fn find_qoder_executable() -> Result<OsString, AppError> {
    for executable in qoder_executable_candidates() {
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
            Err(_) => return Err(AppError::QoderProbeFailed),
        }
    }

    Err(AppError::QoderNotInstalled)
}

/// Runs one bounded Qoder process in the isolated Task Execution directory.
fn run_qoder_task(
    executable: &OsStr,
    query: &str,
    execution_directory: &Path,
    config: AgentExecutionConfig<'_>,
    session_id: Option<&str>,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    let started_at = Instant::now();
    let mut command = build_qoder_task_command(executable, query, config, session_id);
    command.current_dir(execution_directory);
    let mut child = command.spawn().map_err(|_| AppError::QoderProtocolFailed)?;
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_child(&mut child)?;
            return Err(AppError::QoderProtocolFailed);
        }
    };
    let (event_sender, event_receiver) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
    let reader_handle = thread::spawn(move || read_stream_events(stdout, event_sender));
    let result = collect_qoder_events(&event_receiver, started_at, cancelled);

    let should_terminate = match &result {
        Ok(run) => run.outcome == AgentTurnOutcome::Waiting,
        Err(_) => true,
    };
    if should_terminate {
        terminate_child(&mut child)?;
    } else {
        let status = child.wait().map_err(|_| AppError::QoderProtocolFailed)?;
        if !status.success() {
            return Err(AppError::QoderTaskFailed);
        }
    }
    reader_handle
        .join()
        .map_err(|_| AppError::QoderProtocolFailed)?;

    result
}

/// Builds Qoder's documented non-interactive stream command from frozen Task settings.
fn build_qoder_task_command(
    executable: &OsStr,
    query: &str,
    config: AgentExecutionConfig<'_>,
    session_id: Option<&str>,
) -> Command {
    let mut command = Command::new(executable);
    let permission_mode = match (config.file_access, config.command_execution) {
        (Some("allow_edits"), Some("allow")) => "bypass_permissions",
        (Some("allow_edits"), _) => "accept_edits",
        _ => "dont_ask",
    };
    if let Some(model) = config.model {
        command.args(["--model", model]);
    }
    if let Some(mode) = config.mode {
        command.args(["--reasoning-effort", mode]);
    }
    if let Some(session_id) = session_id {
        command.args(["--resume", session_id]);
    }
    if config.file_access != Some("allow_edits") {
        command.args(["--disallowed-tools", "Write,Edit,NotebookEdit"]);
    }
    if config.command_execution != Some("allow") {
        command.args(["--disallowed-tools", "Bash"]);
    }
    command
        .args([
            "--print",
            "--output-format",
            "stream-json",
            "--permission-mode",
            permission_mode,
            query,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

/// Collects Qoder's structured messages into the shared result and resumable session contract.
fn collect_qoder_events(
    event_receiver: &Receiver<Result<String, AppError>>,
    started_at: Instant,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    let mut collector = AgentRunMetricsCollector::default();
    let mut response = String::new();
    let mut session_id = None;

    loop {
        let remaining = QODER_RUN_TIMEOUT
            .checked_sub(started_at.elapsed())
            .ok_or(AppError::QoderTimedOut)?;
        let line = receive_cancellable_line(event_receiver, remaining, cancelled)?;
        let message: StreamMessage =
            serde_json::from_str(&line).map_err(|_| AppError::QoderProtocolFailed)?;
        if message.session_id.is_some() {
            session_id = message.session_id.clone();
        }

        if matches!(message.message_type.as_str(), "assistant" | "user") {
            let is_assistant = message.message_type == "assistant";
            if let Some(conversation) = message.message {
                if let Some(usage) = conversation.usage {
                    collector.record_token_usage(usage.into());
                }
                for content in conversation.content {
                    match content.content_type.as_str() {
                        "text" if is_assistant => {
                            if let Some(text) = content.text {
                                collector.record_agent_delta(&text, started_at.elapsed());
                                response.push_str(&text);
                            }
                        }
                        "tool_use" if is_assistant => {
                            if content.name.as_deref() == Some("AskUserQuestion") {
                                return Ok(waiting_output(
                                    response, collector, session_id, started_at,
                                ));
                            }
                            if let (Some(id), Some(name)) = (content.id, content.name) {
                                collector.record_tool_started(&id, &name, started_at.elapsed());
                            }
                        }
                        "tool_result" if !is_assistant => {
                            if let Some(id) = content.tool_use_id {
                                collector.record_tool_finished(&id, started_at.elapsed());
                            }
                        }
                        _ => {}
                    }
                }
            }
            continue;
        }

        if message.message_type == "result" {
            let succeeded =
                message.subtype.as_deref() == Some("success") && message.is_error != Some(true);
            if !succeeded {
                return Err(AppError::QoderTaskFailed);
            }
            if let Some(usage) = message.usage {
                collector.record_token_usage(usage.into());
            }
            if let Some(result) = message.result.filter(|result| !result.is_empty()) {
                response = result;
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
    }
}

/// Preserves partial Qoder output when its structured AskUserQuestion tool pauses the turn.
fn waiting_output(
    response: String,
    collector: AgentRunMetricsCollector,
    session_id: Option<String>,
    started_at: Instant,
) -> AgentSessionRunOutput {
    AgentSessionRunOutput {
        output: AgentRunOutput {
            response,
            metrics: collector.finish(started_at.elapsed()),
        },
        session_id,
        outcome: AgentTurnOutcome::Waiting,
    }
}

/// Polls the event queue so Stop can terminate a silent Qoder process promptly.
fn receive_cancellable_line(
    event_receiver: &Receiver<Result<String, AppError>>,
    timeout: Duration,
    cancelled: &AtomicBool,
) -> Result<String, AppError> {
    let started_at = Instant::now();
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err(AppError::QoderTaskFailed);
        }
        let remaining = timeout
            .checked_sub(started_at.elapsed())
            .ok_or(AppError::QoderTimedOut)?;
        match event_receiver.recv_timeout(remaining.min(Duration::from_millis(100))) {
            Ok(result) => return result,
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => return Err(AppError::QoderProtocolFailed),
        }
    }
}

/// Reads bounded JSONL records so a malformed CLI cannot grow memory without limit.
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
                    .send(Err(AppError::QoderProtocolFailed))
                    .is_err()
                {
                    break;
                }
            }
            Ok(_) => {
                let line = String::from_utf8(bytes).map_err(|_| AppError::QoderProtocolFailed);
                if event_sender.send(line).is_err() {
                    break;
                }
            }
            Err(_) => {
                if event_sender
                    .send(Err(AppError::QoderProtocolFailed))
                    .is_err()
                {
                    break;
                }
            }
        }
    }
}

/// Stops a Qoder child after cancellation, protocol failure, or a waiting turn.
fn terminate_child(child: &mut Child) -> Result<(), AppError> {
    match child.kill() {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => {}
        Err(_) => return Err(AppError::QoderProtocolFailed),
    }
    child
        .wait()
        .map(|_| ())
        .map_err(|_| AppError::QoderProtocolFailed)
}

/// Includes documented aliases and common package-manager locations without starting Qoder IDE.
fn qoder_executable_candidates() -> Vec<OsString> {
    let mut candidates = vec![
        OsString::from("qoder"),
        OsString::from("qodercli"),
        OsString::from("qoderclicn"),
    ];

    #[cfg(target_os = "macos")]
    candidates.extend([
        OsString::from("/usr/local/bin/qoder"),
        OsString::from("/opt/homebrew/bin/qoder"),
    ]);

    if let Some(home) = dirs::home_dir() {
        candidates.push(
            home.join(".qoder")
                .join("entry")
                .join("qoder")
                .into_os_string(),
        );
    }

    candidates
}

#[cfg(test)]
mod tests {
    use super::{
        build_qoder_task_command, collect_qoder_events, login_from_status_json, StreamUsage,
    };
    use crate::adapters::agent::{AgentExecutionConfig, AgentTurnOutcome};
    use crate::domain::agent_run::TokenUsage;
    use std::ffi::OsStr;
    use std::sync::atomic::AtomicBool;
    use std::sync::mpsc;
    use std::time::Instant;

    #[test]
    fn reads_qoder_login_status_from_official_json() {
        let login = login_from_status_json(r#"{"logged_in":true,"version":"1.1.41"}"#)
            .expect("valid Qoder status should parse");

        assert!(login.installed);
        assert!(login.logged_in);
        assert_eq!(
            login.authentication_method.as_deref(),
            Some("Qoder account")
        );
    }

    #[test]
    fn task_command_uses_frozen_permissions_model_and_session() {
        let command = build_qoder_task_command(
            OsStr::new("qoder"),
            "fix tests",
            AgentExecutionConfig {
                model: Some("ultimate"),
                mode: Some("high"),
                file_access: Some("allow_edits"),
                command_execution: Some("allow"),
            },
            Some("session-42"),
        );
        let args: Vec<_> = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();

        assert!(args.windows(2).any(|args| args == ["--model", "ultimate"]));
        assert!(args
            .windows(2)
            .any(|args| args == ["--reasoning-effort", "high"]));
        assert!(args
            .windows(2)
            .any(|args| args == ["--resume", "session-42"]));
        assert!(args
            .windows(2)
            .any(|args| args == ["--permission-mode", "bypass_permissions"]));
        assert!(args
            .windows(2)
            .any(|args| args == ["--output-format", "stream-json"]));
        assert_eq!(args.last().map(String::as_str), Some("fix tests"));
    }

    #[test]
    fn normalizes_qoder_usage_without_double_counting_cache_tokens() {
        let usage = TokenUsage::from(StreamUsage {
            input_tokens: 6_311,
            output_tokens: 33,
            cache_creation_input_tokens: 6_197,
            cache_read_input_tokens: 114,
        });

        assert_eq!(usage.total_tokens, 6_344);
        assert_eq!(usage.input_tokens, 6_311);
        assert_eq!(usage.cached_input_tokens, 114);
        assert_eq!(usage.cache_write_input_tokens, 6_197);
        assert_eq!(usage.output_tokens, 33);
    }

    #[test]
    fn collects_qoder_text_tools_usage_and_session() {
        let (sender, receiver) = mpsc::sync_channel(8);
        sender
            .send(Ok(r#"{"type":"system","subtype":"init","session_id":"session-42","model":"ultimate"}"#.to_string()))
            .expect("system event should send");
        sender
            .send(Ok(r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"tool-1","name":"Read"},{"type":"text","text":"Done"}],"usage":{"input_tokens":10,"output_tokens":2,"cache_creation_input_tokens":7,"cache_read_input_tokens":3}}}"#.to_string()))
            .expect("assistant event should send");
        sender
            .send(Ok(r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tool-1"}]}}"#.to_string()))
            .expect("tool result should send");
        sender
            .send(Ok(r#"{"type":"result","subtype":"success","is_error":false,"result":"Done","session_id":"session-42"}"#.to_string()))
            .expect("result event should send");

        let run = collect_qoder_events(&receiver, Instant::now(), &AtomicBool::new(false))
            .expect("valid Qoder stream should complete");

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
