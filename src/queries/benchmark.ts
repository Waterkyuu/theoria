import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	getBenchmark,
	getBenchmarkDraft,
	listBenchmarkDrafts,
	listBenchmarks,
	listBenchmarkTags,
	listWorkspaceBenchmarks,
} from "@/api/benchmark";
import type { BenchmarkFilters } from "@/types/benchmark";
/**
 * Fetches catalog pages without client-side sorting of partial results.
 *
 * @example
 * useBenchmarks(filters);
 */
const useBenchmarks = (filters: BenchmarkFilters) =>
	useInfiniteQuery({
		queryKey: ["benchmarks", "catalog", filters],
		initialPageParam: 0,
		queryFn: ({ pageParam }) => listBenchmarks(filters, pageParam),
		getNextPageParam: (last, pages) =>
			last.length === 30 ? pages.length : undefined,
	});
/** Shares the tag picker cache with cards and editors. */
const useBenchmarkTags = () =>
	useQuery({ queryKey: ["benchmarks", "tags"], queryFn: listBenchmarkTags });
/**
 * Keys workspace details by immutable version.
 *
 * @example
 * useBenchmark("suite", "v1");
 */
const useBenchmark = (id: string, versionId: string | null = null) =>
	useQuery({
		queryKey: ["benchmarks", "detail", id, versionId],
		queryFn: () => getBenchmark(id, versionId),
		enabled: Boolean(id),
	});
/**
 * Restores exactly one saved revision.
 *
 * @example
 * useBenchmarkDraft("draft");
 */
const useBenchmarkDraft = (id: string) =>
	useQuery({
		queryKey: ["benchmarks", "draft", id],
		queryFn: () => getBenchmarkDraft(id),
		enabled: Boolean(id),
	});
/** Pages saved drafts independently of the public catalog. */
const useBenchmarkDrafts = () =>
	useInfiniteQuery({
		queryKey: ["benchmarks", "drafts"],
		initialPageParam: 0,
		queryFn: ({ pageParam }) => listBenchmarkDrafts(pageParam),
		getNextPageParam: (last, pages) =>
			last.length === 30 ? pages.length : undefined,
	});
/**
 * Sidebar and workspace detail share pinned relationships.
 *
 * @example
 * useWorkspaceBenchmarks("workspace");
 */
const useWorkspaceBenchmarks = (workspaceId: string) =>
	useInfiniteQuery({
		queryKey: ["benchmarks", "mounts", workspaceId],
		initialPageParam: 0,
		enabled: Boolean(workspaceId),
		queryFn: ({ pageParam }) => listWorkspaceBenchmarks(workspaceId, pageParam),
		getNextPageParam: (last, pages) =>
			last.length === 30 ? pages.length : undefined,
	});
export {
	useBenchmarks,
	useBenchmarkTags,
	useBenchmark,
	useBenchmarkDraft,
	useBenchmarkDrafts,
	useWorkspaceBenchmarks,
};
