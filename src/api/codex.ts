import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	AgentLoginStatus,
	AgentRunResult,
	AgentRuntimeConfig,
	AgentRuntimeStatus,
} from "@/types/agent";

/** Checks the local Codex credential state through the Tauri backend. */
const checkCodexLogin = () => invoke<AgentLoginStatus>("check_codex_login");

/**
 * Returns the complete Codex status needed for the first render.
 *
 * @example
 * checkCodexInitStatus();
 */
const checkCodexInitStatus = () =>
	invoke<AgentRuntimeStatus>("check_codex_init_status");

/**
 * Reads effective Codex defaults without repeating `codex login status`.
 *
 * @example
 * getCodexRuntimeConfig();
 */
const getCodexRuntimeConfig = () =>
	invoke<AgentRuntimeConfig>("get_codex_runtime_config");

/** Subscribes to native changes in the effective local Codex configuration. */
const onCodexConfigChanged = (listener: (config: AgentRuntimeConfig) => void) =>
	listen<AgentRuntimeConfig>("codex-config-changed", (event) => {
		listener(event.payload);
	});

/**
 * Sends one natural-language task to the local Codex App Server.
 *
 * @example
 * runCodexTask("解释这个仓库");
 */
const runCodexTask = (query: string) =>
	invoke<AgentRunResult>("run_codex_task", { request: { query } });

export {
	checkCodexInitStatus,
	checkCodexLogin,
	getCodexRuntimeConfig,
	onCodexConfigChanged,
	runCodexTask,
};
