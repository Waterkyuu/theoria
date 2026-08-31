import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createManagedWorkspace,
	listWorkspaces,
	registerExternalWorkspace,
	removeWorkspace,
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

export type { CreateWorkspaceInput, RemoveWorkspaceInput };
export { useCreateWorkspace, useRemoveWorkspace, useWorkspaces, workspaceKeys };
