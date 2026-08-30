import * as z from "zod";

const AgentKindSchema = z.literal(["claude", "codex", "opencode", "workbuddy"]);

const AgentActivityStatusSchema = z.literal([
	"running",
	"waiting",
	"finish",
	"error",
]);

const AgentActivitySchema = z.object({
	/** Opaque local identifier that does not reveal the product session ID. */
	id: z.string(),
	/** Product-provided conversation title when one can be resolved locally. */
	title: z.string().nullable(),
	/** Agent product that owns the observed task. */
	agent: AgentKindSchema,
	/** Product-derived lifecycle normalized for the run board. */
	status: AgentActivityStatusSchema,
	/** Latest source observation time in Unix milliseconds. */
	updatedAtMs: z.int().nonnegative(),
});

const AgentActivitiesResponseSchema = z.object({
	/** Recent task summaries ordered by latest source activity. */
	activities: z.array(AgentActivitySchema),
});
const CompiledAgentActivitiesResponseSchema = z.compile(
	AgentActivitiesResponseSchema,
);

const AgentProcessStatesSchema = z.object({
	/** Whether a Claude Code process is currently running. */
	claude: z.boolean(),
	/** Whether a Codex process is currently running. */
	codex: z.boolean(),
	/** Whether an OpenCode process is currently running. */
	opencode: z.boolean(),
	/** Whether a WorkBuddy process is currently running. */
	workbuddy: z.boolean(),
});
const CompiledAgentProcessStatesSchema = z.compile(AgentProcessStatesSchema);

const AgentLoginStatusSchema = z.object({
	/** Whether the local agent product was discovered. */
	installed: z.boolean(),
	/** Whether the local agent product has active credentials. */
	loggedIn: z.boolean(),
	/** Safe authentication mode reported by the agent. */
	authenticationMethod: z.string().nullable(),
});
const CompiledAgentLoginStatusSchema = z.compile(AgentLoginStatusSchema);

const AgentRuntimeConfigSchema = z.object({
	/** Effective model selected for new tasks. */
	model: z.string().nullable(),
	/** Effective reasoning effort selected for new tasks. */
	reasoningEffort: z.string().nullable(),
});
const CompiledAgentRuntimeConfigSchema = z.compile(AgentRuntimeConfigSchema);

const AgentRuntimeStatusSchema = z.object({
	...AgentLoginStatusSchema.shape,
	...AgentRuntimeConfigSchema.shape,
});
const CompiledAgentRuntimeStatusSchema = z.compile(AgentRuntimeStatusSchema);

const TokenUsageSchema = z.object({
	/** Total tokens consumed by the task. */
	totalTokens: z.int().nonnegative(),
	/** Tokens included in the model input. */
	inputTokens: z.int().nonnegative(),
	/** Input tokens served from cache. */
	cachedInputTokens: z.int().nonnegative(),
	/** Input tokens written into cache. */
	cacheWriteInputTokens: z.int().nonnegative(),
	/** Tokens included in the model output. */
	outputTokens: z.int().nonnegative(),
	/** Output tokens consumed by reasoning when reported by the agent. */
	reasoningOutputTokens: z.int().nonnegative().nullable(),
});

const ToolCallMetricSchema = z.object({
	/** One-based start order within the current Agent task. */
	sequence: z.int().positive(),
	/** Stable tool name supplied by the source Agent protocol. */
	name: z.string(),
	/** Wall-clock duration between the tool request and matching result. */
	durationMs: z.int().nonnegative(),
});

const AgentRunResultSchema = z.object({
	/** Incrementally assembled assistant response. */
	response: z.string(),
	/** Milliseconds from task submission until completion. */
	totalDurationMs: z.int().nonnegative(),
	/** Milliseconds from task submission until the first assistant text delta. */
	timeToFirstTokenMs: z.int().nonnegative().nullable(),
	/** Token usage reported for this task. */
	tokenUsage: TokenUsageSchema.nullable(),
	/** Sum of explicit reasoning or thinking intervals in milliseconds. */
	thinkingDurationMs: z.int().nonnegative(),
	/** Number of context compactions reported during this task. */
	compactionCount: z.int().nonnegative().nullable(),
	/** Number of tools invoked during this task. */
	toolCallCount: z.int().nonnegative(),
	/** Tool invocations retained in source start order. */
	toolCalls: z.array(ToolCallMetricSchema),
});
const CompiledAgentRunResultSchema = z.compile(AgentRunResultSchema);

type AgentKind = z.infer<typeof AgentKindSchema>;
type AgentActivityStatus = z.infer<typeof AgentActivityStatusSchema>;
type AgentActivity = z.infer<typeof AgentActivitySchema>;
type AgentActivitiesResponse = z.infer<typeof AgentActivitiesResponseSchema>;
type AgentProcessStates = z.infer<typeof AgentProcessStatesSchema>;
type AgentLoginStatus = z.infer<typeof AgentLoginStatusSchema>;
type AgentRuntimeConfig = z.infer<typeof AgentRuntimeConfigSchema>;
type AgentRuntimeStatus = z.infer<typeof AgentRuntimeStatusSchema>;

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

type TokenUsage = z.infer<typeof TokenUsageSchema>;
type ToolCallMetric = z.infer<typeof ToolCallMetricSchema>;
type AgentRunResult = z.infer<typeof AgentRunResultSchema>;

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
export {
	AgentKindSchema,
	AgentRunResultSchema,
	CompiledAgentActivitiesResponseSchema,
	CompiledAgentLoginStatusSchema,
	CompiledAgentProcessStatesSchema,
	CompiledAgentRunResultSchema,
	CompiledAgentRuntimeConfigSchema,
	CompiledAgentRuntimeStatusSchema,
};
