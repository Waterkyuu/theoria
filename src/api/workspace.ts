import { invokeWithResponseSchema } from "@/api/ipc";
import {
	EmptyWorkspaceResponseSchema,
	WorkspaceSchema,
	WorkspacesSchema,
} from "@/types/workspace";

/** Lists every reusable Workspace for navigation and Task composition. */
const listWorkspaces = () =>
	invokeWithResponseSchema("list_workspaces", WorkspacesSchema);

/** Registers a user-owned folder without transferring ownership to Theoria. */
const registerExternalWorkspace = (name: string, sourcePath: string) =>
	invokeWithResponseSchema("register_external_workspace", WorkspaceSchema, {
		request: { name, sourcePath },
	});

/** Creates an empty Workspace whose template files are owned by Theoria. */
const createManagedWorkspace = (name: string) =>
	invokeWithResponseSchema("create_managed_workspace", WorkspaceSchema, {
		request: { name },
	});

/** Changes whether a Workspace is pinned and returns its persisted state. */
const setWorkspacePin = (workspaceId: string, isPinned: boolean) =>
	invokeWithResponseSchema("set_workspace_pin", WorkspaceSchema, {
		request: { workspaceId, isPinned },
	});

/** Changes one persisted Workspace name after backend validation. */
const renameWorkspace = (workspaceId: string, name: string) =>
	invokeWithResponseSchema("rename_workspace", WorkspaceSchema, {
		request: { workspaceId, name },
	});

/** Removes a Workspace collection while requiring confirmation for managed files. */
const removeWorkspace = (workspaceId: string, managedFilesConfirmed: boolean) =>
	invokeWithResponseSchema("remove_workspace", EmptyWorkspaceResponseSchema, {
		request: { workspaceId, managedFilesConfirmed },
	});

export {
	createManagedWorkspace,
	listWorkspaces,
	registerExternalWorkspace,
	removeWorkspace,
	renameWorkspace,
	setWorkspacePin,
};
