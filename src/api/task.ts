import { z } from "zod";
import { invokeWithResponseSchema } from "@/api/ipc";
import type { ContinueTaskRequest, CreateTaskRequest } from "@/types/task";
import {
	CompiledTaskDetailSchema,
	CompiledTaskSchema,
	CompiledTasksSchema,
} from "@/types/task";

const EmptyResponseSchema = z.compile(z.void());

/** Lists global Recent Tasks or the Task list for one Workspace. */
const listTasks = (workspaceId: string | null = null) =>
	invokeWithResponseSchema("list_tasks", CompiledTasksSchema, {
		request: { workspaceId },
	});

/** Restores one Task with its locked conditions, panels, and collected results. */
const getTask = (taskId: string) =>
	invokeWithResponseSchema("get_task", CompiledTaskDetailSchema, {
		request: { taskId },
	});

/** Freezes one Composer payload into a prepared Task and isolated Agent workspaces. */
const createTask = (request: CreateTaskRequest) =>
	invokeWithResponseSchema("create_task", CompiledTaskDetailSchema, {
		request,
	});

/** Runs every prepared Agent concurrently and returns the terminal Task snapshot. */
const runTaskExecutions = (taskId: string) =>
	invokeWithResponseSchema("run_task_executions", CompiledTaskDetailSchema, {
		request: { taskId },
	});

/** Continues all or selected Agent sessions without changing frozen configuration. */
const continueTask = (request: ContinueTaskRequest) =>
	invokeWithResponseSchema("continue_task", CompiledTaskDetailSchema, {
		request,
	});

/** Stops one active Agent while preserving its siblings and collected file state. */
const stopTaskAgent = (taskAgentId: string) =>
	invokeWithResponseSchema("stop_task_agent", CompiledTaskDetailSchema, {
		request: { taskAgentId },
	});

/** Stops all Task writers, deletes owned files, and then removes persisted records. */
const deleteTask = (taskId: string) =>
	invokeWithResponseSchema("delete_task", EmptyResponseSchema, {
		request: { taskId },
	});

/** Changes one persisted Task title after backend validation. */
const renameTask = (taskId: string, title: string) =>
	invokeWithResponseSchema("rename_task", CompiledTaskSchema, {
		request: { taskId, title },
	});

/** Changes whether one global Recent Task is pinned above ordinary Tasks. */
const setTaskPin = (taskId: string, isPinned: boolean) =>
	invokeWithResponseSchema("set_task_pin", CompiledTaskSchema, {
		request: { taskId, isPinned },
	});

export {
	continueTask,
	createTask,
	deleteTask,
	getTask,
	listTasks,
	renameTask,
	runTaskExecutions,
	setTaskPin,
	stopTaskAgent,
};
