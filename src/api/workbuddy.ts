import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	AgentLoginStatus,
	AgentRunResult,
	AgentRuntimeConfig,
	AgentRuntimeStatus,
} from "@/types/agent";

/** Checks the local WorkBuddy account state through the Tauri backend. */
const checkWorkBuddyLogin = () =>
	invoke<AgentLoginStatus>("check_workbuddy_login");

/**
 * Returns the complete WorkBuddy status needed for the first render.
 *
 * @example
 * checkWorkBuddyInitStatus();
 */
const checkWorkBuddyInitStatus = () =>
	invoke<AgentRuntimeStatus>("check_workbuddy_init_status");

/**
 * Reads WorkBuddy settings and activates its lazy LevelDB watcher when available.
 *
 * @example
 * getWorkBuddyRuntimeConfig();
 */
const getWorkBuddyRuntimeConfig = () =>
	invoke<AgentRuntimeConfig>("get_workbuddy_runtime_config");

/**
 * Subscribes to debounced native WorkBuddy model configuration changes.
 *
 * @example
 * onWorkBuddyConfigChanged(setWorkBuddyConfig);
 */
const onWorkBuddyConfigChanged = (
	listener: (config: AgentRuntimeConfig) => void,
) =>
	listen<AgentRuntimeConfig>("workbuddy-config-changed", (event) => {
		listener(event.payload);
	});

/**
 * Sends one natural-language task to the local WorkBuddy runtime.
 *
 * @example
 * runWorkBuddyTask("解释这个仓库");
 */
const runWorkBuddyTask = (query: string) =>
	invoke<AgentRunResult>("run_workbuddy_task", { request: { query } });

export {
	checkWorkBuddyInitStatus,
	checkWorkBuddyLogin,
	getWorkBuddyRuntimeConfig,
	onWorkBuddyConfigChanged,
	runWorkBuddyTask,
};
