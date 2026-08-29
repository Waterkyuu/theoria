import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	AgentLoginStatus,
	AgentRunResult,
	AgentRuntimeConfig,
	AgentRuntimeStatus,
} from "@/types/agent";

/** Checks the local Claude Code credential state through the Tauri backend. */
const checkClaudeLogin = () => invoke<AgentLoginStatus>("check_claude_login");

/**
 * Returns the complete Claude status needed for the first render.
 *
 * @example
 * checkClaudeInitStatus();
 */
const checkClaudeInitStatus = () =>
	invoke<AgentRuntimeStatus>("check_claude_init_status");

/**
 * Reads Claude model settings without repeating its authentication command.
 *
 * @example
 * getClaudeRuntimeConfig();
 */
const getClaudeRuntimeConfig = () =>
	invoke<AgentRuntimeConfig>("get_claude_runtime_config");

/**
 * Subscribes to changes in the user-level Claude runtime settings.
 *
 * @example
 * onClaudeConfigChanged(refreshClaudeStatus);
 */
const onClaudeConfigChanged = (
	listener: (config: AgentRuntimeConfig) => void,
) =>
	listen<AgentRuntimeConfig>("claude-config-changed", (event) => {
		listener(event.payload);
	});

/**
 * Sends one natural-language task to the local Claude Code runtime.
 *
 * @example
 * runClaudeTask("解释这个仓库");
 */
const runClaudeTask = (query: string) =>
	invoke<AgentRunResult>("run_claude_task", { request: { query } });

export {
	checkClaudeInitStatus,
	checkClaudeLogin,
	getClaudeRuntimeConfig,
	onClaudeConfigChanged,
	runClaudeTask,
};
