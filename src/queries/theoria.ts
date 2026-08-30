import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createTask,
	deleteTask,
	getTask,
	listSkills,
	listTasks,
	listWorkspaceSkills,
	listWorkspaces,
	runTaskExecutions,
	stopTaskAgent,
} from "@/api/theoria";
import type { CreateTaskRequest } from "@/types/theoria";

const TASK_POLL_INTERVAL_MS = 750;

const theoriaKeys = {
	workspaces: ["theoria", "workspaces"] as const,
	skills: ["theoria", "skills"] as const,
	workspaceSkills: (workspaceId: string) =>
		["theoria", "workspace-skills", workspaceId] as const,
	tasks: (workspaceId: string | null) =>
		["theoria", "tasks", workspaceId ?? "recent"] as const,
	task: (taskId: string | null) =>
		["theoria", "task", taskId ?? "draft"] as const,
};

/** Loads reusable Workspace sources for routing and Task composition. */
const useWorkspaces = () =>
	useQuery({ queryKey: theoriaKeys.workspaces, queryFn: listWorkspaces });

/** Loads the complete managed Skill Library. */
const useSkills = () =>
	useQuery({ queryKey: theoriaKeys.skills, queryFn: listSkills });

/** Loads future-Task Skill mounts for one Workspace. */
const useWorkspaceSkills = (workspaceId: string | null) =>
	useQuery({
		queryKey: theoriaKeys.workspaceSkills(workspaceId ?? "draft"),
		queryFn: () => {
			if (!workspaceId) throw new Error("A Workspace id is required");
			return listWorkspaceSkills(workspaceId);
		},
		enabled: workspaceId !== null,
	});

/** Loads global Recent or Workspace-scoped History. */
const useTasks = (workspaceId: string | null) =>
	useQuery({
		queryKey: theoriaKeys.tasks(workspaceId),
		queryFn: () => listTasks(workspaceId),
	});

/** Restores one locked Task and polls only while an Execution can still change. */
const useTask = (taskId: string | null) =>
	useQuery({
		queryKey: theoriaKeys.task(taskId),
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

/** Creates a locked Task and seeds both detail and History caches. */
const useCreateTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (request: CreateTaskRequest) => createTask(request),
		onSuccess: (detail) => {
			queryClient.setQueryData(theoriaKeys.task(detail.task.id), detail);
			queryClient.invalidateQueries({
				queryKey: theoriaKeys.tasks(detail.task.workspaceId),
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
			queryClient.setQueryData(theoriaKeys.task(detail.task.id), detail);
			queryClient.invalidateQueries({
				queryKey: theoriaKeys.tasks(detail.task.workspaceId),
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
			queryClient.setQueryData(theoriaKeys.task(detail.task.id), detail);
		},
	});
};

/** Deletes Task-owned files and removes matching detail and History cache entries. */
const useDeleteTask = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (taskId: string) => deleteTask(taskId).then(() => taskId),
		onSuccess: (taskId) => {
			queryClient.removeQueries({ queryKey: theoriaKeys.task(taskId) });
			queryClient.invalidateQueries({ queryKey: ["theoria", "tasks"] });
		},
	});
};

export {
	theoriaKeys,
	useCreateTask,
	useDeleteTask,
	useRunTask,
	useSkills,
	useStopTaskAgent,
	useTask,
	useTasks,
	useWorkspaceSkills,
	useWorkspaces,
};
