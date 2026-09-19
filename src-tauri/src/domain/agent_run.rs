use std::time::Duration;

const MAX_TOOL_PAYLOAD_CHARS: usize = 16_384;

fn sanitize_tool_payload(mut value: serde_json::Value) -> serde_json::Value {
    fn redact(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(fields) => {
                for (key, field) in fields {
                    let key = key.to_ascii_lowercase();
                    if matches!(
                        key.as_str(),
                        "api_key"
                            | "apikey"
                            | "authorization"
                            | "password"
                            | "secret"
                            | "token"
                            | "access_token"
                            | "refresh_token"
                    ) {
                        *field = serde_json::Value::String("[redacted]".to_string());
                    } else {
                        redact(field);
                    }
                }
            }
            serde_json::Value::Array(items) => items.iter_mut().for_each(redact),
            _ => {}
        }
    }

    redact(&mut value);
    let serialized = value.to_string();
    let mut chars = serialized.chars();
    let bounded = chars
        .by_ref()
        .take(MAX_TOOL_PAYLOAD_CHARS)
        .collect::<String>();
    if chars.next().is_some() {
        serde_json::Value::String(format!("{bounded}…"))
    } else {
        value
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TokenUsage {
    /// Total input and output tokens reported by the source Agent.
    pub(crate) total_tokens: u64,
    /// All tokens included in model input, including cache reads and writes.
    pub(crate) input_tokens: u64,
    /// Input tokens served from an existing cache entry.
    pub(crate) cached_input_tokens: u64,
    /// Input tokens written into the source Agent's cache.
    pub(crate) cache_write_input_tokens: u64,
    /// Tokens generated in the model output.
    pub(crate) output_tokens: u64,
    /// Output tokens used for reasoning when the source protocol reports them separately.
    pub(crate) reasoning_output_tokens: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ToolCallMetric {
    /// Stable tool name reported by the source Agent protocol.
    pub(crate) name: String,
    /// Serialized parameters supplied to the tool, when the source protocol exposes them.
    pub(crate) arguments: Option<serde_json::Value>,
    /// Serialized terminal output or error returned by the tool.
    pub(crate) result: Option<serde_json::Value>,
    /// Normalized terminal state retained independently from source-specific labels.
    pub(crate) status: String,
    /// Wall-clock time between the tool request and its matching result.
    pub(crate) duration: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AgentRunMetrics {
    /// Full wall-clock duration of the Agent task.
    pub(crate) total_duration: Duration,
    /// Delay before the first non-empty assistant text delta was observed.
    pub(crate) time_to_first_token: Option<Duration>,
    /// Latest cumulative token snapshot reported by the source Agent.
    pub(crate) token_usage: Option<TokenUsage>,
    /// Sum of explicit reasoning or thinking content-block intervals.
    pub(crate) thinking_duration: Duration,
    /// Number of context compaction events observed during this task.
    pub(crate) compaction_count: Option<u64>,
    /// Tool invocations retained in source start order.
    pub(crate) tool_calls: Vec<ToolCallMetric>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AgentRunOutput {
    /// Final assistant response assembled from the source event stream.
    pub(crate) response: String,
    /// Normalized timing, token, and tool-call measurements for the task.
    pub(crate) metrics: AgentRunMetrics,
}

#[derive(Debug, Default)]
pub(crate) struct AgentRunMetricsCollector {
    /// First observed non-empty assistant text offset from task start.
    time_to_first_token: Option<Duration>,
    /// Latest cumulative token snapshot reported by the Agent.
    token_usage: Option<TokenUsage>,
    /// Sum of all completed explicit thinking intervals.
    thinking_duration: Duration,
    /// Context compactions reported by the source Agent protocol.
    compaction_count: Option<u64>,
    /// Thinking block identifiers paired with their task-relative start times.
    active_thinking_intervals: Vec<(String, Duration)>,
    /// Tool calls retained in source start order while metrics are collected.
    tool_calls: Vec<PendingToolCall>,
}

#[derive(Debug)]
struct PendingToolCall {
    /// Protocol identifier used to match the later tool result.
    id: String,
    /// User-visible tool name captured at invocation time.
    name: String,
    /// Serialized invocation parameters captured from the start event.
    arguments: Option<serde_json::Value>,
    /// Serialized terminal output captured from the matching finish event.
    result: Option<serde_json::Value>,
    /// Terminal state, or none until a matching finish event arrives.
    status: Option<String>,
    /// Task-relative wall-clock time when the invocation was observed.
    started_at: Duration,
    /// Completed duration, or none while the tool remains active.
    duration: Option<Duration>,
}

impl AgentRunMetricsCollector {
    /// Captures the first non-empty streamed assistant content observation.
    pub(crate) fn record_agent_delta(&mut self, delta: &str, elapsed: Duration) {
        if self.time_to_first_token.is_none() && !delta.is_empty() {
            self.time_to_first_token = Some(elapsed);
        }
    }

    /// Replaces the usage snapshot because app-server reports the latest turn totals cumulatively.
    pub(crate) fn record_token_usage(&mut self, usage: TokenUsage) {
        self.token_usage = Some(usage);
    }

    /// Marks compaction events as observable even when the run finishes with zero events.
    pub(crate) fn track_context_compactions(&mut self) {
        self.compaction_count = Some(0);
    }

    /// Counts a protocol-reported context compaction without inferring token savings.
    pub(crate) fn record_context_compaction(&mut self) {
        self.compaction_count = Some(self.compaction_count.unwrap_or_default().saturating_add(1));
    }

    /// Starts one named thinking interval unless the source identifier is already active.
    pub(crate) fn record_thinking_started(&mut self, id: &str, elapsed: Duration) {
        if self
            .active_thinking_intervals
            .iter()
            .any(|(active_id, _)| active_id == id)
        {
            return;
        }
        self.active_thinking_intervals
            .push((id.to_string(), elapsed));
    }

    /// Adds one completed thinking interval to the task total.
    pub(crate) fn record_thinking_finished(&mut self, id: &str, elapsed: Duration) {
        let Some(index) = self
            .active_thinking_intervals
            .iter()
            .position(|(active_id, _)| active_id == id)
        else {
            return;
        };
        let (_, started_at) = self.active_thinking_intervals.remove(index);
        self.thinking_duration += elapsed.saturating_sub(started_at);
    }

    /// Records one tool invocation in source start order.
    #[cfg(test)]
    pub(crate) fn record_tool_started(&mut self, id: &str, name: &str, elapsed: Duration) {
        self.record_tool_started_with_details(id, name, None, elapsed);
    }

    pub(crate) fn record_tool_started_with_details(
        &mut self,
        id: &str,
        name: &str,
        arguments: Option<serde_json::Value>,
        elapsed: Duration,
    ) {
        if self.tool_calls.iter().any(|call| call.id == id) {
            return;
        }
        self.tool_calls.push(PendingToolCall {
            id: id.to_string(),
            name: name.to_string(),
            arguments: arguments.map(sanitize_tool_payload),
            result: None,
            status: None,
            started_at: elapsed,
            duration: None,
        });
    }

    /// Completes the matching tool invocation when its result is observed.
    #[cfg(test)]
    pub(crate) fn record_tool_finished(&mut self, id: &str, elapsed: Duration) {
        self.record_tool_finished_with_details(id, None, false, elapsed);
    }

    pub(crate) fn record_tool_finished_with_details(
        &mut self,
        id: &str,
        result: Option<serde_json::Value>,
        failed: bool,
        elapsed: Duration,
    ) {
        let Some(call) = self
            .tool_calls
            .iter_mut()
            .find(|call| call.id == id && call.duration.is_none())
        else {
            return;
        };
        call.result = result.map(sanitize_tool_payload);
        call.status = Some(if failed {
            "failed".to_string()
        } else {
            "completed".to_string()
        });
        call.duration = Some(elapsed.saturating_sub(call.started_at));
    }

    /// Finalizes the immutable metric snapshot when app-server reports turn completion.
    pub(crate) fn finish(mut self, total_duration: Duration) -> AgentRunMetrics {
        // A successful task may finish before a source emits its final stop/result event. Closing
        // active intervals here preserves every observed invocation without inventing a timeout.
        for (_, started_at) in self.active_thinking_intervals {
            self.thinking_duration += total_duration.saturating_sub(started_at);
        }
        let tool_calls = self
            .tool_calls
            .into_iter()
            .map(|call| ToolCallMetric {
                name: call.name,
                arguments: call.arguments,
                result: call.result,
                status: call.status.unwrap_or_else(|| "incomplete".to_string()),
                duration: call
                    .duration
                    .unwrap_or_else(|| total_duration.saturating_sub(call.started_at)),
            })
            .collect();

        AgentRunMetrics {
            total_duration,
            time_to_first_token: self.time_to_first_token,
            token_usage: self.token_usage,
            thinking_duration: self.thinking_duration,
            compaction_count: self.compaction_count,
            tool_calls,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AgentRunMetricsCollector, TokenUsage, MAX_TOOL_PAYLOAD_CHARS};
    use std::time::Duration;

    #[test]
    fn records_first_non_empty_agent_delta_once() {
        let mut collector = AgentRunMetricsCollector::default();

        collector.record_agent_delta("", Duration::from_millis(40));
        collector.record_agent_delta("首", Duration::from_millis(75));
        collector.record_agent_delta("个 token 后的内容", Duration::from_millis(120));

        let metrics = collector.finish(Duration::from_millis(200));

        assert_eq!(metrics.time_to_first_token, Some(Duration::from_millis(75)));
    }

    #[test]
    fn returns_duration_and_latest_turn_token_usage() {
        let mut collector = AgentRunMetricsCollector::default();
        let usage = TokenUsage {
            total_tokens: 120,
            input_tokens: 80,
            cached_input_tokens: 40,
            cache_write_input_tokens: 0,
            output_tokens: 30,
            reasoning_output_tokens: Some(10),
        };

        collector.record_token_usage(usage.clone());
        let metrics = collector.finish(Duration::from_millis(450));

        assert_eq!(metrics.total_duration, Duration::from_millis(450));
        assert_eq!(metrics.token_usage, Some(usage));
    }

    #[test]
    fn counts_every_context_compaction_observed_during_the_run() {
        let mut collector = AgentRunMetricsCollector::default();

        collector.track_context_compactions();
        collector.record_context_compaction();
        collector.record_context_compaction();
        let metrics = collector.finish(Duration::from_millis(450));

        assert_eq!(metrics.compaction_count, Some(2));
    }

    #[test]
    fn reports_zero_when_compaction_tracking_is_supported_but_no_event_occurs() {
        let mut collector = AgentRunMetricsCollector::default();

        collector.track_context_compactions();
        let metrics = collector.finish(Duration::from_millis(450));

        assert_eq!(metrics.compaction_count, Some(0));
    }

    #[test]
    fn records_tool_calls_in_start_order_with_measured_durations() {
        let mut collector = AgentRunMetricsCollector::default();

        collector.record_tool_started("tool-1", "Read", Duration::from_millis(100));
        collector.record_tool_started("tool-2", "Bash", Duration::from_millis(150));
        collector.record_tool_finished("tool-2", Duration::from_millis(350));
        collector.record_tool_finished("tool-1", Duration::from_millis(500));

        let metrics = collector.finish(Duration::from_millis(600));

        assert_eq!(
            metrics.tool_calls,
            vec![
                super::ToolCallMetric {
                    name: "Read".to_string(),
                    arguments: None,
                    result: None,
                    status: "completed".to_string(),
                    duration: Duration::from_millis(400),
                },
                super::ToolCallMetric {
                    name: "Bash".to_string(),
                    arguments: None,
                    result: None,
                    status: "completed".to_string(),
                    duration: Duration::from_millis(200),
                },
            ]
        );
    }

    #[test]
    fn records_tool_arguments_results_and_terminal_status() {
        let mut collector = AgentRunMetricsCollector::default();

        collector.record_tool_started_with_details(
            "tool-1",
            "write_file",
            Some(serde_json::json!({"path": "summary.json"})),
            Duration::from_millis(100),
        );
        collector.record_tool_finished_with_details(
            "tool-1",
            Some(serde_json::json!("workspace is read-only")),
            true,
            Duration::from_millis(450),
        );

        let metrics = collector.finish(Duration::from_millis(500));
        let call = &metrics.tool_calls[0];

        assert_eq!(
            call.arguments,
            Some(serde_json::json!({"path": "summary.json"}))
        );
        assert_eq!(
            call.result,
            Some(serde_json::json!("workspace is read-only"))
        );
        assert_eq!(call.status, "failed");
    }

    #[test]
    fn redacts_and_bounds_persisted_tool_payloads() {
        let mut collector = AgentRunMetricsCollector::default();

        collector.record_tool_started_with_details(
            "tool-1",
            "write_file",
            Some(serde_json::json!({
                "path": "summary.json",
                "authorization": "Bearer private"
            })),
            Duration::ZERO,
        );
        collector.record_tool_finished_with_details(
            "tool-1",
            Some(serde_json::json!("x".repeat(MAX_TOOL_PAYLOAD_CHARS + 10))),
            false,
            Duration::from_millis(1),
        );

        let metrics = collector.finish(Duration::from_millis(1));
        let call = &metrics.tool_calls[0];

        assert_eq!(
            call.arguments,
            Some(serde_json::json!({
                "path": "summary.json",
                "authorization": "[redacted]"
            }))
        );
        assert!(call.result.as_ref().is_some_and(|value| {
            value
                .as_str()
                .is_some_and(|text| text.chars().count() == MAX_TOOL_PAYLOAD_CHARS + 1)
        }));
    }

    #[test]
    fn accumulates_thinking_intervals_and_closes_active_metrics_at_finish() {
        let mut collector = AgentRunMetricsCollector::default();

        collector.record_thinking_started("thinking-1", Duration::from_millis(50));
        collector.record_thinking_finished("thinking-1", Duration::from_millis(250));
        collector.record_thinking_started("thinking-2", Duration::from_millis(300));
        collector.record_tool_started("tool-1", "WebSearch", Duration::from_millis(400));

        let metrics = collector.finish(Duration::from_millis(700));

        assert_eq!(metrics.thinking_duration, Duration::from_millis(600));
        assert_eq!(
            metrics.tool_calls,
            vec![super::ToolCallMetric {
                name: "WebSearch".to_string(),
                arguments: None,
                result: None,
                status: "incomplete".to_string(),
                duration: Duration::from_millis(300),
            }]
        );
    }
}
