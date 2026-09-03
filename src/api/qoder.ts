import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	CompiledAgentLoginStatusSchema,
	CompiledAgentRunResultSchema,
	CompiledAgentRuntimeConfigSchema,
	CompiledAgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks the local Qoder CLI account state through its documented status command. */
const checkQoderLogin = () =>
	invokeWithResponseSchema("check_qoder_login", CompiledAgentLoginStatusSchema);

/** Returns the complete Qoder CLI status needed for the first render. */
const checkQoderInitStatus = () =>
	invokeWithResponseSchema(
		"check_qoder_init_status",
		CompiledAgentRuntimeStatusSchema,
	);

/** Returns Qoder's runtime model override when one is available. */
const getQoderRuntimeConfig = () =>
	invokeWithResponseSchema(
		"get_qoder_runtime_config",
		CompiledAgentRuntimeConfigSchema,
	);

/** Subscribes to future native Qoder runtime configuration updates. */
const onQoderConfigChanged = (listener: (config: AgentRuntimeConfig) => void) =>
	listenWithResponseSchema(
		"qoder-config-changed",
		CompiledAgentRuntimeConfigSchema,
		listener,
	);

/** Sends one task through Qoder CLI's non-interactive stream-json mode. */
const runQoderTask = (query: string) =>
	invokeWithResponseSchema("run_qoder_task", CompiledAgentRunResultSchema, {
		request: { query },
	});

export {
	checkQoderInitStatus,
	checkQoderLogin,
	getQoderRuntimeConfig,
	onQoderConfigChanged,
	runQoderTask,
};
