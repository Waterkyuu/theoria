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
		/** Exact final answer check. */ kind: z.literal("answer"),
		/** Expected answer. */ expected: z.string(),
	}),
	z.object({
		/** Required output file. */ kind: z.literal("file_exists"),
		/** Relative output path. */ path: z.string(),
	}),
	z.object({
		/** Text content check. */ kind: z.literal("file_text"),
		/** Relative output path. */ path: z.string(),
		/** Required text. */ expected: z.string(),
	}),
	z.object({
		/** JSON output check. */ kind: z.literal("file_json"),
		/** Relative output path. */ path: z.string(),
		/** Expected JSON text. */ expected: z.string(),
	}),
	z.object({
		/** Controlled Python validator. */ kind: z.literal("python"),
		/** Private script asset. */ script: BenchmarkFileSchema,
	}),
]);
const BenchmarkCaseSchema = z.object({
	/** Unique name in this suite. */ name: z.string(),
	/** Complete task requirements. */ prompt: z.string(),
	/** Per-agent time limit. */ timeoutMinutes: z.number().int(),
	/** Public starting files. */ inputFiles: z.array(BenchmarkFileSchema),
	/** Automatic scoring criteria. */ checks: z.array(BenchmarkCheckSchema),
});
const BenchmarkDocumentSchema = z.object({
	/** Portable document format. */ schemaVersion: z.number().int(),
	/** Display name. */ name: z.string(),
	/** Purpose of the suite. */ description: z.string(),
	/** Exactly one selected local tag on publication. */ tagId: z
		.string()
		.nullable(),
	/** Optional provenance. */ source: z.string().nullable(),
	/** Complete ordered suite. */ cases: z.array(BenchmarkCaseSchema),
});
const BenchmarkTagSchema = z.object({
	/** Stable classification ID. */ id: z.string(),
	/** Display label. */ name: z.string(),
	/** Gravity icon export. */ icon: z.string(),
	/** Protected fallback tag. */ isSystem: z.boolean(),
});
const BenchmarkSummarySchema = z.object({
	/** Definition route ID. */ id: z.string(),
	/** Display title. */ name: z.string(),
	/** Card description. */ description: z.string(),
	/** Single tag relation. */ tagId: z.string(),
	/** Backend-owned author. */ author: z.enum(["platform", "myself"]),
	/** Optional attribution. */ source: z.string().nullable(),
	/** Whether new mounts are forbidden. */ archived: z.boolean(),
	/** Latest published version ID. */ versionId: z.string(),
	/** Latest version number. */ versionNumber: z.number().int(),
	/** Published case count. */ caseCount: z.number().int(),
	/** Creation timestamp. */ createdAtMs: z.number().int(),
});
const BenchmarkDetailSchema = z.object({
	/** Current display metadata. */ summary: BenchmarkSummarySchema,
	/** Selected immutable version. */ versionId: z.string(),
	/** Selected version number. */ versionNumber: z.number().int(),
	/** All selected cases and resources. */ document: BenchmarkDocumentSchema,
});
const BenchmarkDraftSchema = z.object({
	/** Editor route ID. */ id: z.string(),
	/** Original definition for an edit. */ benchmarkId: z.string().nullable(),
	/** Optimistic save revision. */ revision: z.number().int(),
	/** Incomplete editor content. */ document: BenchmarkDocumentSchema,
	/** Last successful save. */ updatedAtMs: z.number().int(),
});
const BenchmarkMountSchema = z.object({
	/** Relationship route ID. */ id: z.string(),
	/** Owning workspace. */ workspaceId: z.string(),
	/** Published definition. */ benchmarkId: z.string(),
	/** Pinned version, never implicitly upgraded. */ versionId: z.string(),
	/** Mount timestamp. */ createdAtMs: z.number().int(),
});
const BenchmarkPreviewSchema = z.object({
	/** Checked version. */ versionId: z.string(),
	/** Display version. */ versionNumber: z.number().int(),
	/** Suite name. */ name: z.string(),
	/** Complete case range. */ cases: z.array(
		z.object({
			/** Stable ordering. */ position: z.number().int(),
			/** Case label. */ name: z.string(),
			/** Per-execution limit. */ timeoutMinutes: z.number().int(),
		}),
	),
	/** Ordered products. */ agentKinds: z.array(AgentKindSchema),
	/** Case × Agent total. */ executionCount: z.number().int(),
	/** Explicit file policy. */ fileAccess: z.enum(["read_only", "allow_edits"]),
	/** Explicit command policy. */ commandExecution: z.enum([
		"deny",
		"ask",
		"allow",
	]),
	/** Safe localized blockers. */ issues: z.array(
		z.object({
			/** Missing prerequisite. */ code: z.enum([
				"agent_not_installed",
				"agent_not_authenticated",
				"agent_check_failed",
				"asset_unavailable",
				"verifier_unavailable",
			]),
			/** Affected product. */ agentKind: AgentKindSchema.nullable(),
			/** Affected case position. */ casePosition: z.number().int().nullable(),
		}),
	),
});
type BenchmarkDocument = z.infer<typeof BenchmarkDocumentSchema>;
type BenchmarkDetail = z.infer<typeof BenchmarkDetailSchema>;
type BenchmarkSummary = z.infer<typeof BenchmarkSummarySchema>;
type BenchmarkDraft = z.infer<typeof BenchmarkDraftSchema>;
type BenchmarkMount = z.infer<typeof BenchmarkMountSchema>;
type BenchmarkTag = z.infer<typeof BenchmarkTagSchema>;
type BenchmarkPreview = z.infer<typeof BenchmarkPreviewSchema>;
type BenchmarkFilters = {
	/** Literal name/description query. */ search: string;
	/** OR filters from the tag picker. */ tagIds: string[];
	/** Only local or platform authors exist. */ author:
		| "platform"
		| "myself"
		| null;
	/** Ordering applies before pagination. */ sort:
		| "newest"
		| "updated"
		| "oldest"
		| "alphabetical";
};
type BenchmarkPreviewInput = Pick<
	BenchmarkPreview,
	"agentKinds" | "fileAccess" | "commandExecution"
> & {
	/** Owning workspace. */ workspaceId: string;
	/** Selected mount. */ mountId: string;
	/** Version shown before the check. */ expectedVersionId: string;
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
};
export {
	BenchmarkSummarySchema,
	BenchmarkDetailSchema,
	BenchmarkDraftSchema,
	BenchmarkMountSchema,
	BenchmarkTagSchema,
	BenchmarkPreviewSchema,
};
