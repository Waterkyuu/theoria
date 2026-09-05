import { z } from "zod";
import { invokeWithResponseSchema } from "@/api/ipc";
import { CompiledSkillSchema, CompiledSkillsSchema } from "@/types/skill";

const EmptyResponseSchema = z.compile(z.null());
const OptionalPathSchema = z.compile(z.string().nullable());

/** Lists every managed Skill available to normal Tasks and Workspace mounts. */
const listSkills = () =>
	invokeWithResponseSchema("list_skills", CompiledSkillsSchema);

/** Copies a complete local Skill folder into Theoria-managed storage. */
const importLocalSkill = (sourcePath: string) =>
	invokeWithResponseSchema("import_local_skill", CompiledSkillSchema, {
		request: { sourcePath },
	});

/** Opens the native Skill folder picker with platform-specific visibility rules. */
const selectSkillFolder = (title: string) =>
	invokeWithResponseSchema("select_skill_folder", OptionalPathSchema, {
		title,
	});

type CreatePlatformSkillInput = {
	/** Main instructions written below SKILL.md frontmatter. */
	content: string;
	/** Short capability summary. */
	description: string;
	/** User-visible Skill name. */
	displayName: string;
};

/** Creates a minimal Skill directly in Theoria-managed storage. */
const createPlatformSkill = (request: CreatePlatformSkillInput) =>
	invokeWithResponseSchema("create_platform_skill", CompiledSkillSchema, {
		request,
	});

/** Clones every discovered Skill from a Git repository into managed storage. */
const importGitSkill = (gitUrl: string) =>
	invokeWithResponseSchema("import_git_skill", CompiledSkillsSchema, {
		request: { gitUrl },
	});

/** Refreshes a Git-backed Skill from its persisted remote URL. */
const updateGitSkill = (skillId: string) =>
	invokeWithResponseSchema("update_git_skill", CompiledSkillSchema, {
		request: { skillId },
	});

/** Permanently removes one managed Skill and all of its Workspace mounts. */
const removeSkill = (skillId: string) =>
	invokeWithResponseSchema("remove_skill", EmptyResponseSchema, {
		request: { skillId },
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
	invokeWithResponseSchema("unmount_workspace_skill", EmptyResponseSchema, {
		request: { workspaceId, skillId },
	});

export type { CreatePlatformSkillInput };
export {
	createPlatformSkill,
	importGitSkill,
	importLocalSkill,
	listSkills,
	listWorkspaceSkills,
	mountWorkspaceSkill,
	removeSkill,
	selectSkillFolder,
	unmountWorkspaceSkill,
	updateGitSkill,
};
