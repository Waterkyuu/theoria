import { useQuery } from "@tanstack/react-query";
import { listSkills, listWorkspaceSkills } from "@/api/skill";

const skillKeys = {
	all: ["skills"] as const,
	library: () => [...skillKeys.all, "library"] as const,
	workspace: (workspaceId: string) =>
		[...skillKeys.all, "workspace", workspaceId] as const,
};

/** Loads the complete managed Skill Library. */
const useSkills = () =>
	useQuery({ queryKey: skillKeys.library(), queryFn: listSkills });

/** Loads future-Task Skill mounts for one Workspace. */
const useWorkspaceSkills = (workspaceId: string | null) =>
	useQuery({
		queryKey: skillKeys.workspace(workspaceId ?? "draft"),
		queryFn: () => {
			if (!workspaceId) throw new Error("A Workspace id is required");
			return listWorkspaceSkills(workspaceId);
		},
		enabled: workspaceId !== null,
	});

export { skillKeys, useSkills, useWorkspaceSkills };
