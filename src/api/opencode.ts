import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	AgentLoginStatus,
	AgentRunResult,
	AgentRuntimeConfig,
	AgentRuntimeStatus,
} from "@/types/agent";

/** Checks OpenCode credentials and resolved runtime configuration through official CLI commands. */
const checkOpenCodeLogin = () =>
	invoke<AgentLoginStatus>("check_opencode_login");

/**
 * Returns the complete OpenCode status needed for the first render.
 *
 * @example
 * checkOpenCodeInitStatus();
 */
const checkOpenCodeInitStatus = () =>
	invoke<AgentRuntimeStatus>("check_opencode_init_status");

/**
 * Reads OpenCode's resolved model configuration without checking credentials.
 *
 * @example
 * getOpenCodeRuntimeConfig();
 */
const getOpenCodeRuntimeConfig = () =>
	invoke<AgentRuntimeConfig>("get_opencode_runtime_config");

/**
 * Subscribes to native changes across OpenCode's file-backed configuration layers.
 *
 * @example
 * onOpenCodeConfigChanged(refreshOpenCodeStatus);
 */
const onOpenCodeConfigChanged = (
	listener: (config: AgentRuntimeConfig) => void,
) =>
	listen<AgentRuntimeConfig>("opencode-config-changed", (event) => {
		listener(event.payload);
	});

/**
 * Sends one task through OpenCode's documented non-interactive JSON event mode.
 *
 * @example
 * runOpenCodeTask("解释这个仓库");
 */
const runOpenCodeTask = (query: string) =>
	invoke<AgentRunResult>("run_opencode_task", { request: { query } });

export {
	checkOpenCodeInitStatus,
	checkOpenCodeLogin,
	getOpenCodeRuntimeConfig,
	onOpenCodeConfigChanged,
	runOpenCodeTask,
};
