import { invokeWithResponseSchema } from "@/api/ipc";
import type { ContinueTaskRequest, CreateTaskRequest } from "@/types/task";
import {
	EmptyTaskResponseSchema,
	TaskDetailSchema,
	TaskSchema,
	TasksSchema,
} from "@/types/task";

/** Lists global Recent Tasks or the Task list for one Workspace. */
const listTasks = (workspaceId: string | null = null) =>
	invokeWithResponseSchema("list_tasks", TasksSchema, {
		request: { workspaceId },
	});

/** Restores one Task with its locked conditions, panels, and collected results. */
const getTask = (taskId: string) =>
	invokeWithResponseSchema("get_task", TaskDetailSchema, {
		request: { taskId },
	});

/** Loads common metadata before selecting a type-specific Task detail endpoint. */
const getTaskHeader = (taskId: string) =>
	invokeWithResponseSchema("get_task_header", TaskSchema, {
		request: { taskId },
	});

/** Freezes one Composer payload into a prepared Task and isolated Agent workspaces. */
const createTask = (request: CreateTaskRequest) =>
	invokeWithResponseSchema("create_task", TaskDetailSchema, {
		request,
	});

/** Runs every prepared Agent concurrently and returns the terminal Task snapshot. */
const runTaskExecutions = (taskId: string) =>
	invokeWithResponseSchema("run_task_executions", TaskDetailSchema, {
		request: { taskId },
	});

/** Continues all or selected Agent sessions without changing frozen configuration. */
const continueTask = (request: ContinueTaskRequest) =>
	invokeWithResponseSchema("continue_task", TaskDetailSchema, {
		request,
	});

/** Stops one active Agent while preserving its siblings and collected file state. */
const stopTaskAgent = (taskAgentId: string) =>
	invokeWithResponseSchema("stop_task_agent", TaskDetailSchema, {
		request: { taskAgentId },
	});

/** Requests cancellation through the orchestrator that owns the selected Task kind. */
const cancelTask = (taskId: string) =>
	invokeWithResponseSchema("cancel_task", EmptyTaskResponseSchema, {
		request: { taskId },
	});

/** Stops all Task writers, deletes owned files, and then removes persisted records. */
const deleteTask = (taskId: string) =>
	invokeWithResponseSchema("delete_task", EmptyTaskResponseSchema, {
		request: { taskId },
	});

/** Changes one persisted Task title after backend validation. */
const renameTask = (taskId: string, title: string) =>
	invokeWithResponseSchema("rename_task", TaskSchema, {
		request: { taskId, title },
	});

/** Changes whether one global Recent Task is pinned above ordinary Tasks. */
const setTaskPin = (taskId: string, isPinned: boolean) =>
	invokeWithResponseSchema("set_task_pin", TaskSchema, {
		request: { taskId, isPinned },
	});

export {
	continueTask,
	cancelTask,
	createTask,
	deleteTask,
	getTask,
	getTaskHeader,
	listTasks,
	renameTask,
	runTaskExecutions,
	setTaskPin,
	stopTaskAgent,
};
