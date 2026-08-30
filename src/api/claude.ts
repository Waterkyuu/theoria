import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	CompiledAgentLoginStatusSchema,
	CompiledAgentRunResultSchema,
	CompiledAgentRuntimeConfigSchema,
	CompiledAgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks the local Claude Code credential state through the Tauri backend. */
const checkClaudeLogin = () =>
	invokeWithResponseSchema(
		"check_claude_login",
		CompiledAgentLoginStatusSchema,
	);

/**
 * Returns the complete Claude status needed for the first render.
 *
 * @example
 * checkClaudeInitStatus();
 */
const checkClaudeInitStatus = () =>
	invokeWithResponseSchema(
		"check_claude_init_status",
		CompiledAgentRuntimeStatusSchema,
	);

/**
 * Reads Claude model settings without repeating its authentication command.
 *
 * @example
 * getClaudeRuntimeConfig();
 */
const getClaudeRuntimeConfig = () =>
	invokeWithResponseSchema(
		"get_claude_runtime_config",
		CompiledAgentRuntimeConfigSchema,
	);

/**
 * Subscribes to changes in the user-level Claude runtime settings.
 *
 * @example
 * onClaudeConfigChanged(refreshClaudeStatus);
 */
const onClaudeConfigChanged = (
	listener: (config: AgentRuntimeConfig) => void,
) =>
	listenWithResponseSchema(
		"claude-config-changed",
		CompiledAgentRuntimeConfigSchema,
		listener,
	);

/**
 * Sends one natural-language task to the local Claude Code runtime.
 *
 * @example
 * runClaudeTask("解释这个仓库");
 */
const runClaudeTask = (query: string) =>
	invokeWithResponseSchema("run_claude_task", CompiledAgentRunResultSchema, {
		request: { query },
	});

export {
	checkClaudeInitStatus,
	checkClaudeLogin,
	getClaudeRuntimeConfig,
	onClaudeConfigChanged,
	runClaudeTask,
};
