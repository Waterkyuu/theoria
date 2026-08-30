import { useQuery } from "@tanstack/react-query";
import { listSkills, listWorkspaceSkills } from "@/api/skill";
import { listWorkspaces } from "@/api/workspace";

const skillKeys = {
	all: ["skills"] as const,
	library: () => [...skillKeys.all, "library"] as const,
	mountCounts: () => [...skillKeys.all, "mount-counts"] as const,
	workspace: (workspaceId: string) =>
		[...skillKeys.all, "workspace", workspaceId] as const,
};

/** Loads the number of Workspace mount relationships for every managed Skill. */
const loadSkillMountCounts = async () => {
	const workspaces = await listWorkspaces();
	const mountedLibraries = await Promise.all(
		workspaces.map((workspace) => listWorkspaceSkills(workspace.id)),
	);
	const counts: Record<string, number> = {};
	for (const skills of mountedLibraries) {
		for (const skill of skills) {
			counts[skill.id] = (counts[skill.id] ?? 0) + 1;
		}
	}
	return counts;
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

/** Supplies mount counts to the existing Skill Library table and filter. */
const useSkillMountCounts = () =>
	useQuery({
		queryKey: skillKeys.mountCounts(),
		queryFn: loadSkillMountCounts,
	});

export { skillKeys, useSkillMountCounts, useSkills, useWorkspaceSkills };
