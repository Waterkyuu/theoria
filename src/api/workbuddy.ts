import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	CompiledAgentLoginStatusSchema,
	CompiledAgentRunResultSchema,
	CompiledAgentRuntimeConfigSchema,
	CompiledAgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks the local WorkBuddy account state through the Tauri backend. */
const checkWorkBuddyLogin = () =>
	invokeWithResponseSchema(
		"check_workbuddy_login",
		CompiledAgentLoginStatusSchema,
	);

/**
 * Returns the complete WorkBuddy status needed for the first render.
 *
 * @example
 * checkWorkBuddyInitStatus();
 */
const checkWorkBuddyInitStatus = () =>
	invokeWithResponseSchema(
		"check_workbuddy_init_status",
		CompiledAgentRuntimeStatusSchema,
	);

/**
 * Reads WorkBuddy settings and activates its lazy LevelDB watcher when available.
 *
 * @example
 * getWorkBuddyRuntimeConfig();
 */
const getWorkBuddyRuntimeConfig = () =>
	invokeWithResponseSchema(
		"get_workbuddy_runtime_config",
		CompiledAgentRuntimeConfigSchema,
	);

/**
 * Subscribes to debounced native WorkBuddy model configuration changes.
 *
 * @example
 * onWorkBuddyConfigChanged(setWorkBuddyConfig);
 */
const onWorkBuddyConfigChanged = (
	listener: (config: AgentRuntimeConfig) => void,
) =>
	listenWithResponseSchema(
		"workbuddy-config-changed",
		CompiledAgentRuntimeConfigSchema,
		listener,
	);

/**
 * Sends one natural-language task to the local WorkBuddy runtime.
 *
 * @example
 * runWorkBuddyTask("解释这个仓库");
 */
const runWorkBuddyTask = (query: string) =>
	invokeWithResponseSchema("run_workbuddy_task", CompiledAgentRunResultSchema, {
		request: { query },
	});

export {
	checkWorkBuddyInitStatus,
	checkWorkBuddyLogin,
	getWorkBuddyRuntimeConfig,
	onWorkBuddyConfigChanged,
	runWorkBuddyTask,
};
