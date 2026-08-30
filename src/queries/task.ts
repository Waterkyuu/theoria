import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	continueTask,
	createTask,
	deleteTask,
	getTask,
	listTasks,
	runTaskExecutions,
	stopTaskAgent,
} from "@/api/task";
import type { ContinueTaskRequest, CreateTaskRequest } from "@/types/task";

const TASK_POLL_INTERVAL_MS = 750;

const taskKeys = {
	all: ["tasks"] as const,
	list: (workspaceId: string | null) =>
		[...taskKeys.all, "list", workspaceId ?? "recent"] as const,
	detail: (taskId: string | null) =>
		[...taskKeys.all, "detail", taskId ?? "draft"] as const,
};

/** Loads global Recent or one Workspace's Task list. */
const useTasks = (workspaceId: string | null) =>
	useQuery({
		queryKey: taskKeys.list(workspaceId),
		queryFn: () => listTasks(workspaceId),
	});

/** Restores one locked Task and polls only while an Execution can still change. */
const useTask = (taskId: string | null) =>
	useQuery({
		queryKey: taskKeys.detail(taskId),
		queryFn: () => {
			if (!taskId) throw new Error("A Task id is required");
			return getTask(taskId);
		},
		enabled: taskId !== null,
		refetchInterval: (query) => {
			const status = query.state.data?.task.status;
			return status === "preparing" || status === "running"
				? TASK_POLL_INTERVAL_MS
				: false;
		},
	});

/** Creates a locked Task and seeds both detail and Task-list caches. */
const useCreateTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: CreateTaskRequest) => createTask(request),
		onSuccess: (detail) => {
			queryClient.setQueryData(taskKeys.detail(detail.task.id), detail);
			queryClient.invalidateQueries({
				queryKey: taskKeys.list(detail.task.workspaceId),
			});
		},
	});
};

/** Runs every prepared Agent and replaces the cached Task with its terminal snapshot. */
const useRunTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (taskId: string) => runTaskExecutions(taskId),
		onSuccess: (detail) => {
			queryClient.setQueryData(taskKeys.detail(detail.task.id), detail);
			queryClient.invalidateQueries({
				queryKey: taskKeys.list(detail.task.workspaceId),
			});
		},
	});
};

/** Continues persisted sessions and replaces the cached Task transcript. */
const useContinueTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: ContinueTaskRequest) => continueTask(request),
		onSuccess: (detail) => {
			queryClient.setQueryData(taskKeys.detail(detail.task.id), detail);
			queryClient.invalidateQueries({
				queryKey: taskKeys.list(detail.task.workspaceId),
			});
		},
	});
};

/** Stops one Agent and updates the shared Task snapshot immediately. */
const useStopTaskAgent = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (taskAgentId: string) => stopTaskAgent(taskAgentId),
		onSuccess: (detail) => {
			queryClient.setQueryData(taskKeys.detail(detail.task.id), detail);
		},
	});
};

/** Deletes Task-owned files and removes matching detail and Task-list cache entries. */
const useDeleteTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (taskId: string) => deleteTask(taskId).then(() => taskId),
		onSuccess: (taskId) => {
			queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) });
			queryClient.invalidateQueries({ queryKey: taskKeys.all });
		},
	});
};

export {
	taskKeys,
	useContinueTask,
	useCreateTask,
	useDeleteTask,
	useRunTask,
	useStopTaskAgent,
	useTask,
	useTasks,
};
