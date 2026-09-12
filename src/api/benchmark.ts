import { z } from "zod";
import { invokeWithResponseSchema } from "@/api/ipc";
import {
	BenchmarkSummarySchema,
	BenchmarkDetailSchema,
	BenchmarkDraftSchema,
	BenchmarkMountSchema,
	BenchmarkTagSchema,
	BenchmarkPreviewSchema,
} from "@/types/benchmark";
import type {
	BenchmarkDocument,
	BenchmarkFilters,
	BenchmarkPreviewInput,
} from "@/types/benchmark";
const summaries = z.compile(z.array(BenchmarkSummarySchema));
const detail = z.compile(BenchmarkDetailSchema);
const draft = z.compile(BenchmarkDraftSchema);
const mounts = z.compile(z.array(BenchmarkMountSchema));
const mount = z.compile(BenchmarkMountSchema);
const tags = z.compile(z.array(BenchmarkTagSchema));
const tag = z.compile(BenchmarkTagSchema);
const ids = z.compile(z.array(z.string()));
const empty = z.compile(z.null());
const preview = z.compile(BenchmarkPreviewSchema);
/**
 * Keeps sorting and filtering ahead of native pagination.
 *
 * @example
 * listBenchmarks(filters, 0);
 */
const listBenchmarks = (filters: BenchmarkFilters, page: number) =>
	invokeWithResponseSchema("list_benchmarks", summaries, {
		request: { ...filters, page },
	});
/**
 * Loads the pinned version when supplied.
 *
 * @example
 * getBenchmark("suite", "v1");
 */
const getBenchmark = (benchmarkId: string, versionId: string | null = null) =>
	invokeWithResponseSchema("get_benchmark", detail, {
		request: { benchmarkId, versionId },
	});
/** Loads available classifications. */
const listBenchmarkTags = () =>
	invokeWithResponseSchema("list_benchmark_tags", tags);
/**
 * Stores an allowed Gravity selection.
 *
 * @example
 * createBenchmarkTag("Coding", "Code");
 */
const createBenchmarkTag = (name: string, icon: string) =>
	invokeWithResponseSchema("create_benchmark_tag", tag, {
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
) =>
	invokeWithResponseSchema("save_benchmark_draft", draft, {
		request: { document, draftId, expectedRevision },
	});
/**
 * Publishes the reviewed saved revision.
 *
 * @example
 * publishBenchmark("draft", 2);
 */
const publishBenchmark = (draftId: string, expectedRevision: number) =>
	invokeWithResponseSchema("publish_benchmark", detail, {
		request: { draftId, expectedRevision },
	});
/**
 * Restores an unfinished editor.
 *
 * @example
 * getBenchmarkDraft("draft");
 */
const getBenchmarkDraft = (draftId: string) =>
	invokeWithResponseSchema("get_benchmark_draft", draft, {
		request: { draftId },
	});
/**
 * Lists saved editor IDs without loading every document.
 *
 * @example
 * listBenchmarkDrafts(0);
 */
const listBenchmarkDrafts = (page: number) =>
	invokeWithResponseSchema("list_benchmark_drafts", ids, { request: { page } });
/**
 * Reads fixed workspace relationships.
 *
 * @example
 * listWorkspaceBenchmarks("workspace", 0);
 */
const listWorkspaceBenchmarks = (workspaceId: string, page: number) =>
	invokeWithResponseSchema("list_workspace_benchmarks", mounts, {
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
	invokeWithResponseSchema("mount_benchmark", mount, {
		request: { workspaceId, benchmarkId, versionId },
	});
/**
 * Removes only the relationship.
 *
 * @example
 * unmountBenchmark("workspace", "mount");
 */
const unmountBenchmark = (workspaceId: string, mountId: string) =>
	invokeWithResponseSchema("unmount_benchmark", empty, {
		request: { workspaceId, mountId },
	});
/**
 * Checks the whole suite without model overrides or Task creation.
 *
 * @example
 * previewBenchmarkTask(input);
 */
const previewBenchmarkTask = (request: BenchmarkPreviewInput) =>
	invokeWithResponseSchema("preview_benchmark_task", preview, { request });
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
};
