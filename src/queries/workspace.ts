import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createManagedWorkspace,
	listWorkspaces,
	registerExternalWorkspace,
} from "@/api/workspace";

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

export type { CreateWorkspaceInput };
export { useCreateWorkspace, useWorkspaces, workspaceKeys };
