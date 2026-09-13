import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	AgentLoginStatusSchema,
	AgentRunResultSchema,
	AgentRuntimeConfigSchema,
	AgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks the local Codex credential state through the Tauri backend. */
const checkCodexLogin = () =>
	invokeWithResponseSchema("check_codex_login", AgentLoginStatusSchema);

/**
 * Returns the complete Codex status needed for the first render.
 *
 * @example
 * checkCodexInitStatus();
 */
const checkCodexInitStatus = () =>
	invokeWithResponseSchema("check_codex_init_status", AgentRuntimeStatusSchema);

/**
 * Reads effective Codex defaults without repeating `codex login status`.
 *
 * @example
 * getCodexRuntimeConfig();
 */
const getCodexRuntimeConfig = () =>
	invokeWithResponseSchema(
		"get_codex_runtime_config",
		AgentRuntimeConfigSchema,
	);

/** Subscribes to native changes in the effective local Codex configuration. */
const onCodexConfigChanged = (listener: (config: AgentRuntimeConfig) => void) =>
	listenWithResponseSchema(
		"codex-config-changed",
		AgentRuntimeConfigSchema,
		listener,
	);

/**
 * Sends one natural-language task to the local Codex App Server.
 *
 * @example
 * runCodexTask("解释这个仓库");
 */
const runCodexTask = (query: string) =>
	invokeWithResponseSchema("run_codex_task", AgentRunResultSchema, {
		request: { query },
	});

export {
	checkCodexInitStatus,
	checkCodexLogin,
	getCodexRuntimeConfig,
	onCodexConfigChanged,
	runCodexTask,
};
