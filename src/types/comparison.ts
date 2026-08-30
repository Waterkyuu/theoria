import * as z from "zod";
import {
	type AgentKind,
	type AgentRunResult,
	agentKindSchema,
	agentRunResultSchema,
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

const saveComparisonHistoryResponseSchema = z.compile(
	z.object({
		/** Newly persisted comparison identifier. */
		id: z.int().positive(),
	}),
);

const comparisonCursorSchema = z.compile(
	z.object({
		/** UTC timestamp of the final item in the prior page. */
		createdAtMs: z.int().positive(),
		/** Primary key of the final item in the prior page. */
		id: z.int().positive(),
	}),
);

const comparisonAgentSummarySchema = z.compile(
	z.object({
		/** Agent represented by this summary. */
		agent: agentKindSchema,
		/** Success or failure state. */
		status: z.enum(["succeeded", "failed"]),
	}),
);

const comparisonSummarySchema = z.compile(
	z.object({
		/** Persistent comparison identifier. */
		id: z.int().positive(),
		/** Shared task text. */
		query: z.string(),
		/** Aggregate completion state. */
		status: z.enum(["completed", "partial", "failed"]),
		/** Metric calculation contract version. */
		metricVersion: z.int().positive(),
		/** UTC Unix timestamp in milliseconds. */
		createdAtMs: z.int().positive(),
		/** Selected Agent outcomes without response bodies. */
		agents: z.array(comparisonAgentSummarySchema),
	}),
);

const comparisonHistoryPageSchema = z.compile(
	z.object({
		/** Summaries ordered newest first. */
		items: z.array(comparisonSummarySchema),
		/** Cursor for the next page. */
		nextCursor: comparisonCursorSchema.nullable(),
	}),
);

const comparisonResultDetailSchema = z.compile(
	z.object({
		/** Agent product represented by this result. */
		agent: agentKindSchema,
		/** Model configuration captured at execution time. */
		model: z.string().nullable(),
		/** Reasoning configuration captured at execution time. */
		reasoningEffort: z.string().nullable(),
		/** Success or failure state. */
		status: z.enum(["succeeded", "failed"]),
		/** Successful response and metrics. */
		result: agentRunResultSchema.nullable(),
		/** Safe failure detail. */
		errorMessage: z.string().nullable(),
	}),
);

const comparisonHistoryDetailSchema = z.compile(
	z.object({
		/** Persistent comparison identifier. */
		id: z.int().positive(),
		/** Shared task text. */
		query: z.string(),
		/** Aggregate completion state. */
		status: z.enum(["completed", "partial", "failed"]),
		/** Metric calculation contract version. */
		metricVersion: z.int().positive(),
		/** UTC Unix timestamp in milliseconds. */
		createdAtMs: z.int().positive(),
		/** Complete outcomes for every selected Agent. */
		results: z.array(comparisonResultDetailSchema),
	}),
);

type ComparisonCursor = z.infer<typeof comparisonCursorSchema>;
type ComparisonAgentSummary = z.infer<typeof comparisonAgentSummarySchema>;
type ComparisonSummary = z.infer<typeof comparisonSummarySchema>;
type ComparisonHistoryPage = z.infer<typeof comparisonHistoryPageSchema>;
type ComparisonResultDetail = z.infer<typeof comparisonResultDetailSchema>;
type ComparisonHistoryDetail = z.infer<typeof comparisonHistoryDetailSchema>;

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
	comparisonHistoryDetailSchema,
	comparisonHistoryPageSchema,
	saveComparisonHistoryResponseSchema,
};
