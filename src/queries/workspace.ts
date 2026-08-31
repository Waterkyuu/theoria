import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createManagedWorkspace,
	listWorkspaces,
	registerExternalWorkspace,
	removeWorkspace,
	renameWorkspace,
	setWorkspacePin,
} from "@/api/workspace";
import type { Workspace } from "@/types/workspace";

type CreateWorkspaceInput =
	| {
			/** User-visible Workspace name. */
			name: string;
			/** Theoria owns the empty template directory. */
			sourceKind: "managed";
	  }
	| {
			/** User-visible Workspace name. */
			name: string;
			/** User keeps ownership of the registered directory. */
			sourceKind: "external";
			/** Absolute directory registered without copying or mutation. */
			sourcePath: string;
	  };

const workspaceKeys = {
	all: ["workspaces"] as const,
	list: () => [...workspaceKeys.all, "list"] as const,
};

/** Loads reusable Workspace sources for routing and Task composition. */
const useWorkspaces = () =>
	useQuery({ queryKey: workspaceKeys.list(), queryFn: listWorkspaces });

/** Creates either supported Workspace source and refreshes the existing tree. */
const useCreateWorkspace = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateWorkspaceInput) =>
			input.sourceKind === "managed"
				? createManagedWorkspace(input.name)
				: registerExternalWorkspace(input.name, input.sourcePath),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
		},
	});
};

type RemoveWorkspaceInput = {
	/** Whether deletion of Theoria-owned managed template files was confirmed. */
	managedFilesConfirmed: boolean;
	/** Workspace collection removed with its Tasks and Skill mounts. */
	workspaceId: string;
};

type SetWorkspacePinInput = {
	/** Whether the Workspace should appear in the pinned section of the ordering. */
	isPinned: boolean;
	/** Workspace whose persisted pin state changes. */
	workspaceId: string;
};

type RenameWorkspaceInput = {
	/** New user-visible Workspace name. */
	name: string;
	/** Workspace whose persisted name changes. */
	workspaceId: string;
};

/** Persists a Workspace name and refreshes sidebar consumers. */
const useRenameWorkspace = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ name, workspaceId }: RenameWorkspaceInput) =>
			renameWorkspace(workspaceId, name),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() }),
	});
};

/** Persists a Workspace pin change and refreshes the ordered sidebar list. */
const useSetWorkspacePin = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ isPinned, workspaceId }: SetWorkspacePinInput) =>
			setWorkspacePin(workspaceId, isPinned),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: workspaceKeys.list() }),
	});
};

/** Removes a Workspace collection and refreshes all affected navigation data. */
const useRemoveWorkspace = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			managedFilesConfirmed,
			workspaceId,
		}: RemoveWorkspaceInput) =>
			removeWorkspace(workspaceId, managedFilesConfirmed),
		onSuccess: async (_response, input) => {
			queryClient.setQueryData<Workspace[]>(
				workspaceKeys.list(),
				(workspaces) =>
					workspaces?.filter((workspace) => workspace.id !== input.workspaceId),
			);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
				queryClient.invalidateQueries({ queryKey: ["tasks"] }),
				queryClient.invalidateQueries({ queryKey: ["skills"] }),
			]);
		},
	});
};

export type {
	CreateWorkspaceInput,
	RemoveWorkspaceInput,
	RenameWorkspaceInput,
	SetWorkspacePinInput,
};
export {
	useCreateWorkspace,
	useRemoveWorkspace,
	useRenameWorkspace,
	useSetWorkspacePin,
	useWorkspaces,
	workspaceKeys,
};
