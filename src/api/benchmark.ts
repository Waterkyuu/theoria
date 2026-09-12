import { invokeWithResponseSchema } from "@/api/ipc";
import {
	BenchmarkDraftIdsSchema,
	BenchmarkAssetPreviewSchema,
	BenchmarkSummariesSchema,
	BenchmarkDetailSchema,
	BenchmarkDraftSchema,
	BenchmarkMountSchema,
	BenchmarkMountsSchema,
	BenchmarkFileSchema,
	BenchmarkImportPreviewSchema,
	BenchmarkTagSchema,
	BenchmarkTagUsageSchema,
	BenchmarkTagsSchema,
	BenchmarkPreviewSchema,
	BenchmarkTaskDetailSchema,
	EmptyBenchmarkResponseSchema,
} from "@/types/benchmark";
import type {
	BenchmarkDocument,
	BenchmarkFilters,
	BenchmarkPreviewInput,
	RerunBenchmarkTaskInput,
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

/** Hides one personal definition from the default catalog without deleting history. */
const archiveBenchmark = (benchmarkId: string) =>
	invokeWithResponseSchema("archive_benchmark", BenchmarkDetailSchema, {
		request: { benchmarkId },
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

/** Loads the reassignment count displayed before deleting a personal Tag. */
const getBenchmarkTagUsage = (tagId: string) =>
	invokeWithResponseSchema("get_benchmark_tag_usage", BenchmarkTagUsageSchema, {
		request: { tagId },
	});

/** Changes a personal Tag without changing its stable identifier. */
const updateBenchmarkTag = (tagId: string, name: string, icon: string) =>
	invokeWithResponseSchema("update_benchmark_tag", BenchmarkTagSchema, {
		request: { tagId, name, icon },
	});

/** Reassigns dependent definitions and removes one personal Tag. */
const deleteBenchmarkTag = (tagId: string) =>
	invokeWithResponseSchema("delete_benchmark_tag", BenchmarkTagUsageSchema, {
		request: { tagId },
	});

/** Inspects one picker-selected Theoria folder without creating persistence. */
const previewBenchmarkImport = (sourcePath: string) =>
	invokeWithResponseSchema(
		"preview_benchmark_import",
		BenchmarkImportPreviewSchema,
		{ request: { sourcePath } },
	);

/** Copies a reviewed template folder into one editable personal draft. */
const importBenchmarkFolder = (sourcePath: string, tagId: string) =>
	invokeWithResponseSchema("import_benchmark_folder", BenchmarkDraftSchema, {
		request: { sourcePath, tagId },
	});

/** Copies one picker-selected file into managed Benchmark storage. */
const importBenchmarkAsset = (sourcePath: string, path: string) =>
	invokeWithResponseSchema("import_benchmark_asset", BenchmarkFileSchema, {
		request: { sourcePath, path },
	});

/** Returns a bounded managed-file preview without exposing its native path. */
const previewBenchmarkAsset = (assetId: string) =>
	invokeWithResponseSchema(
		"preview_benchmark_asset",
		BenchmarkAssetPreviewSchema,
		{ request: { assetId } },
	);

/** Stores an editor buffer as a new immutable managed file revision. */
const saveBenchmarkTextAsset = (path: string, text: string) =>
	invokeWithResponseSchema("save_benchmark_text_asset", BenchmarkFileSchema, {
		request: { path, text },
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

/** Explicitly changes the version pinned by an existing workspace mount. */
const updateBenchmarkMount = (
	workspaceId: string,
	mountId: string,
	versionId: string,
) =>
	invokeWithResponseSchema("update_benchmark_mount", BenchmarkMountSchema, {
		request: { workspaceId, mountId, versionId },
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

/** Creates a fresh Task from one terminal run while preserving its published version. */
const rerunBenchmarkTask = (request: RerunBenchmarkTaskInput) =>
	invokeWithResponseSchema("rerun_benchmark_task", BenchmarkTaskDetailSchema, {
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
	archiveBenchmark,
	listBenchmarkTags,
	createBenchmarkTag,
	getBenchmarkTagUsage,
	updateBenchmarkTag,
	deleteBenchmarkTag,
	previewBenchmarkImport,
	importBenchmarkFolder,
	importBenchmarkAsset,
	previewBenchmarkAsset,
	saveBenchmarkTextAsset,
	saveBenchmarkDraft,
	publishBenchmark,
	getBenchmarkDraft,
	listBenchmarkDrafts,
	listWorkspaceBenchmarks,
	mountBenchmark,
	updateBenchmarkMount,
	unmountBenchmark,
	previewBenchmarkTask,
	startBenchmarkTask,
	rerunBenchmarkTask,
	getBenchmarkTask,
};
