import * as z from "zod";
import {
	type AgentKind,
	AgentKindSchema,
	type AgentRunResult,
	AgentRunResultSchema,
} from "@/types/agent";

type ComparisonResultInput = {
	/** Agent product that produced this outcome. */
	agent: AgentKind;
	/** Model configuration captured before execution. */
	model: string | null;
	/** Reasoning configuration captured before execution. */
	reasoningEffort: string | null;
} & (
	| {
			/** Successful outcome discriminator. */
			status: "succeeded";
			/** Completed response and metrics. */
			result: AgentRunResult;
	  }
	| {
			/** Failed outcome discriminator. */
			status: "failed";
			/** Safe localized failure detail. */
			errorMessage: string;
	  }
);

type SaveComparisonHistoryRequest = {
	/** Shared task sent to every selected Agent. */
	query: string;
	/** Final outcome for every selected Agent. */
	results: ComparisonResultInput[];
};

const SaveComparisonHistoryResponseSchema = z.object({
	/** Newly persisted comparison identifier. */
	id: z.int().positive(),
});
const CompiledSaveComparisonHistoryResponseSchema = z.compile(
	SaveComparisonHistoryResponseSchema,
);

const ComparisonCursorSchema = z.object({
	/** UTC timestamp of the final item in the prior page. */
	createdAtMs: z.int().positive(),
	/** Primary key of the final item in the prior page. */
	id: z.int().positive(),
});

const ComparisonAgentSummarySchema = z.object({
	/** Agent represented by this summary. */
	agent: AgentKindSchema,
	/** Success or failure state. */
	status: z.literal(["succeeded", "failed"]),
});

const ComparisonSummarySchema = z.object({
	/** Persistent comparison identifier. */
	id: z.int().positive(),
	/** Shared task text. */
	query: z.string(),
	/** Aggregate completion state. */
	status: z.literal(["completed", "partial", "failed"]),
	/** Metric calculation contract version. */
	metricVersion: z.int().positive(),
	/** UTC Unix timestamp in milliseconds. */
	createdAtMs: z.int().positive(),
	/** Selected Agent outcomes without response bodies. */
	agents: z.array(ComparisonAgentSummarySchema),
});

const ComparisonHistoryPageSchema = z.object({
	/** Summaries ordered newest first. */
	items: z.array(ComparisonSummarySchema),
	/** Cursor for the next page. */
	nextCursor: ComparisonCursorSchema.nullable(),
});
const CompiledComparisonHistoryPageSchema = z.compile(
	ComparisonHistoryPageSchema,
);

const ComparisonResultDetailSchema = z.object({
	/** Agent product represented by this result. */
	agent: AgentKindSchema,
	/** Model configuration captured at execution time. */
	model: z.string().nullable(),
	/** Reasoning configuration captured at execution time. */
	reasoningEffort: z.string().nullable(),
	/** Success or failure state. */
	status: z.literal(["succeeded", "failed"]),
	/** Successful response and metrics. */
	result: AgentRunResultSchema.nullable(),
	/** Safe failure detail. */
	errorMessage: z.string().nullable(),
});

const ComparisonHistoryDetailSchema = z.object({
	/** Persistent comparison identifier. */
	id: z.int().positive(),
	/** Shared task text. */
	query: z.string(),
	/** Aggregate completion state. */
	status: z.literal(["completed", "partial", "failed"]),
	/** Metric calculation contract version. */
	metricVersion: z.int().positive(),
	/** UTC Unix timestamp in milliseconds. */
	createdAtMs: z.int().positive(),
	/** Complete outcomes for every selected Agent. */
	results: z.array(ComparisonResultDetailSchema),
});
const CompiledComparisonHistoryDetailSchema = z.compile(
	ComparisonHistoryDetailSchema,
);

type ComparisonCursor = z.infer<typeof ComparisonCursorSchema>;
type ComparisonAgentSummary = z.infer<typeof ComparisonAgentSummarySchema>;
type ComparisonSummary = z.infer<typeof ComparisonSummarySchema>;
type ComparisonHistoryPage = z.infer<typeof ComparisonHistoryPageSchema>;
type ComparisonResultDetail = z.infer<typeof ComparisonResultDetailSchema>;
type ComparisonHistoryDetail = z.infer<typeof ComparisonHistoryDetailSchema>;

export type {
	ComparisonAgentSummary,
	ComparisonCursor,
	ComparisonHistoryDetail,
	ComparisonHistoryPage,
	ComparisonResultDetail,
	ComparisonResultInput,
	ComparisonSummary,
	SaveComparisonHistoryRequest,
};
export {
	CompiledComparisonHistoryDetailSchema,
	CompiledComparisonHistoryPageSchema,
	CompiledSaveComparisonHistoryResponseSchema,
};
