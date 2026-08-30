import { z } from "zod";
import { AgentKindSchema } from "@/types/agent";

const TaskStatusSchema = z.literal([
	"preparing",
	"running",
	"waiting",
	"completed",
	"failed",
	"stopped",
]);
const TaskSchema = z.object({
	/** Stable Task route identifier. */
	id: z.string().min(1),
	/** Owning Workspace, or null for global Recent. */
	workspaceId: z.string().nullable(),
	/** User-visible title derived from the initial prompt. */
	title: z.string().min(1),
	/** Frozen initial user request. */
	prompt: z.string().min(1),
	/** Aggregate Task lifecycle. */
	status: TaskStatusSchema,
	/** Time after which execution configuration is immutable. */
	configurationLockedAtMs: z.int().nonnegative().nullable(),
	/** Creation time in Unix milliseconds. */
	createdAtMs: z.int().nonnegative(),
	/** Latest lifecycle update time in Unix milliseconds. */
	updatedAtMs: z.int().nonnegative(),
});

const TaskAgentSchema = z.object({
	/** Stable isolated Execution identifier. */
	id: z.string().min(1),
	/** Zero-based panel position limited to the six-panel layout. */
	slotIndex: z.int().min(0).max(5),
	/** Local Agent product assigned to this panel. */
	agentKind: AgentKindSchema,
	/** Model frozen when the Task was created. */
	modelSnapshot: z.string().nullable(),
	/** Reasoning or provider mode frozen when the Task was created. */
	modeSnapshot: z.string().nullable(),
	/** Current Execution lifecycle. */
	status: TaskStatusSchema,
});

const TaskSkillSchema = z.object({
	/** Folder name captured in the Task baseline. */
	folderName: z.string().min(1),
	/** Snapshot origin, such as Workspace or Library. */
	origin: z.string().min(1),
	/** Library identifier when the frozen Skill came from managed storage. */
	librarySkillId: z.string().nullable(),
});

const TaskAgentResultSchema = z.object({
	/** Agent Execution that owns this terminal result. */
	taskAgentId: z.string().min(1),
	/** Terminal lifecycle captured with the result. */
	finalStatus: TaskStatusSchema,
	/** Final assistant text, or null when no response was produced. */
	responseText: z.string().nullable(),
	/** Timing, token, tool, file, and error measurements. */
	metrics: z.record(z.string(), z.unknown()),
});

const TaskDetailSchema = z.object({
	/** Immutable Task metadata. */
	task: TaskSchema,
	/** Agent panels in stable slot order. */
	agents: z.array(TaskAgentSchema).min(1).max(6),
	/** Frozen file access policy. */
	fileAccess: z.string().min(1),
	/** Frozen command execution policy. */
	commandExecution: z.string().min(1),
	/** Skill set captured into the baseline. */
	skills: z.array(TaskSkillSchema),
	/** Terminal results collected so far. */
	results: z.array(TaskAgentResultSchema),
});

const CreateTaskAgentSchema = z.object({
	/** Local Agent product to execute. */
	agentKind: AgentKindSchema,
	/** Explicit model snapshot, or null to use the captured runtime default. */
	model: z.string().nullable(),
	/** Explicit mode snapshot, or null to use the captured runtime default. */
	mode: z.string().nullable(),
});
const CreateTaskRequestSchema = z.object({
	/** Owning Workspace, or null for a normal Task. */
	workspaceId: z.string().nullable(),
	/** User-visible Task title. */
	title: z.string().min(1),
	/** Initial natural-language request. */
	prompt: z.string().min(1),
	/** One through six ordered Agent selections. */
	agents: z.array(CreateTaskAgentSchema).min(1).max(6),
	/** Frozen file access policy identifier. */
	fileAccess: z.string().min(1),
	/** Frozen command execution policy identifier. */
	commandExecution: z.string().min(1),
	/** Managed Skill choices for a normal Task. */
	skillIds: z.array(z.string()),
});

const CompiledTaskDetailSchema = z.compile(TaskDetailSchema);
const CompiledTasksSchema = z.compile(z.array(TaskSchema));

type TaskStatus = z.infer<typeof TaskStatusSchema>;
type Task = z.infer<typeof TaskSchema>;
type TaskAgent = z.infer<typeof TaskAgentSchema>;
type TaskAgentResult = z.infer<typeof TaskAgentResultSchema>;
type TaskDetail = z.infer<typeof TaskDetailSchema>;
type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export type {
	CreateTaskRequest,
	Task,
	TaskAgent,
	TaskAgentResult,
	TaskDetail,
	TaskStatus,
};
export {
	CompiledTaskDetailSchema,
	CompiledTasksSchema,
	CreateTaskRequestSchema,
	TaskStatusSchema,
};
