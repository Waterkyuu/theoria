import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	CompiledAgentLoginStatusSchema,
	CompiledAgentRunResultSchema,
	CompiledAgentRuntimeConfigSchema,
	CompiledAgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks the local Codex credential state through the Tauri backend. */
const checkCodexLogin = () =>
	invokeWithResponseSchema("check_codex_login", CompiledAgentLoginStatusSchema);

/**
 * Returns the complete Codex status needed for the first render.
 *
 * @example
 * checkCodexInitStatus();
 */
const checkCodexInitStatus = () =>
	invokeWithResponseSchema(
		"check_codex_init_status",
		CompiledAgentRuntimeStatusSchema,
	);

/**
 * Reads effective Codex defaults without repeating `codex login status`.
 *
 * @example
 * getCodexRuntimeConfig();
 */
const getCodexRuntimeConfig = () =>
	invokeWithResponseSchema(
		"get_codex_runtime_config",
		CompiledAgentRuntimeConfigSchema,
	);

/** Subscribes to native changes in the effective local Codex configuration. */
const onCodexConfigChanged = (listener: (config: AgentRuntimeConfig) => void) =>
	listenWithResponseSchema(
		"codex-config-changed",
		CompiledAgentRuntimeConfigSchema,
		listener,
	);

/**
 * Sends one natural-language task to the local Codex App Server.
 *
 * @example
 * runCodexTask("解释这个仓库");
 */
const runCodexTask = (query: string) =>
	invokeWithResponseSchema("run_codex_task", CompiledAgentRunResultSchema, {
		request: { query },
	});

export {
	checkCodexInitStatus,
	checkCodexLogin,
	getCodexRuntimeConfig,
	onCodexConfigChanged,
	runCodexTask,
};
