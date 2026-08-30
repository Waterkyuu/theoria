import { z } from "zod";
import { invokeWithResponseSchema } from "@/api/ipc";
import { CompiledSkillSchema, CompiledSkillsSchema } from "@/types/skill";

const EmptyResponseSchema = z.compile(z.void());

/** Lists every managed Skill available to normal Tasks and Workspace mounts. */
const listSkills = () =>
	invokeWithResponseSchema("list_skills", CompiledSkillsSchema);

/** Copies a complete local Skill folder into Theoria-managed storage. */
const importLocalSkill = (sourcePath: string) =>
	invokeWithResponseSchema("import_local_skill", CompiledSkillSchema, {
		request: { sourcePath },
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

export {
	importLocalSkill,
	listSkills,
	listWorkspaceSkills,
	mountWorkspaceSkill,
	unmountWorkspaceSkill,
};
