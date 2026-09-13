import { z } from "zod";
import { AgentKindSchema } from "@/types/agent";

const BenchmarkFileSchema = z.object({
	/** Portable path within one case. */
	path: z.string(),
	/** App-owned immutable resource. */
	assetId: z.string(),
});

const BenchmarkAssetPreviewSchema = z.object({
	/** Opaque managed identifier requested by the caller. */
	assetId: z.string().min(1),
	/** Complete file size before preview truncation. */
	sizeBytes: z.number().int().nonnegative(),
	/** UTF-8 prefix, or null for binary content. */
	text: z.string().nullable(),
	/** Whether trailing bytes were omitted. */
	truncated: z.boolean(),
});

const BenchmarkCheckKindSchema = z.literal([
	"answer",
	"file_exists",
	"file_text",
	"file_json",
	"python",
]);

const BenchmarkImportPreviewSchema = z.object({
	/** Proposed catalog name. */
	name: z.string(),
	/** Proposed catalog description. */
	description: z.string(),
	/** Optional external attribution. */
	source: z.string().nullable(),
	/** Bounded Case summaries in template order. */
	cases: z.array(
		z.object({
			/** Proposed Case name. */
			name: z.string(),
			/** Per-Agent execution deadline. */
			timeoutMinutes: z.number().int(),
			/** Number of public files copied into the Case workspace. */
			inputFileCount: z.number().int().nonnegative(),
			/** Stable kinds of checks configured for the Case. */
			checkKinds: z.array(BenchmarkCheckKindSchema),
		}),
	),
	/** Total public inputs and private verifier files. */
	fileCount: z.number().int().nonnegative(),
	/** Field-addressable problems retained for draft repair. */
	issues: z.array(
		z.object({
			/** Field path that can be mapped back to the editor. */
			field: z.string(),
			/** Stable import-validation rule identifier. */
			code: z.string(),
		}),
	),
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
	/** Stable IPC error code for field-addressable publication failures. */
	code: z.literal("BENCHMARK_VALIDATION_FAILED"),
	/** Safe structured error payload consumed by the editor. */
	details: z.object({
		/** Discriminant separating these issues from other IPC details. */
		kind: z.literal("benchmarkValidation"),
		/** Complete bounded publication issues. */
		issues: z.array(BenchmarkValidationIssueSchema),
	}),
});

const BenchmarkTagUsageSchema = z.object({
	/** Definitions reassigned when the selected Tag is deleted. */
	benchmarkCount: z.number().int().nonnegative(),
});

const BenchmarkEvaluationReportSchema = z.object({
	/** Overall result; true only when every public check passed. */
	passed: z.boolean(),
	/** Bounded public checks returned by built-in or controlled validators. */
	checks: z.array(
		z.object({
			/** Stable check kind used by the result UI. */
			kind: z.string().min(1),
			/** Relative artifact path addressed by the check, when applicable. */
			path: z.string().nullable(),
			/** Whether this individual check succeeded. */
			passed: z.boolean(),
			/** Stable safe result message identifier. */
			message: z.string().min(1),
		}),
	),
});

const BenchmarkArtifactFileSchema = z.object({
	/** Portable path within the final execution workspace. */
	path: z.string().min(1),
	/** Final size, or baseline size for a deleted file. */
	sizeBytes: z.number().int().nonnegative(),
	/** Exact comparison against the immutable Case baseline. */
	change: z.enum(["added", "modified", "deleted", "unchanged"]),
});

const BenchmarkArtifactPreviewSchema = z.object({
	/** Portable path within the final execution workspace. */
	path: z.string().min(1),
	/** Complete file size before preview truncation. */
	sizeBytes: z.number().int().nonnegative(),
	/** UTF-8 prefix, or null for binary content. */
	text: z.string().nullable(),
	/** Whether trailing bytes were omitted. */
	truncated: z.boolean(),
});

const BenchmarkArtifactFilesSchema = z.array(BenchmarkArtifactFileSchema);

const BenchmarkExecutionMetricsSchema = z.object({
	/** Full Agent execution duration in milliseconds. */
	totalDurationMs: z.number().int().nonnegative(),
	/** Delay until the first non-empty Agent response delta. */
	timeToFirstTokenMs: z.number().int().nonnegative().nullable(),
	/** Token categories when the source Agent reports them. */
	tokenUsage: z
		.object({
			/** Total input and output tokens. */
			totalTokens: z.number().int().nonnegative(),
			/** Tokens included in model input. */
			inputTokens: z.number().int().nonnegative(),
			/** Input tokens served from cache. */
			cachedInputTokens: z.number().int().nonnegative(),
			/** Input tokens written into cache. */
			cacheWriteInputTokens: z.number().int().nonnegative(),
			/** Tokens included in model output. */
			outputTokens: z.number().int().nonnegative(),
			/** Output tokens consumed by reasoning when reported. */
			reasoningOutputTokens: z.number().int().nonnegative().nullable(),
		})
		.nullable(),
	/** Number of recorded tool calls. */
	toolCallCount: z.number().int().nonnegative(),
	/** Tool calls retained in source start order. */
	toolCalls: z.array(
		z.object({
			/** Stable tool name supplied by the source protocol. */
			name: z.string(),
			/** Wall-clock execution duration in milliseconds. */
			durationMs: z.number().int().nonnegative(),
		}),
	),
});

const BenchmarkTaskDetailSchema = z.object({
	/** Common Task identity and lifecycle. */
	task: z.object({
		/** Stable local Task identifier. */
		id: z.string().min(1),
		/** Workspace that owns the Benchmark Task. */
		workspaceId: z.string().min(1).nullable(),
		/** User-visible Task title. */
		title: z.string().min(1),
		/** Discriminant used by the shared task route. */
		kind: z.literal("benchmark"),
		/** Aggregate persisted lifecycle state. */
		status: z.literal([
			"preparing",
			"running",
			"waiting",
			"completed",
			"failed",
			"stopped",
		]),
		/** Time after which execution configuration cannot change. */
		configurationLockedAtMs: z.number().int().nullable(),
		/** Optional pin time used by the shared sidebar. */
		pinnedAtMs: z.number().int().nullable(),
		/** Creation time in Unix milliseconds. */
		createdAtMs: z.number().int(),
		/** Latest lifecycle update time in Unix milliseconds. */
		updatedAtMs: z.number().int(),
	}),
	/** Published definition used by the Task. */
	benchmarkId: z.string().min(1),
	/** Display name captured for the result header. */
	benchmarkName: z.string().min(1),
	/** Immutable published version executed by the Task. */
	versionId: z.string().min(1),
	/** User-visible version number. */
	versionNumber: z.number().int().positive(),
	/** Historical Task that initiated this Rerun, when present. */
	rerunOfTaskId: z.string().min(1).nullable(),
	/** Whether every planned cell has a complete normal result. */
	resultCompleteness: z.enum(["complete", "incomplete"]),
	/** Stable reason for an incomplete result matrix. */
	completionReason: z.string().nullable(),
	/** Whether the user requested cancellation. */
	cancelRequested: z.boolean(),
	/** Frozen file access policy. */
	fileAccess: z.enum(["read_only", "allow_edits"]),
	/** Frozen command execution policy. */
	commandExecution: z.enum(["deny", "ask", "allow"]),
	/** Aggregate matrix completion counts. */
	progress: z.object({
		/** Number of planned matrix cells. */
		total: z.number().int().nonnegative(),
		/** Number of terminal matrix cells. */
		finished: z.number().int().nonnegative(),
		/** Number of passing evaluations. */
		passed: z.number().int().nonnegative(),
		/** Number of failing evaluations. */
		failed: z.number().int().nonnegative(),
		/** Number of terminal cells without an evaluation verdict. */
		errors: z.number().int().nonnegative(),
	}),
	/** Matrix columns and per-Agent aggregates. */
	agents: z.array(
		z.object({
			/** Stable Task Agent row identifier. */
			id: z.string().min(1),
			/** Local Agent product selected for this column. */
			agentKind: AgentKindSchema,
			/** Stable matrix column order. */
			position: z.number().int().nonnegative(),
			/** Number of passing evaluations for this Agent. */
			passed: z.number().int().nonnegative(),
			/** Number of failing evaluations for this Agent. */
			failed: z.number().int().nonnegative(),
			/** Number of planned Cases for this Agent. */
			total: z.number().int().nonnegative(),
			/** Complete pass rate, absent until every Case is countable. */
			passRate: z.number().min(0).max(1).nullable(),
			/** Sum of reported execution durations. */
			totalDurationMs: z.number().nonnegative(),
			/** Number of executions contributing duration data. */
			durationCoverage: z.number().int().nonnegative(),
			/** Sum of reported token totals. */
			totalTokens: z.number().nonnegative(),
			/** Number of executions contributing token data. */
			tokenCoverage: z.number().int().nonnegative(),
			/** Sum of reported tool-call counts. */
			toolCallCount: z.number().int().nonnegative(),
		}),
	),
	/** Frozen matrix rows in published order. */
	cases: z.array(
		z.object({
			/** Stable Task Case row identifier. */
			id: z.string().min(1),
			/** Published immutable Case identifier. */
			caseId: z.string().min(1),
			/** Stable matrix row order. */
			position: z.number().int().nonnegative(),
			/** User-visible Case name. */
			name: z.string().min(1),
			/** Complete requirements sent to every selected Agent. */
			prompt: z.string(),
			/** Per-execution deadline in minutes. */
			timeoutMinutes: z.number().int().positive(),
		}),
	),
	/** Complete Case × Agent result matrix. */
	executions: z.array(
		z.object({
			/** Stable execution cell identifier. */
			id: z.string().min(1),
			/** Frozen Task Case row used by this cell. */
			taskCaseId: z.string().min(1),
			/** Frozen Task Agent row used by this cell. */
			taskAgentId: z.string().min(1),
			/** Database-constrained lifecycle phase for this execution cell. */
			phase: z.literal([
				"queued",
				"preparing",
				"running",
				"waiting_permission",
				"collecting",
				"evaluating",
				"stopping",
				"finished",
			]),
			/** Verdict, terminal reason, or current phase displayed in the matrix. */
			result: z.string().min(1),
			/** Terminal reason when the cell has no verdict. */
			terminationReason: z.string().nullable(),
			/** Final Agent response when one was produced. */
			responseText: z.string().nullable(),
			/** Typed normalized metrics when the Agent reported them. */
			metrics: BenchmarkExecutionMetricsSchema.nullable(),
			/** Execution start time in Unix milliseconds. */
			startedAtMs: z.number().int().nullable(),
			/** Execution completion time in Unix milliseconds. */
			finishedAtMs: z.number().int().nullable(),
			/** Passed or failed evaluation verdict. */
			verdict: z.enum(["passed", "failed"]).nullable(),
			/** Typed deterministic evaluation report. */
			report: BenchmarkEvaluationReportSchema.nullable(),
		}),
	),
});

const BenchmarkSummariesSchema = z.array(BenchmarkSummarySchema);
const BenchmarkMountsSchema = z.array(BenchmarkMountSchema);
const BenchmarkTagsSchema = z.array(BenchmarkTagSchema);
const BenchmarkDraftIdsSchema = z.array(z.string());
const EmptyBenchmarkResponseSchema = z.null();

type BenchmarkDocument = z.infer<typeof BenchmarkDocumentSchema>;

type BenchmarkFile = z.infer<typeof BenchmarkFileSchema>;

type BenchmarkCheck = z.infer<typeof BenchmarkCheckSchema>;

type BenchmarkAssetPreview = z.infer<typeof BenchmarkAssetPreviewSchema>;

type BenchmarkImportPreview = z.infer<typeof BenchmarkImportPreviewSchema>;

type BenchmarkDetail = z.infer<typeof BenchmarkDetailSchema>;

type BenchmarkSummary = z.infer<typeof BenchmarkSummarySchema>;

type BenchmarkDraft = z.infer<typeof BenchmarkDraftSchema>;

type BenchmarkMount = z.infer<typeof BenchmarkMountSchema>;

type BenchmarkTag = z.infer<typeof BenchmarkTagSchema>;

type BenchmarkPreview = z.infer<typeof BenchmarkPreviewSchema>;

type BenchmarkTaskDetail = z.infer<typeof BenchmarkTaskDetailSchema>;

type BenchmarkArtifactFile = z.infer<typeof BenchmarkArtifactFileSchema>;

type BenchmarkArtifactPreview = z.infer<typeof BenchmarkArtifactPreviewSchema>;

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
	/** Client retry identity for this exact launch request. */
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
	BenchmarkFile,
	BenchmarkCheck,
	BenchmarkAssetPreview,
	BenchmarkImportPreview,
	BenchmarkDetail,
	BenchmarkSummary,
	BenchmarkDraft,
	BenchmarkMount,
	BenchmarkTag,
	BenchmarkPreview,
	BenchmarkFilters,
	BenchmarkPreviewInput,
	BenchmarkTaskDetail,
	BenchmarkArtifactFile,
	BenchmarkArtifactPreview,
	BenchmarkValidationIssue,
	BenchmarkTagUsage,
	RerunBenchmarkTaskInput,
	StartBenchmarkTaskInput,
};

export {
	BenchmarkFileSchema,
	BenchmarkAssetPreviewSchema,
	BenchmarkImportPreviewSchema,
	BenchmarkSummarySchema,
	BenchmarkDetailSchema,
	BenchmarkDraftSchema,
	BenchmarkMountSchema,
	BenchmarkTagSchema,
	BenchmarkPreviewSchema,
	BenchmarkTaskDetailSchema,
	BenchmarkArtifactFilesSchema,
	BenchmarkArtifactPreviewSchema,
	BenchmarkValidationErrorSchema,
	BenchmarkTagUsageSchema,
	BenchmarkSummariesSchema,
	BenchmarkMountsSchema,
	BenchmarkTagsSchema,
	BenchmarkDraftIdsSchema,
	EmptyBenchmarkResponseSchema,
};
