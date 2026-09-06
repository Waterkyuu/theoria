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

const EditorSkillFilesSchema = z.object({
	/** Editable UTF-8 files, keyed by relative path. */
	files: z.record(z.string(), z.string()),
	/** Complete directory list, including empty folders. */
	directories: z.array(z.string()),
	/** Destination-to-original paths for files that stay on disk. */
	retainedFiles: z.record(z.string(), z.string()),
});
const CompiledEditorSkillFilesSchema = z.compile(EditorSkillFilesSchema);
type EditorSkillFiles = z.infer<typeof EditorSkillFilesSchema>;

type Skill = z.infer<typeof SkillSchema>;

export type { EditorSkillFiles, Skill };
export {
	CompiledEditorSkillFilesSchema,
	CompiledSkillSchema,
	CompiledSkillsSchema,
};
