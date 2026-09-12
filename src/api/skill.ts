import { invokeWithResponseSchema } from "@/api/ipc";
import {
	EditorSkillFilesSchema,
	EmptySkillResponseSchema,
	OptionalSkillPathSchema,
	SkillSchema,
	SkillsSchema,
	type EditorSkillFiles,
} from "@/types/skill";

/** Lists every managed Skill available to normal Tasks and Workspace mounts. */
const listSkills = () => invokeWithResponseSchema("list_skills", SkillsSchema);

/** Copies a complete local Skill folder into Theoria-managed storage. */
const importLocalSkill = (sourcePath: string) =>
	invokeWithResponseSchema("import_local_skill", SkillSchema, {
		request: { sourcePath },
	});

/** Opens the native Skill folder picker with platform-specific visibility rules. */
const selectSkillFolder = (title: string) =>
	invokeWithResponseSchema("select_skill_folder", OptionalSkillPathSchema, {
		title,
	});

type CreatePlatformSkillInput =
	| {
			/** Complete file tree authored in the editor, including SKILL.md. */
			files: Record<string, string>;
			/** Explicit folders to retain even when they contain no files. */
			directories?: string[];
	  }
	| {
			/** Main instructions written below SKILL.md frontmatter. */
			content: string;
			/** Short capability summary. */
			description: string;
			/** User-visible Skill name. */
			displayName: string;
	  };

/** Creates a minimal Skill directly in Theoria-managed storage. */
const createPlatformSkill = (request: CreatePlatformSkillInput) =>
	invokeWithResponseSchema("create_platform_skill", SkillSchema, {
		request,
	});

/** Loads the managed directory rather than the original import source.
 * @example readEditorSkill("skill-1")
 */
const readEditorSkill = (skillId: string) =>
	invokeWithResponseSchema("read_editor_skill", EditorSkillFilesSchema, {
		request: { skillId },
	});

/** Replaces the directory contents while preserving the Skill identity.
 * @example saveEditorSkill("skill-1", draft)
 */
const saveEditorSkill = (skillId: string, draft: EditorSkillFiles) =>
	invokeWithResponseSchema("save_editor_skill", SkillSchema, {
		request: { skillId, ...draft },
	});

/** Clones every discovered Skill from a Git repository into managed storage. */
const importGitSkill = (gitUrl: string) =>
	invokeWithResponseSchema("import_git_skill", SkillsSchema, {
		request: { gitUrl },
	});

/** Refreshes a Git-backed Skill from its persisted remote URL. */
const updateGitSkill = (skillId: string) =>
	invokeWithResponseSchema("update_git_skill", SkillSchema, {
		request: { skillId },
	});

/** Permanently removes one managed Skill and all of its Workspace mounts. */
const removeSkill = (skillId: string) =>
	invokeWithResponseSchema("remove_skill", EmptySkillResponseSchema, {
		request: { skillId },
	});

/** Lists managed Skills mounted for future Tasks in one Workspace. */
const listWorkspaceSkills = (workspaceId: string) =>
	invokeWithResponseSchema("list_workspace_skills", SkillsSchema, {
		request: { workspaceId },
	});

/** Mounts one managed Skill to future Tasks in a Workspace. */
const mountWorkspaceSkill = (workspaceId: string, skillId: string) =>
	invokeWithResponseSchema("mount_workspace_skill", SkillSchema, {
		request: { workspaceId, skillId },
	});

/** Unmounts one managed Skill without changing existing Task snapshots. */
const unmountWorkspaceSkill = (workspaceId: string, skillId: string) =>
	invokeWithResponseSchema(
		"unmount_workspace_skill",
		EmptySkillResponseSchema,
		{
			request: { workspaceId, skillId },
		},
	);

export type { CreatePlatformSkillInput };
export {
	createPlatformSkill,
	importGitSkill,
	importLocalSkill,
	listSkills,
	listWorkspaceSkills,
	mountWorkspaceSkill,
	readEditorSkill,
	removeSkill,
	saveEditorSkill,
	selectSkillFolder,
	unmountWorkspaceSkill,
	updateGitSkill,
};
