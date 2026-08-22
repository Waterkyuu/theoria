use crate::adapters::agent::AgentAdapter;
use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput, TokenUsage};
use crate::error::AppError;
use serde::Deserialize;
use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::io::{self, BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::thread;
use std::time::{Duration, Instant};

const OPENCODE_RUN_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MAX_EVENT_BYTES: usize = 1024 * 1024;
const EVENT_QUEUE_CAPACITY: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OpenCodeAuthentication {
    /// Indicates whether a usable OpenCode executable was found locally.
    pub(crate) installed: bool,
    /// Indicates whether OpenCode reports a stored or environment-backed provider credential.
    pub(crate) logged_in: bool,
    /// Safe credential category derived from the official authentication listing.
    pub(crate) authentication_method: Option<String>,
    /// Effective model selected by the official resolved configuration.
    pub(crate) model: Option<String>,
    /// Effective model variant selected for the default primary agent.
    pub(crate) reasoning_effort: Option<String>,
}

pub(crate) trait OpenCodeAdapter {
    fn check_authentication(&self) -> Result<OpenCodeAuthentication, AppError>;
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SystemOpenCodeAdapter;

impl OpenCodeAdapter for SystemOpenCodeAdapter {
    /// Uses only documented OpenCode CLI commands so credential and config formats remain owned by OpenCode.
    fn check_authentication(&self) -> Result<OpenCodeAuthentication, AppError> {
        let executable = match find_usable_opencode_executable() {
            Ok(executable) => executable,
            Err(AppError::OpenCodeNotInstalled) => return Ok(not_installed_authentication()),
            Err(error) => return Err(error),
        };
        let auth_output = Command::new(&executable)
            .args(["auth", "list"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| AppError::OpenCodeProbeFailed)?;
        if !auth_output.status.success() {
            return Err(AppError::OpenCodeProbeFailed);
        }
        let auth_stdout =
            String::from_utf8(auth_output.stdout).map_err(|_| AppError::OpenCodeProbeFailed)?;
        let config_output = Command::new(executable)
            .args(["debug", "config"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| AppError::OpenCodeProbeFailed)?;
        let config_stdout = if config_output.status.success() {
            String::from_utf8(config_output.stdout).map_err(|_| AppError::OpenCodeProbeFailed)?
        } else {
            "{}".to_string()
        };

        authentication_from_outputs(&auth_stdout, &config_stdout)
    }
}

impl AgentAdapter for SystemOpenCodeAdapter {
    fn run_task(&self, query: &str) -> Result<AgentRunOutput, AppError> {
        let executable = find_usable_opencode_executable()?;
        run_opencode_task(&executable, query)
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

fn not_installed_authentication() -> OpenCodeAuthentication {
    OpenCodeAuthentication {
        installed: false,
        logged_in: false,
        authentication_method: None,
        model: None,
        reasoning_effort: None,
    }
}

/// Parses the human credential summary and JSON resolved config emitted by official CLI commands.
fn authentication_from_outputs(
    authentication_output: &str,
    configuration_output: &str,
) -> Result<OpenCodeAuthentication, AppError> {
    let plain_output = strip_ansi_escape_sequences(authentication_output);
    let stored_count = summary_count(&plain_output, "credentials");
    let environment_count = summary_count(&plain_output, "environment variable");
    let logged_in = stored_count > 0 || environment_count > 0;
    let authentication_method = match (stored_count > 0, environment_count > 0) {
        (true, _) => Some("configured provider".to_string()),
        (false, true) => Some("environment credential".to_string()),
        (false, false) => None,
    };
    let config: OpenCodeConfig =
        serde_json::from_str(configuration_output).map_err(|_| AppError::OpenCodeProbeFailed)?;
    let default_agent = config.default_agent.as_deref().unwrap_or("build");
    let agent = config.agent.get(default_agent);

    Ok(OpenCodeAuthentication {
        installed: true,
        logged_in,
        authentication_method,
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
fn run_opencode_task(executable: &OsStr, query: &str) -> Result<AgentRunOutput, AppError> {
    let started_at = Instant::now();
    let mut child = Command::new(executable)
        .args(["run", "--format", "json", "--thinking", "--"])
        .arg(query)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
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
    let result = collect_opencode_events(&event_receiver, started_at, OPENCODE_RUN_TIMEOUT);

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

/// Consumes newline-delimited CLI events until the official stream closes after step completion.
fn collect_opencode_events(
    event_receiver: &Receiver<Result<String, AppError>>,
    started_at: Instant,
    timeout: Duration,
) -> Result<AgentRunOutput, AppError> {
    let mut collector = AgentRunMetricsCollector::default();
    let mut response = String::new();
    let mut protocol_started_at_ms = None;
    let mut completed = false;

    loop {
        let remaining = timeout
            .checked_sub(started_at.elapsed())
            .ok_or(AppError::OpenCodeTimedOut)?;
        let line = match event_receiver.recv_timeout(remaining) {
            Ok(result) => result?,
            Err(RecvTimeoutError::Timeout) => return Err(AppError::OpenCodeTimedOut),
            Err(RecvTimeoutError::Disconnected) => break,
        };
        let event: OpenCodeRunEvent =
            serde_json::from_str(&line).map_err(|_| AppError::OpenCodeProtocolFailed)?;
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
    Ok(AgentRunOutput {
        response,
        metrics: collector.finish(total_duration),
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
    use super::{authentication_from_outputs, collect_opencode_events};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    #[test]
    fn reads_credentials_and_effective_runtime_configuration() {
        let authentication = authentication_from_outputs(
            "Credentials ~/.local/share/opencode/auth.json\nAnthropic oauth\n1 credentials\n",
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
        assert_eq!(
            authentication.model.as_deref(),
            Some("anthropic/claude-sonnet-4-6")
        );
        assert_eq!(authentication.reasoning_effort.as_deref(), Some("high"));
    }

    #[test]
    fn recognizes_environment_credentials_without_stored_credentials() {
        let authentication = authentication_from_outputs(
            "Credentials ~/.local/share/opencode/auth.json\n0 credentials\nEnvironment\nOpenAI OPENAI_API_KEY\n1 environment variable\n",
            "{}",
        )
        .expect("environment credentials should count as a usable login");

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
