import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	archiveBenchmark,
	getBenchmarkTask,
	getBenchmark,
	getBenchmarkDraft,
	listBenchmarkDrafts,
	listBenchmarks,
	listBenchmarkTags,
	listBenchmarkExecutionArtifacts,
	previewBenchmarkExecutionArtifact,
	listWorkspaceBenchmarks,
	rerunBenchmarkTask,
	startBenchmarkTask,
	setBenchmarkMountPin,
	unmountBenchmark,
	updateBenchmarkMount,
} from "@/api/benchmark";
import { cancelTask } from "@/api/task";
import type {
	BenchmarkFilters,
	RerunBenchmarkTaskInput,
	StartBenchmarkTaskInput,
} from "@/types/benchmark";

type BenchmarkMountMutationInput = {
	/** Stable relationship changed by a Workspace sidebar action. */
	mountId: string;
	/** Workspace that owns the relationship. */
	workspaceId: string;
};

type SetBenchmarkMountPinInput = BenchmarkMountMutationInput & {
	/** Whether the mount should appear in the pinned group. */
	isPinned: boolean;
};

const BENCHMARK_TASK_POLL_INTERVAL_MS = 750;

/** Keeps an absent selection in a stable disabled-query cache bucket.
 * @example benchmarkTaskKey("task-1")
 */
const benchmarkTaskKey = (taskId: string | null) => [
	"benchmark-tasks",
	taskId ?? "none",
];

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

/** Archives a personal definition and removes it from cached catalog pages. */
const useArchiveBenchmark = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: archiveBenchmark,
		onSuccess: (detail) => {
			queryClient.setQueryData(
				["benchmarks", "detail", detail.summary.id, null],
				detail,
			);
			queryClient.invalidateQueries({ queryKey: ["benchmarks", "catalog"] });
		},
	});
};

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

/** Applies an explicit version update to one mounted relationship. */
const useUpdateBenchmarkMount = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			workspaceId,
			mountId,
			versionId,
		}: {
			workspaceId: string;
			mountId: string;
			versionId: string;
		}) => updateBenchmarkMount(workspaceId, mountId, versionId),
		onSuccess: (mount) => {
			queryClient.invalidateQueries({
				queryKey: ["benchmarks", "mounts", mount.workspaceId],
			});
		},
	});
};

/** Persists pin state and refreshes the owning Workspace mount list. */
const useSetBenchmarkMountPin = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			isPinned,
			mountId,
			workspaceId,
		}: SetBenchmarkMountPinInput) =>
			setBenchmarkMountPin(workspaceId, mountId, isPinned),
		onSuccess: (mount) => {
			queryClient.invalidateQueries({
				queryKey: ["benchmarks", "mounts", mount.workspaceId],
			});
		},
	});
};

/** Removes one relationship and refreshes its Workspace mount list. */
const useUnmountBenchmark = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ mountId, workspaceId }: BenchmarkMountMutationInput) =>
			unmountBenchmark(workspaceId, mountId).then(() => ({
				mountId,
				workspaceId,
			})),
		onSuccess: ({ workspaceId }) => {
			queryClient.invalidateQueries({
				queryKey: ["benchmarks", "mounts", workspaceId],
			});
		},
	});
};

/** Polls only while the persisted Benchmark matrix can still change.
 * @example useBenchmarkTask("task-1")
 */
const useBenchmarkTask = (taskId: string | null) =>
	useQuery({
		queryKey: benchmarkTaskKey(taskId),
		queryFn: () => {
			if (!taskId) throw new Error("A Benchmark Task id is required");
			return getBenchmarkTask(taskId);
		},
		enabled: taskId !== null,
		refetchInterval: (query) => {
			const status = query.state.data?.task.status;
			return status === "preparing" || status === "running"
				? BENCHMARK_TASK_POLL_INTERVAL_MS
				: false;
		},
	});

/** Loads the final file index only after the user selects one execution.
 * @example useBenchmarkExecutionArtifacts("task-1", "execution-1")
 */
const useBenchmarkExecutionArtifacts = (
	taskId: string,
	executionId: string | null,
) =>
	useQuery({
		queryKey: ["benchmark-execution-artifacts", taskId, executionId],
		queryFn: () => {
			if (!executionId) throw new Error("An execution id is required");
			return listBenchmarkExecutionArtifacts(taskId, executionId);
		},
		enabled: executionId !== null,
	});

/** Loads one bounded artifact body independently from the file index.
 * @example useBenchmarkExecutionArtifactPreview("task-1", "execution-1", "result.txt")
 */
const useBenchmarkExecutionArtifactPreview = (
	taskId: string,
	executionId: string | null,
	path: string | null,
) =>
	useQuery({
		queryKey: ["benchmark-execution-artifact", taskId, executionId, path],
		queryFn: () => {
			if (!executionId || !path)
				throw new Error("An artifact selection is required");
			return previewBenchmarkExecutionArtifact(taskId, executionId, path);
		},
		enabled: executionId !== null && path !== null,
	});

/** Starts a Benchmark Task and seeds its polling cache immediately. */
const useStartBenchmarkTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: StartBenchmarkTaskInput) =>
			startBenchmarkTask(request),
		onSuccess: (detail) => {
			queryClient.setQueryData(benchmarkTaskKey(detail.task.id), detail);
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
	});
};

/** Requests cancellation and lets the persisted task poll reveal the terminal state. */
const useCancelBenchmarkTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (taskId: string) => cancelTask(taskId).then(() => taskId),
		onSuccess: (taskId) => {
			queryClient.invalidateQueries({ queryKey: benchmarkTaskKey(taskId) });
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
	});
};

/** Creates a new historical-version run and seeds its independent polling cache. */
const useRerunBenchmarkTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: RerunBenchmarkTaskInput) =>
			rerunBenchmarkTask(request),
		onSuccess: (detail) => {
			queryClient.setQueryData(benchmarkTaskKey(detail.task.id), detail);
			queryClient.invalidateQueries({ queryKey: ["tasks"] });
			queryClient.invalidateQueries({
				queryKey: ["benchmarks", "mounts", detail.task.workspaceId],
			});
		},
	});
};

export {
	useBenchmarks,
	useBenchmarkTags,
	useBenchmark,
	useArchiveBenchmark,
	useBenchmarkDraft,
	useBenchmarkDrafts,
	useWorkspaceBenchmarks,
	useUpdateBenchmarkMount,
	useSetBenchmarkMountPin,
	useUnmountBenchmark,
	useBenchmarkTask,
	useBenchmarkExecutionArtifacts,
	useBenchmarkExecutionArtifactPreview,
	useCancelBenchmarkTask,
	useRerunBenchmarkTask,
	useStartBenchmarkTask,
};
