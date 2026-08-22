import { invoke } from "@tauri-apps/api/core";
import type { AgentRunResult, AgentRuntimeStatus } from "@/types/agent";

/** Checks OpenCode credentials and resolved runtime configuration through official CLI commands. */
const checkOpenCodeLogin = () =>
	invoke<AgentRuntimeStatus>("check_opencode_login");

/**
 * Sends one task through OpenCode's documented non-interactive JSON event mode.
 *
 * @example
 * runOpenCodeTask("解释这个仓库");
 */
const runOpenCodeTask = (query: string) =>
	invoke<AgentRunResult>("run_opencode_task", { request: { query } });

export { checkOpenCodeLogin, runOpenCodeTask };
