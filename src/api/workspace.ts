import { z } from "zod";
import { invokeWithResponseSchema } from "@/api/ipc";
import {
	CompiledWorkspaceSchema,
	CompiledWorkspacesSchema,
} from "@/types/workspace";

const EmptyResponseSchema = z.compile(z.null());

/** Lists every reusable Workspace for navigation and Task composition. */
const listWorkspaces = () =>
	invokeWithResponseSchema("list_workspaces", CompiledWorkspacesSchema);

/** Registers a user-owned folder without transferring ownership to Theoria. */
const registerExternalWorkspace = (name: string, sourcePath: string) =>
	invokeWithResponseSchema(
		"register_external_workspace",
		CompiledWorkspaceSchema,
		{ request: { name, sourcePath } },
	);

/** Creates an empty Workspace whose template files are owned by Theoria. */
const createManagedWorkspace = (name: string) =>
	invokeWithResponseSchema(
		"create_managed_workspace",
		CompiledWorkspaceSchema,
		{ request: { name } },
	);

/** Changes whether a Workspace is pinned and returns its persisted state. */
const setWorkspacePin = (workspaceId: string, isPinned: boolean) =>
	invokeWithResponseSchema("set_workspace_pin", CompiledWorkspaceSchema, {
		request: { workspaceId, isPinned },
	});

/** Removes a Workspace collection while requiring confirmation for managed files. */
const removeWorkspace = (workspaceId: string, managedFilesConfirmed: boolean) =>
	invokeWithResponseSchema("remove_workspace", EmptyResponseSchema, {
		request: { workspaceId, managedFilesConfirmed },
	});

export {
	createManagedWorkspace,
	listWorkspaces,
	registerExternalWorkspace,
	removeWorkspace,
	setWorkspacePin,
};
