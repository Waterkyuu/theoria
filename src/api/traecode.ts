import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentRuntimeConfig,
	CompiledAgentLoginStatusSchema,
	CompiledAgentRunResultSchema,
	CompiledAgentRuntimeConfigSchema,
	CompiledAgentRuntimeStatusSchema,
} from "@/types/agent";

/** Checks the local TraeCode CLI account state through its documented login command. */
const checkTraeCodeLogin = () =>
	invokeWithResponseSchema(
		"check_traecode_login",
		CompiledAgentLoginStatusSchema,
	);

/** Returns the complete TraeCode CLI status needed for the first render. */
const checkTraeCodeInitStatus = () =>
	invokeWithResponseSchema(
		"check_traecode_init_status",
		CompiledAgentRuntimeStatusSchema,
	);

/** Returns TraeCode CLI's runtime model override when one is available. */
const getTraeCodeRuntimeConfig = () =>
	invokeWithResponseSchema(
		"get_traecode_runtime_config",
		CompiledAgentRuntimeConfigSchema,
	);

/** Subscribes to future native TraeCode runtime configuration updates. */
const onTraeCodeConfigChanged = (
	listener: (config: AgentRuntimeConfig) => void,
) =>
	listenWithResponseSchema(
		"traecode-config-changed",
		CompiledAgentRuntimeConfigSchema,
		listener,
	);

/** Sends one task through TraeCode CLI's documented non-interactive JSON mode. */
const runTraeCodeTask = (query: string) =>
	invokeWithResponseSchema("run_traecode_task", CompiledAgentRunResultSchema, {
		request: { query },
	});

export {
	checkTraeCodeInitStatus,
	checkTraeCodeLogin,
	getTraeCodeRuntimeConfig,
	onTraeCodeConfigChanged,
	runTraeCodeTask,
};
