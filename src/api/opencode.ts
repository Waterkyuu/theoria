import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	AgentLoginStatusSchema,
	AgentRunResultSchema,
	AgentRuntimeConfigSchema,
	AgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks OpenCode credentials and resolved runtime configuration through official CLI commands. */
const checkOpenCodeLogin = () =>
	invokeWithResponseSchema("check_opencode_login", AgentLoginStatusSchema);

/**
 * Returns the complete OpenCode status needed for the first render.
 *
 * @example
 * checkOpenCodeInitStatus();
 */
const checkOpenCodeInitStatus = () =>
	invokeWithResponseSchema(
		"check_opencode_init_status",
		AgentRuntimeStatusSchema,
	);

/**
 * Reads OpenCode's resolved model configuration without checking credentials.
 *
 * @example
 * getOpenCodeRuntimeConfig();
 */
const getOpenCodeRuntimeConfig = () =>
	invokeWithResponseSchema(
		"get_opencode_runtime_config",
		AgentRuntimeConfigSchema,
	);

/**
 * Subscribes to native changes across OpenCode's file-backed configuration layers.
 *
 * @example
 * onOpenCodeConfigChanged(refreshOpenCodeStatus);
 */
const onOpenCodeConfigChanged = (
	listener: (config: AgentRuntimeConfig) => void,
) =>
	listenWithResponseSchema(
		"opencode-config-changed",
		AgentRuntimeConfigSchema,
		listener,
	);

/**
 * Sends one task through OpenCode's documented non-interactive JSON event mode.
 *
 * @example
 * runOpenCodeTask("解释这个仓库");
 */
const runOpenCodeTask = (query: string) =>
	invokeWithResponseSchema("run_opencode_task", AgentRunResultSchema, {
		request: { query },
	});

export {
	checkOpenCodeInitStatus,
	checkOpenCodeLogin,
	getOpenCodeRuntimeConfig,
	onOpenCodeConfigChanged,
	runOpenCodeTask,
};
