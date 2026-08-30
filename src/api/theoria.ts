import { invokeWithResponseSchema } from "@/api/ipc";
import type { CreateTaskRequest } from "@/types/theoria";
import {
	CompiledEmptyResponseSchema,
	CompiledSkillSchema,
	CompiledSkillsSchema,
	CompiledTaskDetailSchema,
	CompiledTasksSchema,
	CompiledWorkspaceSchema,
	CompiledWorkspacesSchema,
} from "@/types/theoria";

/** Lists every reusable Workspace for navigation and Task composition. */
const listWorkspaces = () =>
	invokeWithResponseSchema("list_workspaces", CompiledWorkspacesSchema);

/** Registers a user-owned folder without transferring ownership to Theoria. */
const registerExternalWorkspace = (name: string, sourcePath: string) =>
	invokeWithResponseSchema(
		"register_external_workspace",
		CompiledWorkspaceSchema,
		{
			request: { name, sourcePath },
		},
	);

/** Creates an empty Workspace whose template files are owned by Theoria. */
const createManagedWorkspace = (name: string) =>
	invokeWithResponseSchema(
		"create_managed_workspace",
		CompiledWorkspaceSchema,
		{
			request: { name },
		},
	);

/** Removes a Workspace collection while requiring confirmation for managed files. */
const removeWorkspace = (workspaceId: string, managedFilesConfirmed: boolean) =>
	invokeWithResponseSchema("remove_workspace", CompiledEmptyResponseSchema, {
		request: { workspaceId, managedFilesConfirmed },
	});

/** Lists every managed Skill available to normal Tasks and Workspace mounts. */
const listSkills = () =>
	invokeWithResponseSchema("list_skills", CompiledSkillsSchema);

/** Copies a complete local Skill folder into Theoria-managed storage. */
const importLocalSkill = (sourcePath: string) =>
	invokeWithResponseSchema("import_local_skill", CompiledSkillSchema, {
		request: { sourcePath },
	});

/** Lists managed Skills mounted for future Tasks in one Workspace. */
const listWorkspaceSkills = (workspaceId: string) =>
	invokeWithResponseSchema("list_workspace_skills", CompiledSkillsSchema, {
		request: { workspaceId },
	});

/** Mounts one managed Skill to future Tasks in a Workspace. */
const mountWorkspaceSkill = (workspaceId: string, skillId: string) =>
	invokeWithResponseSchema("mount_workspace_skill", CompiledSkillSchema, {
		request: { workspaceId, skillId },
	});

/** Unmounts one managed Skill without changing existing Task snapshots. */
const unmountWorkspaceSkill = (workspaceId: string, skillId: string) =>
	invokeWithResponseSchema(
		"unmount_workspace_skill",
		CompiledEmptyResponseSchema,
		{
			request: { workspaceId, skillId },
		},
	);

/** Lists global Recent Tasks or the History for one Workspace. */
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

/** Stops one active Agent while preserving its siblings and collected file state. */
const stopTaskAgent = (taskAgentId: string) =>
	invokeWithResponseSchema("stop_task_agent", CompiledTaskDetailSchema, {
		request: { taskAgentId },
	});

/** Stops all Task writers, deletes owned files, and then removes persisted records. */
const deleteTask = (taskId: string) =>
	invokeWithResponseSchema("delete_task", CompiledEmptyResponseSchema, {
		request: { taskId },
	});

export {
	createManagedWorkspace,
	createTask,
	deleteTask,
	getTask,
	importLocalSkill,
	listSkills,
	listTasks,
	listWorkspaceSkills,
	listWorkspaces,
	mountWorkspaceSkill,
	registerExternalWorkspace,
	removeWorkspace,
	runTaskExecutions,
	stopTaskAgent,
	unmountWorkspaceSkill,
};
