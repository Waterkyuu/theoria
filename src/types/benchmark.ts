import { z } from "zod";
import { AgentKindSchema } from "@/types/agent";

const BenchmarkFileSchema = z.object({
	/** Portable path within one case. */
	path: z.string(),
	/** App-owned immutable resource. */
	assetId: z.string(),
});

const BenchmarkCheckSchema = z.discriminatedUnion("kind", [
	z.object({
		/** Exact final answer check. */
		kind: z.literal("answer"),
		/** Expected answer. */
		expected: z.string(),
	}),
	z.object({
		/** Required output file. */
		kind: z.literal("file_exists"),
		/** Relative output path. */
		path: z.string(),
	}),
	z.object({
		/** Text content check. */
		kind: z.literal("file_text"),
		/** Relative output path. */
		path: z.string(),
		/** Required text. */
		expected: z.string(),
	}),
	z.object({
		/** JSON output check. */
		kind: z.literal("file_json"),
		/** Relative output path. */
		path: z.string(),
		/** Expected JSON text. */
		expected: z.string(),
	}),
	z.object({
		/** Controlled Python validator. */
		kind: z.literal("python"),
		/** Private script asset. */
		script: BenchmarkFileSchema,
	}),
]);

const BenchmarkCaseSchema = z.object({
	/** Unique name in this suite. */
	name: z.string(),
	/** Complete task requirements. */
	prompt: z.string(),
	/** Per-agent time limit. */
	timeoutMinutes: z.number().int(),
	/** Public starting files. */
	inputFiles: z.array(BenchmarkFileSchema),
	/** Automatic scoring criteria. */
	checks: z.array(BenchmarkCheckSchema),
});

const BenchmarkDocumentSchema = z.object({
	/** Portable document format. */
	schemaVersion: z.number().int(),
	/** Display name. */
	name: z.string(),
	/** Purpose of the suite. */
	description: z.string(),
	/** Exactly one selected local tag on publication. */
	tagId: z.string().nullable(),
	/** Optional provenance. */
	source: z.string().nullable(),
	/** Complete ordered suite. */
	cases: z.array(BenchmarkCaseSchema),
});

const BenchmarkTagSchema = z.object({
	/** Stable classification ID. */
	id: z.string(),
	/** Display label. */
	name: z.string(),
	/** Gravity icon export. */
	icon: z.string(),
	/** Protected fallback tag. */
	isSystem: z.boolean(),
});

const BenchmarkSummarySchema = z.object({
	/** Definition route ID. */
	id: z.string(),
	/** Display title. */
	name: z.string(),
	/** Card description. */
	description: z.string(),
	/** Single tag relation. */
	tagId: z.string(),
	/** Backend-owned author. */
	author: z.enum(["platform", "myself"]),
	/** Optional attribution. */
	source: z.string().nullable(),
	/** Whether new mounts are forbidden. */
	archived: z.boolean(),
	/** Latest published version ID. */
	versionId: z.string(),
	/** Latest version number. */
	versionNumber: z.number().int(),
	/** Published case count. */
	caseCount: z.number().int(),
	/** Creation timestamp. */
	createdAtMs: z.number().int(),
});

const BenchmarkDetailSchema = z.object({
	/** Current display metadata. */
	summary: BenchmarkSummarySchema,
	/** Selected immutable version. */
	versionId: z.string(),
	/** Selected version number. */
	versionNumber: z.number().int(),
	/** All selected cases and resources. */
	document: BenchmarkDocumentSchema,
});

const BenchmarkDraftSchema = z.object({
	/** Editor route ID. */
	id: z.string(),
	/** Original definition for an edit. */
	benchmarkId: z.string().nullable(),
	/** Optimistic save revision. */
	revision: z.number().int(),
	/** Incomplete editor content. */
	document: BenchmarkDocumentSchema,
	/** Last successful save. */
	updatedAtMs: z.number().int(),
});

const BenchmarkMountSchema = z.object({
	/** Relationship route ID. */
	id: z.string(),
	/** Owning workspace. */
	workspaceId: z.string(),
	/** Published definition. */
	benchmarkId: z.string(),
	/** Pinned version, never implicitly upgraded. */
	versionId: z.string(),
	/** Mount timestamp. */
	createdAtMs: z.number().int(),
});

const BenchmarkPreviewSchema = z.object({
	/** Checked version. */
	versionId: z.string(),
	/** Display version. */
	versionNumber: z.number().int(),
	/** Suite name. */
	name: z.string(),
	/** Complete case range. */
	cases: z.array(
		z.object({
			/** Stable ordering. */
			position: z.number().int(),
			/** Case label. */
			name: z.string(),
			/** Per-execution limit. */
			timeoutMinutes: z.number().int(),
		}),
	),
	/** Ordered products. */
	agentKinds: z.array(AgentKindSchema),
	/** Case × Agent total. */
	executionCount: z.number().int(),
	/** Explicit file policy. */
	fileAccess: z.enum(["read_only", "allow_edits"]),
	/** Explicit command policy. */
	commandExecution: z.enum(["deny", "ask", "allow"]),
	/** Safe localized blockers. */
	issues: z.array(
		z.object({
			/** Missing prerequisite. */
			code: z.enum([
				"agent_not_installed",
				"agent_not_authenticated",
				"agent_check_failed",
				"asset_unavailable",
				"verifier_unavailable",
			]),
			/** Affected product. */
			agentKind: AgentKindSchema.nullable(),
			/** Affected case position. */
			casePosition: z.number().int().nullable(),
		}),
	),
});

const BenchmarkValidationIssueSchema = z.object({
	/** Field path such as cases.0.prompt. */
	field: z.string(),
	/** Stable publication rule identifier. */
	code: z.string(),
});

const BenchmarkValidationErrorSchema = z.object({
	code: z.literal("BENCHMARK_VALIDATION_FAILED"),
	details: z.object({
		kind: z.literal("benchmarkValidation"),
		issues: z.array(BenchmarkValidationIssueSchema),
	}),
});

const BenchmarkTagUsageSchema = z.object({
	/** Definitions reassigned when the selected Tag is deleted. */
	benchmarkCount: z.number().int().nonnegative(),
});

const BenchmarkTaskDetailSchema = z.object({
	task: z.object({
		id: z.string().min(1),
		workspaceId: z.string().min(1).nullable(),
		title: z.string().min(1),
		kind: z.literal("benchmark"),
		status: z.literal([
			"preparing",
			"running",
			"waiting",
			"completed",
			"failed",
			"stopped",
		]),
		configurationLockedAtMs: z.number().int().nullable(),
		pinnedAtMs: z.number().int().nullable(),
		createdAtMs: z.number().int(),
		updatedAtMs: z.number().int(),
	}),
	benchmarkId: z.string().min(1),
	benchmarkName: z.string().min(1),
	versionId: z.string().min(1),
	versionNumber: z.number().int().positive(),
	rerunOfTaskId: z.string().min(1).nullable(),
	resultCompleteness: z.enum(["complete", "incomplete"]),
	completionReason: z.string().nullable(),
	cancelRequested: z.boolean(),
	fileAccess: z.enum(["read_only", "allow_edits"]),
	commandExecution: z.enum(["deny", "ask", "allow"]),
	progress: z.object({
		total: z.number().int().nonnegative(),
		finished: z.number().int().nonnegative(),
		passed: z.number().int().nonnegative(),
		failed: z.number().int().nonnegative(),
		errors: z.number().int().nonnegative(),
	}),
	agents: z.array(
		z.object({
			id: z.string().min(1),
			agentKind: AgentKindSchema,
			position: z.number().int().nonnegative(),
			passed: z.number().int().nonnegative(),
			failed: z.number().int().nonnegative(),
			total: z.number().int().nonnegative(),
			passRate: z.number().min(0).max(1).nullable(),
			totalDurationMs: z.number().nonnegative(),
			durationCoverage: z.number().int().nonnegative(),
			totalTokens: z.number().nonnegative(),
			tokenCoverage: z.number().int().nonnegative(),
			toolCallCount: z.number().int().nonnegative(),
		}),
	),
	cases: z.array(
		z.object({
			id: z.string().min(1),
			caseId: z.string().min(1),
			position: z.number().int().nonnegative(),
			name: z.string().min(1),
			prompt: z.string(),
			timeoutMinutes: z.number().int().positive(),
		}),
	),
	executions: z.array(
		z.object({
			id: z.string().min(1),
			taskCaseId: z.string().min(1),
			taskAgentId: z.string().min(1),
			phase: z.string().min(1),
			result: z.string().min(1),
			terminationReason: z.string().nullable(),
			responseText: z.string().nullable(),
			metrics: z.record(z.string(), z.unknown()).nullable(),
			startedAtMs: z.number().int().nullable(),
			finishedAtMs: z.number().int().nullable(),
			verdict: z.enum(["passed", "failed"]).nullable(),
			report: z.record(z.string(), z.unknown()).nullable(),
		}),
	),
});

const BenchmarkSummariesSchema = z.array(BenchmarkSummarySchema);
const BenchmarkMountsSchema = z.array(BenchmarkMountSchema);
const BenchmarkTagsSchema = z.array(BenchmarkTagSchema);
const BenchmarkDraftIdsSchema = z.array(z.string());
const EmptyBenchmarkResponseSchema = z.null();

type BenchmarkDocument = z.infer<typeof BenchmarkDocumentSchema>;

type BenchmarkDetail = z.infer<typeof BenchmarkDetailSchema>;

type BenchmarkSummary = z.infer<typeof BenchmarkSummarySchema>;

type BenchmarkDraft = z.infer<typeof BenchmarkDraftSchema>;

type BenchmarkMount = z.infer<typeof BenchmarkMountSchema>;

type BenchmarkTag = z.infer<typeof BenchmarkTagSchema>;

type BenchmarkPreview = z.infer<typeof BenchmarkPreviewSchema>;

type BenchmarkTaskDetail = z.infer<typeof BenchmarkTaskDetailSchema>;

type BenchmarkValidationIssue = z.infer<typeof BenchmarkValidationIssueSchema>;

type BenchmarkTagUsage = z.infer<typeof BenchmarkTagUsageSchema>;

type BenchmarkFilters = {
	/** Literal name/description query. */
	search: string;
	/** OR filters from the tag picker. */
	tagIds: string[];
	/** Only local or platform authors exist. */
	author: "platform" | "myself" | null;
	/** Ordering applies before pagination. */
	sort: "newest" | "updated" | "oldest" | "alphabetical";
};

type BenchmarkPreviewInput = Pick<
	BenchmarkPreview,
	"agentKinds" | "fileAccess" | "commandExecution"
> & {
	/** Owning workspace. */
	workspaceId: string;
	/** Selected mount. */
	mountId: string;
	/** Version shown before the check. */
	expectedVersionId: string;
};

type StartBenchmarkTaskInput = BenchmarkPreviewInput & {
	idempotencyKey: string;
};

type RerunBenchmarkTaskInput = Pick<
	BenchmarkTaskDetail,
	"fileAccess" | "commandExecution"
> & {
	/** Terminal Benchmark Task whose immutable version is reused. */
	sourceTaskId: string;
	/** Local Agent products selected for the fresh execution matrix. */
	agentKinds: BenchmarkPreview["agentKinds"];
	/** Explicit approval to recreate an absent historical mount. */
	restoreMount: boolean;
	/** Retry identity for this exact submission. */
	idempotencyKey: string;
};

export type {
	BenchmarkDocument,
	BenchmarkDetail,
	BenchmarkSummary,
	BenchmarkDraft,
	BenchmarkMount,
	BenchmarkTag,
	BenchmarkPreview,
	BenchmarkFilters,
	BenchmarkPreviewInput,
	BenchmarkTaskDetail,
	BenchmarkValidationIssue,
	BenchmarkTagUsage,
	RerunBenchmarkTaskInput,
	StartBenchmarkTaskInput,
};

export {
	BenchmarkSummarySchema,
	BenchmarkDetailSchema,
	BenchmarkDraftSchema,
	BenchmarkMountSchema,
	BenchmarkTagSchema,
	BenchmarkPreviewSchema,
	BenchmarkTaskDetailSchema,
	BenchmarkValidationErrorSchema,
	BenchmarkTagUsageSchema,
	BenchmarkSummariesSchema,
	BenchmarkMountsSchema,
	BenchmarkTagsSchema,
	BenchmarkDraftIdsSchema,
	EmptyBenchmarkResponseSchema,
};
