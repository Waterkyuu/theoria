import { useQuery } from "@tanstack/react-query";
import { listWorkspaces } from "@/api/workspace";

const workspaceKeys = {
	all: ["workspaces"] as const,
	list: () => [...workspaceKeys.all, "list"] as const,
};

/** Loads reusable Workspace sources for routing and Task composition. */
const useWorkspaces = () =>
	useQuery({ queryKey: workspaceKeys.list(), queryFn: listWorkspaces });

export { useWorkspaces, workspaceKeys };
