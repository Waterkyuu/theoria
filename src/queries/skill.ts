import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePlatformSkillInput } from "@/api/skill";
import {
	createPlatformSkill,
	importGitSkill,
	importLocalSkill,
	listSkills,
	listWorkspaceSkills,
	mountWorkspaceSkill,
	readEditorSkill,
	removeSkill,
	saveEditorSkill,
	unmountWorkspaceSkill,
	updateGitSkill,
} from "@/api/skill";
import { listWorkspaces } from "@/api/workspace";
import type { EditorSkillFiles } from "@/types/skill";

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

/** Imports a validated local Skill folder and refreshes every library consumer. */
const useImportSkill = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (sourcePath: string) => importLocalSkill(sourcePath),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

/** Creates a platform-authored Skill and refreshes every library consumer. */
const useCreatePlatformSkill = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreatePlatformSkillInput) => createPlatformSkill(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

/** Loads a fresh snapshot on each editor visit without overwriting an active draft.
 * @example useSkillFiles("skill-1")
 */
const useSkillFiles = (skillId: string) =>
	useQuery({
		queryKey: [...skillKeys.all, "files", skillId],
		queryFn: () => readEditorSkill(skillId),
		staleTime: 0,
		gcTime: 0,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

/** Shares saving feedback while choosing create or replace from the editor's stable identity.
 * @example useSaveSkill("skill-1")
 */
const useSaveSkill = (skillId?: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			draft: Pick<EditorSkillFiles, "files"> &
				Partial<Omit<EditorSkillFiles, "files">>,
		) =>
			skillId
				? saveEditorSkill(skillId, {
						files: draft.files,
						directories: draft.directories ?? [],
						retainedFiles: draft.retainedFiles ?? {},
					})
				: createPlatformSkill(draft),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

/** Imports a Git-backed Skill and refreshes every library consumer. */
const useImportGitSkill = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (gitUrl: string) => importGitSkill(gitUrl),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

/** Pulls the latest remote content for one Git-backed Skill. */
const useUpdateGitSkill = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (skillId: string) => updateGitSkill(skillId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

/** Removes selected Skills one by one and refreshes library state even after a partial failure. */
const useRemoveSkills = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (skillIds: string[]) => {
			for (const skillId of skillIds) await removeSkill(skillId);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

type WorkspaceSkillMutationInput = {
	/** Managed Skill whose future-Task mount relationship changes. */
	skillId: string;
	/** Workspace receiving or losing the managed Skill. */
	workspaceId: string;
};

/** Mounts one Skill and refreshes every Workspace and library mount view. */
const useMountWorkspaceSkill = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ skillId, workspaceId }: WorkspaceSkillMutationInput) =>
			mountWorkspaceSkill(workspaceId, skillId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

/** Unmounts one Skill and refreshes every Workspace and library mount view. */
const useUnmountWorkspaceSkill = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ skillId, workspaceId }: WorkspaceSkillMutationInput) =>
			unmountWorkspaceSkill(workspaceId, skillId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: skillKeys.all });
		},
	});
};

export {
	skillKeys,
	useCreatePlatformSkill,
	useImportGitSkill,
	useImportSkill,
	useMountWorkspaceSkill,
	useRemoveSkills,
	useSaveSkill,
	useSkillFiles,
	useSkillMountCounts,
	useSkills,
	useUnmountWorkspaceSkill,
	useUpdateGitSkill,
	useWorkspaceSkills,
};
