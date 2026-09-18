use crate::adapters::agent::{
    AgentAdapter, AgentExecutionConfig, AgentSessionRunOutput, AgentStatusAdapter,
};
use crate::adapters::claude::{ClaudeRuntimeSettingsCache, SystemClaudeAdapter};
use crate::adapters::codex::{CodexRuntimeDefaultsCache, SystemCodexAdapter};
use crate::adapters::opencode::SystemOpenCodeAdapter;
use crate::adapters::workbuddy::SystemWorkBuddyAdapter;
use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark_task::BenchmarkAgentInvocation;
use crate::error::AppError;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Runtime configuration caches shared with one blocking Agent adapter call.
#[derive(Clone)]
pub(crate) struct AgentRuntimeCaches {
    /// Cached Codex configuration monitor state.
    pub(crate) codex: CodexRuntimeDefaultsCache,
    /// Cached Claude configuration monitor state.
    pub(crate) claude: ClaudeRuntimeSettingsCache,
}

/// Applies one Benchmark Case deadline around the shared Agent runtime call.
pub(crate) fn run_benchmark_agent(
    invocation: BenchmarkAgentInvocation,
    caches: AgentRuntimeCaches,
) -> Result<AgentSessionRunOutput, AppError> {
    run_benchmark_agent_with(invocation, move |invocation, cancelled| {
        run_agent_turn(
            invocation.agent_kind,
            &invocation.prompt,
            &invocation.working_directory,
            AgentExecutionConfig {
                model: invocation.model.as_deref(),
                mode: invocation.mode.as_deref(),
                file_access: Some(&invocation.file_access),
                command_execution: Some(&invocation.command_execution),
            },
            caches,
            invocation.session_id.as_deref(),
            cancelled,
        )
    })
}

/// Combines Task cancellation with a Case-local deadline without cancelling later matrix cells.
fn run_benchmark_agent_with(
    invocation: BenchmarkAgentInvocation,
    call: impl FnOnce(&BenchmarkAgentInvocation, &AtomicBool) -> Result<AgentSessionRunOutput, AppError>,
) -> Result<AgentSessionRunOutput, AppError> {
    let task_cancelled = invocation.cancellation.clone();
    let call_cancelled = Arc::new(AtomicBool::new(task_cancelled.load(Ordering::Acquire)));
    let timed_out = Arc::new(AtomicBool::new(false));
    let (finished_sender, finished_receiver) = std::sync::mpsc::channel();
    std::thread::scope(|scope| {
        let task_cancellation = task_cancelled.clone();
        let call_cancellation = call_cancelled.clone();
        let timeout_signal = timed_out.clone();
        let timeout = invocation.timeout;
        scope.spawn(move || {
            let deadline = Instant::now() + timeout;
            loop {
                if task_cancellation.load(Ordering::Acquire) {
                    call_cancellation.store(true, Ordering::Release);
                    return;
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    timeout_signal.store(true, Ordering::Release);
                    call_cancellation.store(true, Ordering::Release);
                    return;
                }
                match finished_receiver.recv_timeout(remaining.min(Duration::from_millis(50))) {
                    Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                }
            }
        });
        let result = call(&invocation, &call_cancelled);
        let completion_announced = finished_sender.send(()).is_ok();
        if timed_out.load(Ordering::Acquire) {
            Err(match invocation.agent_kind {
                AgentKind::Codex => AppError::CodexTimedOut,
                AgentKind::Claude => AppError::ClaudeTimedOut,
                AgentKind::OpenCode => AppError::OpenCodeTimedOut,
                AgentKind::WorkBuddy => AppError::WorkBuddyTimedOut,
            })
        } else if !completion_announced && !task_cancelled.load(Ordering::Acquire) {
            Err(AppError::WorkerFailed)
        } else {
            result
        }
    })
}

/// Dispatches one local Agent while preserving the exact prepared cwd.
pub(crate) fn run_agent_turn(
    agent_kind: AgentKind,
    prompt: &str,
    execution_directory: &Path,
    config: AgentExecutionConfig<'_>,
    caches: AgentRuntimeCaches,
    session_id: Option<&str>,
    cancelled: &AtomicBool,
) -> Result<AgentSessionRunOutput, AppError> {
    match agent_kind {
        AgentKind::Codex => SystemCodexAdapter::new(caches.codex)
            .run_session_turn_with_config_cancellable(
                prompt,
                execution_directory,
                config,
                session_id,
                cancelled,
            ),
        AgentKind::Claude => SystemClaudeAdapter::new(caches.claude)
            .run_session_turn_with_config_cancellable(
                prompt,
                execution_directory,
                config,
                session_id,
                cancelled,
            ),
        AgentKind::OpenCode => SystemOpenCodeAdapter.run_session_turn_with_config_cancellable(
            prompt,
            execution_directory,
            config,
            session_id,
            cancelled,
        ),
        AgentKind::WorkBuddy => SystemWorkBuddyAdapter.run_session_turn_with_config_cancellable(
            prompt,
            execution_directory,
            config,
            session_id,
            cancelled,
        ),
    }
}

/// Checks executable and authentication availability without loading or overriding model settings.
pub(crate) fn check_local_agent_login(
    agent_kind: AgentKind,
    caches: &AgentRuntimeCaches,
) -> Result<crate::domain::agent_status::AgentLoginStatus, AppError> {
    match agent_kind {
        AgentKind::Codex => SystemCodexAdapter::new(caches.codex.clone()).check_login(),
        AgentKind::Claude => SystemClaudeAdapter::new(caches.claude.clone()).check_login(),
        AgentKind::OpenCode => SystemOpenCodeAdapter.check_login(),
        AgentKind::WorkBuddy => SystemWorkBuddyAdapter.check_login(),
    }
}

#[cfg(test)]
mod tests {
    use super::run_benchmark_agent_with;
    use crate::adapters::agent::{AgentSessionRunOutput, AgentTurnOutcome};
    use crate::domain::agent_kind::AgentKind;
    use crate::domain::agent_run::{AgentRunMetricsCollector, AgentRunOutput};
    use crate::domain::benchmark_task::BenchmarkAgentInvocation;
    use crate::error::AppError;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn case_timeout_does_not_cancel_the_parent_task() {
        let task_cancellation = Arc::new(AtomicBool::new(false));
        let invocation = BenchmarkAgentInvocation {
            agent_kind: AgentKind::Codex,
            prompt: "test".to_string(),
            working_directory: PathBuf::from("."),
            model: None,
            mode: None,
            file_access: "read_only".to_string(),
            command_execution: "deny".to_string(),
            session_id: None,
            timeout: Duration::from_millis(5),
            cancellation: task_cancellation.clone(),
        };
        let result = run_benchmark_agent_with(invocation, |_, cancelled| {
            while !cancelled.load(Ordering::Acquire) {
                std::thread::yield_now();
            }
            Ok(AgentSessionRunOutput {
                session_id: None,
                outcome: AgentTurnOutcome::Completed,
                output: AgentRunOutput {
                    response: String::new(),
                    metrics: AgentRunMetricsCollector::default().finish(Duration::ZERO),
                },
            })
        });

        assert!(matches!(result, Err(AppError::CodexTimedOut)));
        assert!(!task_cancellation.load(Ordering::Acquire));
    }
}
