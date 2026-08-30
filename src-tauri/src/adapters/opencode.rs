use crate::adapters::agent::{
    validate_execution_directory, AgentAdapter, AgentExecutionConfig, AgentSessionRunOutput,
    AgentStatusAdapter,
};
use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput, TokenUsage};
use crate::domain::agent_status::{AgentLoginStatus, AgentRuntimeConfig};
use crate::error::AppError;
use serde::Deserialize;
use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::io::{self, BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::thread;
use std::time::{Duration, Instant};

const OPENCODE_RUN_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_EVENT_BYTES: usize = 1024 * 1024;
const EVENT_QUEUE_CAPACITY: usize = 64;

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SystemOpenCodeAdapter;

impl AgentStatusAdapter for SystemOpenCodeAdapter {
    fn check_login(&self) -> Result<AgentLoginStatus, AppError> {
        let executable = match find_usable_opencode_executable() {
            Ok(executable) => executable,
            Err(AppError::OpenCodeNotInstalled) => return Ok(AgentLoginStatus::default()),
            Err(error) => return Err(error),
        };
        let output = Command::new(executable)
            .args(["auth", "list"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| AppError::OpenCodeProbeFailed)?;
        if !output.status.success() {
            return Err(AppError::OpenCodeProbeFailed);
        }
        let stdout = String::from_utf8(output.stdout).map_err(|_| AppError::OpenCodeProbeFailed)?;

        Ok(login_from_auth_output(&stdout))
    }

    fn load_runtime_config(&self) -> Result<AgentRuntimeConfig, AppError> {
        let executable = find_usable_opencode_executable()?;
        let output = Command::new(executable)
            .args(["debug", "config"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| AppError::OpenCodeProbeFailed)?;
        if !output.status.success() {
            return Err(AppError::OpenCodeProbeFailed);
        }
        let stdout = String::from_utf8(output.stdout).map_err(|_| AppError::OpenCodeProbeFailed)?;

        runtime_config_from_json(&stdout)
    }
}

impl AgentAdapter for SystemOpenCodeAdapter {
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
        .map(|run| run.output)
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
        let executable = find_usable_opencode_executable()?;
        run_opencode_task(
            &executable,
            query,
            execution_directory,
            config,
            session_id,
            cancelled,
        )
    }
}

#[derive(Debug, Default, Deserialize)]
struct OpenCodeConfig {
    /// Global model in provider/model form when the default agent has no override.
    model: Option<String>,
    /// Name of the primary agent used when a run does not specify one.
    default_agent: Option<String>,
    /// Agent-specific model and variant overrides from the resolved configuration.
    #[serde(default)]
    agent: HashMap<String, OpenCodeAgentConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct OpenCodeAgentConfig {
    /// Model override for this configured agent.
    model: Option<String>,
    /// Provider-specific reasoning variant for this configured agent.
    variant: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenCodeRunEvent {
    /// CLI JSON stream event discriminator.
    #[serde(rename = "type")]
    event_type: String,
    /// Unix millisecond timestamp added by the official run command.
    timestamp: Option<u64>,
    /// Completed message part carried by text, reasoning, tool, and step events.
    part: Option<OpenCodePart>,
    /// Opaque session identifier shared by every event in one OpenCode run.
    #[serde(rename = "sessionID")]
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenCodePart {
    /// Official message-part discriminator.
    #[serde(rename = "type")]
    part_type: String,
    /// Stable part identifier used to pair metric intervals.
    id: String,
    /// Completed assistant text or reasoning content.
    text: Option<String>,
    /// Stable tool name for tool parts.
    tool: Option<String>,
    /// Source timestamps for text, reasoning, and tool parts.
    time: Option<OpenCodeTime>,
    /// Completed or failed tool state.
    state: Option<OpenCodeToolState>,
    /// Token counters carried by a step-finish part.
    tokens: Option<OpenCodeTokens>,
}

#[derive(Debug, Deserialize)]
struct OpenCodeTime {
    /// Unix millisecond start timestamp.
    start: u64,
    /// Unix millisecond completion timestamp.
    end: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct OpenCodeToolState {
    /// Official tool lifecycle value such as completed or error.
    status: String,
    /// Tool interval timestamps supplied once execution finishes.
    time: Option<OpenCodeTime>,
}

#[derive(Debug, Deserialize)]
struct OpenCodeTokens {
    /// Total tokens calculated by OpenCode when available.
    total: Option<u64>,
    /// Non-cache model input tokens.
    input: u64,
    /// Generated output tokens excluding separately reported reasoning tokens.
    output: u64,
    /// Reasoning output tokens.
    reasoning: u64,
    /// Cache read and write token counters.
    cache: OpenCodeCacheTokens,
}

#[derive(Debug, Deserialize)]
struct OpenCodeCacheTokens {
    /// Input tokens served from cache.
    read: u64,
    /// Input tokens written into cache.
    write: u64,
}

impl From<OpenCodeTokens> for TokenUsage {
    fn from(tokens: OpenCodeTokens) -> Self {
        let input_tokens = tokens
            .input
            .saturating_add(tokens.cache.read)
            .saturating_add(tokens.cache.write);
        Self {
            total_tokens: tokens
                .total
                .unwrap_or_else(|| input_tokens.saturating_add(tokens.output)),
            input_tokens,
            cached_input_tokens: tokens.cache.read,
            cache_write_input_tokens: tokens.cache.write,
            output_tokens: tokens.output,
            reasoning_output_tokens: Some(tokens.reasoning),
        }
    }
}

fn login_from_auth_output(authentication_output: &str) -> AgentLoginStatus {
    let plain_output = strip_ansi_escape_sequences(authentication_output);
    let stored_count = summary_count(&plain_output, "credentials");
    let environment_count = summary_count(&plain_output, "environment variable");
    let logged_in = stored_count > 0 || environment_count > 0;
    let authentication_method = match (stored_count > 0, environment_count > 0) {
        (true, _) => Some("configured provider".to_string()),
        (false, true) => Some("environment credential".to_string()),
        (false, false) => None,
    };
    AgentLoginStatus {
        installed: true,
        logged_in,
        authentication_method,
    }
}

fn runtime_config_from_json(configuration_output: &str) -> Result<AgentRuntimeConfig, AppError> {
    let config: OpenCodeConfig =
        serde_json::from_str(configuration_output).map_err(|_| AppError::OpenCodeProbeFailed)?;
    let default_agent = config.default_agent.as_deref().unwrap_or("build");
    let agent = config.agent.get(default_agent);

    Ok(AgentRuntimeConfig {
        model: non_empty_value(agent.and_then(|item| item.model.clone()).or(config.model)),
        reasoning_effort: non_empty_value(agent.and_then(|item| item.variant.clone())),
    })
}

fn summary_count(output: &str, suffix: &str) -> u64 {
    output
        .lines()
        .find_map(|line| {
            let line = line.trim();
            let suffix_index = line.find(suffix)?;
            line[..suffix_index]
                .split_whitespace()
                .next_back()?
                .parse()
                .ok()
        })
        .unwrap_or_default()
}

fn strip_ansi_escape_sequences(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut bytes = value.bytes();
    while let Some(byte) = bytes.next() {
        if byte != 0x1b {
            result.push(char::from(byte));
            continue;
        }
        if bytes.next() != Some(b'[') {
            continue;
        }
        for control_byte in bytes.by_ref() {
            if (0x40..=0x7e).contains(&control_byte) {
                break;
            }
        }
    }
    result
}

fn non_empty_value(value: Option<String>) -> Option<String> {
    value.filter(|item| !item.trim().is_empty())
}

fn find_usable_opencode_executable() -> Result<OsString, AppError> {
    for executable in opencode_executable_candidates() {
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
            Err(_) => return Err(AppError::OpenCodeProbeFailed),
        }
    }
    Err(AppError::OpenCodeNotInstalled)
}

/// Runs the documented non-interactive JSON mode and keeps all protocol parsing off the UI thread.
fn run_opencode_task(
    executable: &OsStr,
    query: &str,
    execution_directory: &Path,
    config: AgentExecutionConfig<'_>,
    session_id: Option<&str>,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    let started_at = Instant::now();
    let mut command = build_opencode_task_command(executable, query, config, session_id);
    command.current_dir(execution_directory);
    let mut child = command
        .spawn()
        .map_err(|_| AppError::OpenCodeProtocolFailed)?;
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_child(&mut child)?;
            return Err(AppError::OpenCodeProtocolFailed);
        }
    };
    let (event_sender, event_receiver) = mpsc::sync_channel(EVENT_QUEUE_CAPACITY);
    let reader_handle = thread::spawn(move || read_stream_events(stdout, event_sender));
    let result = collect_opencode_events_cancellable(
        &event_receiver,
        started_at,
        OPENCODE_RUN_TIMEOUT,
        cancelled,
    );

    let status_result = if result.is_err() {
        terminate_child(&mut child)
    } else {
        let status = child.wait().map_err(|_| AppError::OpenCodeProtocolFailed)?;
        if !status.success() {
            Err(AppError::OpenCodeTaskFailed)
        } else {
            Ok(())
        }
    };
    drop(event_receiver);
    reader_handle
        .join()
        .map_err(|_| AppError::OpenCodeProtocolFailed)?;
    status_result?;
    result
}

/// Builds OpenCode's JSON command from the immutable Task model and variant.
fn build_opencode_task_command(
    executable: &OsStr,
    query: &str,
    config: AgentExecutionConfig<'_>,
    session_id: Option<&str>,
) -> Command {
    let mut command = Command::new(executable);
    command.args(["run", "--format", "json", "--thinking"]);
    if let Some(model) = config.model {
        command.args(["--model", model]);
    }
    if let Some(mode) = config.mode {
        command.args(["--variant", mode]);
    }
    if let Some(session_id) = session_id {
        command.args(["--session", session_id]);
    }
    command
        .arg("--")
        .arg(query)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

/// Consumes newline-delimited CLI events until the official stream closes after step completion.
#[cfg(test)]
fn collect_opencode_events(
    event_receiver: &Receiver<Result<String, AppError>>,
    started_at: Instant,
    timeout: Duration,
) -> Result<AgentRunOutput, AppError> {
    collect_opencode_events_cancellable(
        event_receiver,
        started_at,
        timeout,
        &AtomicBool::new(false),
    )
    .map(|run| run.output)
}

fn collect_opencode_events_cancellable(
    event_receiver: &Receiver<Result<String, AppError>>,
    started_at: Instant,
    timeout: Duration,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    let mut collector = AgentRunMetricsCollector::default();
    let mut response = String::new();
    let mut protocol_started_at_ms = None;
    let mut completed = false;
    let mut session_id = None;

    loop {
        let remaining = timeout
            .checked_sub(started_at.elapsed())
            .ok_or(AppError::OpenCodeTimedOut)?;
        if cancelled.load(Ordering::Acquire) {
            return Err(AppError::OpenCodeTaskFailed);
        }
        let line = match event_receiver.recv_timeout(remaining.min(Duration::from_millis(100))) {
            Ok(result) => result?,
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => break,
        };
        let event: OpenCodeRunEvent =
            serde_json::from_str(&line).map_err(|_| AppError::OpenCodeProtocolFailed)?;
        if event.session_id.is_some() {
            session_id = event.session_id.clone();
        }
        if event.event_type == "error" {
            return Err(AppError::OpenCodeTaskFailed);
        }
        let Some(part) = event.part else {
            continue;
        };
        match part.part_type.as_str() {
            "step-start" => {
                protocol_started_at_ms = event.timestamp.or(protocol_started_at_ms);
            }
            "text" => {
                let text = part.text.unwrap_or_default();
                let observed_at = part
                    .time
                    .as_ref()
                    .map(|time| protocol_elapsed(protocol_started_at_ms, time.start))
                    .unwrap_or_else(|| started_at.elapsed());
                collector.record_agent_delta(&text, observed_at);
                response.push_str(&text);
            }
            "reasoning" => {
                if let Some(time) = part.time.and_then(completed_interval) {
                    collector.record_thinking_started(
                        &part.id,
                        protocol_elapsed(protocol_started_at_ms, time.start),
                    );
                    collector.record_thinking_finished(
                        &part.id,
                        protocol_elapsed(protocol_started_at_ms, time.end),
                    );
                }
            }
            "tool" => {
                if let (Some(tool), Some(state)) = (part.tool, part.state) {
                    if matches!(state.status.as_str(), "completed" | "error") {
                        if let Some(time) = state.time.and_then(completed_interval) {
                            collector.record_tool_started(
                                &part.id,
                                &tool,
                                protocol_elapsed(protocol_started_at_ms, time.start),
                            );
                            collector.record_tool_finished(
                                &part.id,
                                protocol_elapsed(protocol_started_at_ms, time.end),
                            );
                        }
                    }
                }
            }
            "step-finish" => {
                if let Some(tokens) = part.tokens {
                    collector.record_token_usage(tokens.into());
                }
                completed = true;
            }
            _ => {}
        }
    }

    if !completed {
        return Err(AppError::OpenCodeProtocolFailed);
    }
    let total_duration = started_at.elapsed();
    Ok(AgentSessionRunOutput {
        output: AgentRunOutput {
            response,
            metrics: collector.finish(total_duration),
        },
        session_id,
    })
}

fn completed_interval(time: OpenCodeTime) -> Option<CompletedInterval> {
    Some(CompletedInterval {
        start: time.start,
        end: time.end?,
    })
}

struct CompletedInterval {
    /// Unix millisecond start timestamp.
    start: u64,
    /// Unix millisecond end timestamp.
    end: u64,
}

fn protocol_elapsed(protocol_started_at_ms: Option<u64>, timestamp_ms: u64) -> Duration {
    Duration::from_millis(
        timestamp_ms.saturating_sub(protocol_started_at_ms.unwrap_or(timestamp_ms)),
    )
}

fn read_stream_events(stdout: impl io::Read, sender: SyncSender<Result<String, AppError>>) {
    let mut reader = BufReader::new(stdout);
    loop {
        let mut bytes = Vec::with_capacity(4096);
        let read_result = reader
            .by_ref()
            .take((MAX_EVENT_BYTES + 1) as u64)
            .read_until(b'\n', &mut bytes);
        let event = match read_result {
            Ok(0) => break,
            Ok(_) if bytes.len() <= MAX_EVENT_BYTES => {
                while matches!(bytes.last(), Some(b'\n' | b'\r')) {
                    bytes.pop();
                }
                String::from_utf8(bytes).map_err(|_| AppError::OpenCodeProtocolFailed)
            }
            Ok(_) | Err(_) => Err(AppError::OpenCodeProtocolFailed),
        };
        let failed = event.is_err();
        if sender.send(event).is_err() || failed {
            break;
        }
    }
}

fn terminate_child(child: &mut Child) -> Result<(), AppError> {
    match child.kill() {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => {}
        Err(_) => return Err(AppError::OpenCodeProtocolFailed),
    }
    child
        .wait()
        .map(|_| ())
        .map_err(|_| AppError::OpenCodeProtocolFailed)
}

fn opencode_executable_candidates() -> Vec<OsString> {
    let mut candidates = vec![OsString::from("opencode")];
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".opencode").join("bin").join("opencode").into());
        candidates.push(home.join(".local").join("bin").join("opencode").into());
    }
    #[cfg(target_os = "macos")]
    candidates.extend([
        OsString::from("/opt/homebrew/bin/opencode"),
        OsString::from("/usr/local/bin/opencode"),
    ]);
    candidates
}

#[cfg(test)]
mod tests {
    use super::{
        build_opencode_task_command, collect_opencode_events, login_from_auth_output,
        runtime_config_from_json,
    };
    use crate::adapters::agent::AgentExecutionConfig;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    #[test]
    fn task_command_uses_the_frozen_model_and_variant() {
        let command = build_opencode_task_command(
            "opencode".as_ref(),
            "test prompt",
            AgentExecutionConfig {
                model: Some("anthropic/claude-sonnet-4-6"),
                mode: Some("high"),
            },
            None,
        );
        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(args
            .windows(2)
            .any(|args| args == ["--model", "anthropic/claude-sonnet-4-6"]));
        assert!(args.windows(2).any(|args| args == ["--variant", "high"]));
    }

    #[test]
    fn resumes_the_exact_opencode_session() {
        let command = build_opencode_task_command(
            "opencode".as_ref(),
            "follow up",
            AgentExecutionConfig::default(),
            Some("session-42"),
        );
        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(args
            .windows(2)
            .any(|args| args == ["--session", "session-42"]));
    }

    #[test]
    fn reads_credentials_and_effective_runtime_configuration() {
        let authentication = login_from_auth_output(
            "Credentials ~/.local/share/opencode/auth.json\nAnthropic oauth\n1 credentials\n",
        );
        let config = runtime_config_from_json(
            r#"{
                "model": "anthropic/claude-sonnet-4-6",
                "default_agent": "build",
                "agent": { "build": { "variant": "high" } }
            }"#,
        )
        .expect("official command output should produce authentication state");

        assert!(authentication.installed);
        assert!(authentication.logged_in);
        assert_eq!(
            authentication.authentication_method.as_deref(),
            Some("configured provider")
        );
        assert_eq!(config.model.as_deref(), Some("anthropic/claude-sonnet-4-6"));
        assert_eq!(config.reasoning_effort.as_deref(), Some("high"));
    }

    #[test]
    fn recognizes_environment_credentials_without_stored_credentials() {
        let authentication = login_from_auth_output(
            "Credentials ~/.local/share/opencode/auth.json\n0 credentials\nEnvironment\nOpenAI OPENAI_API_KEY\n1 environment variable\n",
        );

        assert!(authentication.logged_in);
        assert_eq!(
            authentication.authentication_method.as_deref(),
            Some("environment credential")
        );
    }

    #[test]
    fn collects_official_json_run_events_into_shared_metrics() {
        let (sender, receiver) = mpsc::sync_channel(8);
        for line in [
            r#"{"type":"step_start","timestamp":1000,"sessionID":"ses-1","part":{"type":"step-start","id":"step-1","sessionID":"ses-1","messageID":"msg-1"}}"#,
            r#"{"type":"reasoning","timestamp":1300,"sessionID":"ses-1","part":{"type":"reasoning","id":"reason-1","sessionID":"ses-1","messageID":"msg-1","text":"thinking","time":{"start":1050,"end":1250}}}"#,
            r#"{"type":"tool_use","timestamp":1600,"sessionID":"ses-1","part":{"type":"tool","id":"tool-1","sessionID":"ses-1","messageID":"msg-1","callID":"call-1","tool":"read","state":{"status":"completed","input":{},"output":"ok","title":"Read","metadata":{},"time":{"start":1300,"end":1550}}}}"#,
            r#"{"type":"text","timestamp":1800,"sessionID":"ses-1","part":{"type":"text","id":"text-1","sessionID":"ses-1","messageID":"msg-1","text":"done","time":{"start":1400,"end":1750}}}"#,
            r#"{"type":"step_finish","timestamp":1900,"sessionID":"ses-1","part":{"type":"step-finish","id":"step-2","sessionID":"ses-1","messageID":"msg-1","reason":"stop","cost":0,"tokens":{"total":160,"input":100,"output":40,"reasoning":20,"cache":{"read":30,"write":10}}}}"#,
        ] {
            sender
                .send(Ok(line.to_string()))
                .expect("fixture should queue");
        }
        drop(sender);

        let output = collect_opencode_events(&receiver, Instant::now(), Duration::from_secs(1))
            .expect("valid OpenCode events should complete");

        assert_eq!(output.response, "done");
        assert_eq!(
            output.metrics.time_to_first_token,
            Some(Duration::from_millis(400))
        );
        assert_eq!(output.metrics.thinking_duration, Duration::from_millis(200));
        assert_eq!(output.metrics.tool_calls.len(), 1);
        assert_eq!(output.metrics.tool_calls[0].name, "read");
        assert_eq!(
            output.metrics.tool_calls[0].duration,
            Duration::from_millis(250)
        );
        let usage = output
            .metrics
            .token_usage
            .expect("step finish should supply usage");
        assert_eq!(usage.total_tokens, 160);
        assert_eq!(usage.input_tokens, 140);
        assert_eq!(usage.cached_input_tokens, 30);
        assert_eq!(usage.cache_write_input_tokens, 10);
        assert_eq!(usage.output_tokens, 40);
        assert_eq!(usage.reasoning_output_tokens, Some(20));
    }

    #[test]
    fn turns_official_error_events_into_task_failures() {
        let (sender, receiver) = mpsc::sync_channel(2);
        sender
            .send(Ok(
                r#"{"type":"error","timestamp":1000,"sessionID":"ses-1","error":{"name":"ProviderAuthError","data":{"message":"secret detail"}}}"#
                    .to_string(),
            ))
            .expect("fixture should queue");
        drop(sender);

        assert_eq!(
            collect_opencode_events(&receiver, Instant::now(), Duration::from_secs(1),),
            Err(crate::error::AppError::OpenCodeTaskFailed)
        );
    }
}
