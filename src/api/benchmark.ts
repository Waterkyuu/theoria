import { invokeWithResponseSchema } from "@/api/ipc";
import {
	BenchmarkDraftIdsSchema,
	BenchmarkSummariesSchema,
	BenchmarkDetailSchema,
	BenchmarkDraftSchema,
	BenchmarkMountSchema,
	BenchmarkMountsSchema,
	BenchmarkTagSchema,
	BenchmarkTagsSchema,
	BenchmarkPreviewSchema,
	BenchmarkTaskDetailSchema,
	EmptyBenchmarkResponseSchema,
} from "@/types/benchmark";
import type {
	BenchmarkDocument,
	BenchmarkFilters,
	BenchmarkPreviewInput,
	StartBenchmarkTaskInput,
} from "@/types/benchmark";

/**
 * Keeps sorting and filtering ahead of native pagination.
 *
 * @example
 * listBenchmarks(filters, 0);
 */
const listBenchmarks = (filters: BenchmarkFilters, page: number) =>
	invokeWithResponseSchema("list_benchmarks", BenchmarkSummariesSchema, {
		request: { ...filters, page },
	});

/**
 * Loads the pinned version when supplied.
 *
 * @example
 * getBenchmark("suite", "v1");
 */
const getBenchmark = (benchmarkId: string, versionId: string | null = null) =>
	invokeWithResponseSchema("get_benchmark", BenchmarkDetailSchema, {
		request: { benchmarkId, versionId },
	});

/** Loads available classifications. */
const listBenchmarkTags = () =>
	invokeWithResponseSchema("list_benchmark_tags", BenchmarkTagsSchema);

/**
 * Stores an allowed Gravity selection.
 *
 * @example
 * createBenchmarkTag("Coding", "Code");
 */
const createBenchmarkTag = (name: string, icon: string) =>
	invokeWithResponseSchema("create_benchmark_tag", BenchmarkTagSchema, {
		request: { name, icon },
	});

/**
 * Saves with optimistic concurrency.
 *
 * @example
 * saveBenchmarkDraft(document, "draft", 1);
 */
const saveBenchmarkDraft = (
	document: BenchmarkDocument,
	draftId: string | null,
	expectedRevision: number | null,
	benchmarkId: string | null = null,
) =>
	invokeWithResponseSchema("save_benchmark_draft", BenchmarkDraftSchema, {
		request: {
			document,
			draftId,
			expectedRevision,
			...(benchmarkId ? { benchmarkId } : {}),
		},
	});

/**
 * Publishes the reviewed saved revision.
 *
 * @example
 * publishBenchmark("draft", 2);
 */
const publishBenchmark = (draftId: string, expectedRevision: number) =>
	invokeWithResponseSchema("publish_benchmark", BenchmarkDetailSchema, {
		request: { draftId, expectedRevision },
	});

/**
 * Restores an unfinished editor.
 *
 * @example
 * getBenchmarkDraft("draft");
 */
const getBenchmarkDraft = (draftId: string) =>
	invokeWithResponseSchema("get_benchmark_draft", BenchmarkDraftSchema, {
		request: { draftId },
	});

/**
 * Lists saved editor IDs without loading every document.
 *
 * @example
 * listBenchmarkDrafts(0);
 */
const listBenchmarkDrafts = (page: number) =>
	invokeWithResponseSchema("list_benchmark_drafts", BenchmarkDraftIdsSchema, {
		request: { page },
	});

/**
 * Reads fixed workspace relationships.
 *
 * @example
 * listWorkspaceBenchmarks("workspace", 0);
 */
const listWorkspaceBenchmarks = (workspaceId: string, page: number) =>
	invokeWithResponseSchema("list_workspace_benchmarks", BenchmarkMountsSchema, {
		request: { workspaceId, page },
	});

/**
 * Never silently upgrades an existing mount.
 *
 * @example
 * mountBenchmark("workspace", "suite", "v1");
 */
const mountBenchmark = (
	workspaceId: string,
	benchmarkId: string,
	versionId: string,
) =>
	invokeWithResponseSchema("mount_benchmark", BenchmarkMountSchema, {
		request: { workspaceId, benchmarkId, versionId },
	});

/**
 * Removes only the relationship.
 *
 * @example
 * unmountBenchmark("workspace", "mount");
 */
const unmountBenchmark = (workspaceId: string, mountId: string) =>
	invokeWithResponseSchema("unmount_benchmark", EmptyBenchmarkResponseSchema, {
		request: { workspaceId, mountId },
	});

/**
 * Checks the whole suite without model overrides or Task creation.
 *
 * @example
 * previewBenchmarkTask(input);
 */
const previewBenchmarkTask = (request: BenchmarkPreviewInput) =>
	invokeWithResponseSchema("preview_benchmark_task", BenchmarkPreviewSchema, {
		request,
	});

/** Creates one immutable task plan and starts its background execution. */
const startBenchmarkTask = (request: StartBenchmarkTaskInput) =>
	invokeWithResponseSchema("start_benchmark_task", BenchmarkTaskDetailSchema, {
		request,
	});

/** Restores the latest persisted matrix state for one Benchmark Task. */
const getBenchmarkTask = (taskId: string) =>
	invokeWithResponseSchema("get_benchmark_task", BenchmarkTaskDetailSchema, {
		request: { taskId },
	});

export {
	listBenchmarks,
	getBenchmark,
	listBenchmarkTags,
	createBenchmarkTag,
	saveBenchmarkDraft,
	publishBenchmark,
	getBenchmarkDraft,
	listBenchmarkDrafts,
	listWorkspaceBenchmarks,
	mountBenchmark,
	unmountBenchmark,
	previewBenchmarkTask,
	startBenchmarkTask,
	getBenchmarkTask,
};
