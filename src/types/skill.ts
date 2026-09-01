import { z } from "zod";

const SkillSourceTypeSchema = z.literal(["local_folder", "platform", "git"]);
const SkillSchema = z.object({
	/** Stable Skill Library identifier. */
	id: z.string().min(1),
	/** Folder name copied beneath project Skill snapshots. */
	folderName: z.string().min(1),
	/** User-visible Skill name. */
	displayName: z.string().min(1),
	/** Capability summary parsed from SKILL.md. */
	description: z.string(),
	/** Origin retained after the Skill is copied into managed storage. */
	sourceType: SkillSourceTypeSchema,
	/** Original source folder when one is available. */
	sourcePath: z.string().nullable(),
	/** Creation time in Unix milliseconds. */
	createdAtMs: z.int().nonnegative(),
	/** Latest metadata update time in Unix milliseconds. */
	updatedAtMs: z.int().nonnegative(),
});

const CompiledSkillSchema = z.compile(SkillSchema);
const CompiledSkillsSchema = z.compile(z.array(SkillSchema));

type Skill = z.infer<typeof SkillSchema>;

export type { Skill };
export { CompiledSkillSchema, CompiledSkillsSchema };
