import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	CompiledAgentLoginStatusSchema,
	CompiledAgentRunResultSchema,
	CompiledAgentRuntimeConfigSchema,
	CompiledAgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks OpenCode credentials and resolved runtime configuration through official CLI commands. */
const checkOpenCodeLogin = () =>
	invokeWithResponseSchema(
		"check_opencode_login",
		CompiledAgentLoginStatusSchema,
	);

/**
 * Returns the complete OpenCode status needed for the first render.
 *
 * @example
 * checkOpenCodeInitStatus();
 */
const checkOpenCodeInitStatus = () =>
	invokeWithResponseSchema(
		"check_opencode_init_status",
		CompiledAgentRuntimeStatusSchema,
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
		CompiledAgentRuntimeConfigSchema,
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
		CompiledAgentRuntimeConfigSchema,
		listener,
	);

/**
 * Sends one task through OpenCode's documented non-interactive JSON event mode.
 *
 * @example
 * runOpenCodeTask("解释这个仓库");
 */
const runOpenCodeTask = (query: string) =>
	invokeWithResponseSchema("run_opencode_task", CompiledAgentRunResultSchema, {
		request: { query },
	});

export {
	checkOpenCodeInitStatus,
	checkOpenCodeLogin,
	getOpenCodeRuntimeConfig,
	onOpenCodeConfigChanged,
	runOpenCodeTask,
};
