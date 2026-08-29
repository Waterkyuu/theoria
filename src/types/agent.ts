type AgentKind = "claude" | "codex" | "opencode" | "workbuddy";

type AgentActivityStatus = "running" | "waiting" | "finish" | "error";

type AgentActivity = {
	/** Opaque local identifier that does not reveal the product session ID. */
	id: string;
	/** Product-provided conversation title when one can be resolved locally. */
	title: string | null;
	/** Agent product that owns the observed task. */
	agent: AgentKind;
	/** Product-derived lifecycle normalized for the run board. */
	status: AgentActivityStatus;
	/** Latest source observation time in Unix milliseconds. */
	updatedAtMs: number;
};

type AgentActivitiesResponse = {
	/** Recent task summaries ordered by latest source activity. */
	activities: AgentActivity[];
};

type AgentProcessStates = {
	/** Whether a Claude Code process is currently running. */
	claude: boolean;
	/** Whether a Codex process is currently running. */
	codex: boolean;
	/** Whether an OpenCode process is currently running. */
	opencode: boolean;
	/** Whether a WorkBuddy process is currently running. */
	workbuddy: boolean;
};

type AgentLoginStatus = {
	/** Whether the local agent product was discovered. */
	installed: boolean;
	/** Whether the local agent product has active credentials. */
	loggedIn: boolean;
	/** Safe authentication mode reported by the agent. */
	authenticationMethod: string | null;
};

type AgentRuntimeConfig = {
	/** Effective model selected for new tasks. */
	model: string | null;
	/** Effective reasoning effort selected for new tasks. */
	reasoningEffort: string | null;
};

type AgentRuntimeStatus = AgentLoginStatus & AgentRuntimeConfig;

type AgentRuntimeState =
	| {
			/** Indicates that the local runtime probe has not finished. */
			status: "checking";
	  }
	| {
			/** Indicates that the local runtime probe completed successfully. */
			status: "resolved";
			/** Runtime details returned by the local Agent probe. */
			value: AgentRuntimeStatus;
	  }
	| {
			/** Indicates that the local runtime probe failed. */
			status: "failed";
	  };

type TokenUsage = {
	/** Total tokens consumed by the task. */
	totalTokens: number;
	/** Tokens included in the model input. */
	inputTokens: number;
	/** Input tokens served from cache. */
	cachedInputTokens: number;
	/** Input tokens written into cache. */
	cacheWriteInputTokens: number;
	/** Tokens included in the model output. */
	outputTokens: number;
	/** Output tokens consumed by reasoning when reported by the agent. */
	reasoningOutputTokens: number | null;
};

type ToolCallMetric = {
	/** One-based start order within the current Agent task. */
	sequence: number;
	/** Stable tool name supplied by the source Agent protocol. */
	name: string;
	/** Wall-clock duration between the tool request and matching result. */
	durationMs: number;
};

type AgentRunResult = {
	/** Incrementally assembled assistant response. */
	response: string;
	/** Milliseconds from task submission until completion. */
	totalDurationMs: number;
	/** Milliseconds from task submission until the first assistant text delta. */
	timeToFirstTokenMs: number | null;
	/** Token usage reported for this task. */
	tokenUsage: TokenUsage | null;
	/** Sum of explicit reasoning or thinking intervals in milliseconds. */
	thinkingDurationMs: number;
	/** Number of context compactions reported during this task. */
	compactionCount: number | null;
	/** Number of tools invoked during this task. */
	toolCallCount: number;
	/** Tool invocations retained in source start order. */
	toolCalls: ToolCallMetric[];
};

export type {
	AgentActivitiesResponse,
	AgentActivity,
	AgentActivityStatus,
	AgentKind,
	AgentLoginStatus,
	AgentProcessStates,
	AgentRunResult,
	AgentRuntimeConfig,
	AgentRuntimeState,
	AgentRuntimeStatus,
	TokenUsage,
	ToolCallMetric,
};
