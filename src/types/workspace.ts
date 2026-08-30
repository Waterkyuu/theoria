import { z } from "zod";

const WorkspaceSourceKindSchema = z.literal(["external", "managed"]);
const WorkspaceSchema = z.object({
	/** Stable Workspace route identifier. */
	id: z.string().min(1),
	/** User-visible Workspace name. */
	name: z.string().min(1),
	/** Whether source files are user-owned or managed by Theoria. */
	sourceKind: WorkspaceSourceKindSchema,
	/** Absolute source directory displayed in Workspace details. */
	sourcePath: z.string().min(1),
	/** Optional pin time used by navigation ordering. */
	pinnedAtMs: z.int().nonnegative().nullable(),
	/** Creation time in Unix milliseconds. */
	createdAtMs: z.int().nonnegative(),
	/** Latest metadata update time in Unix milliseconds. */
	updatedAtMs: z.int().nonnegative(),
});

const CompiledWorkspaceSchema = z.compile(WorkspaceSchema);
const CompiledWorkspacesSchema = z.compile(z.array(WorkspaceSchema));

type Workspace = z.infer<typeof WorkspaceSchema>;

export type { Workspace };
export { CompiledWorkspaceSchema, CompiledWorkspacesSchema };
