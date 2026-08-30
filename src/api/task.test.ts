import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
	continueTask,
	createTask,
	listTasks,
	runTaskExecutions,
} from "@/api/task";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const TASK_DETAIL = {
	task: {
		id: "task-1",
		workspaceId: null,
		title: "Inspect repository",
		prompt: "Inspect repository",
		status: "preparing",
		configurationLockedAtMs: 1,
		createdAtMs: 1,
		updatedAtMs: 1,
	},
	agents: [
		{
			id: "agent-1",
			slotIndex: 0,
			agentKind: "codex",
			modelSnapshot: "gpt-5.6-sol",
			modeSnapshot: "high",
			status: "preparing",
		},
	],
	fileAccess: "workspace-write",
	commandExecution: "allowed",
	skills: [],
	results: [],
	turns: [],
};

describe("Task IPC", () => {
	afterEach(() => vi.clearAllMocks());

	it("sends a complete immutable Task configuration", async () => {
		vi.mocked(invoke).mockResolvedValue(TASK_DETAIL);
		const request = {
			workspaceId: null,
			title: "Inspect repository",
			prompt: "Inspect repository",
			agents: [
				{ agentKind: "codex" as const, model: "gpt-5.6-sol", mode: "high" },
			],
			fileAccess: "workspace-write",
			commandExecution: "allowed",
			skillIds: [],
		};

		await expect(createTask(request)).resolves.toEqual(TASK_DETAIL);
		expect(invoke).toHaveBeenCalledWith("create_task", { request });
	});

	it("uses scoped history and starts prepared executions", async () => {
		vi.mocked(invoke)
			.mockResolvedValueOnce([TASK_DETAIL.task])
			.mockResolvedValueOnce({
				...TASK_DETAIL,
				task: { ...TASK_DETAIL.task, status: "completed" },
			});

		await listTasks("workspace-1");
		await runTaskExecutions("task-1");

		expect(invoke).toHaveBeenNthCalledWith(1, "list_tasks", {
			request: { workspaceId: "workspace-1" },
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "run_task_executions", {
			request: { taskId: "task-1" },
		});
	});

	it("rejects malformed Task detail data", async () => {
		vi.mocked(invoke).mockResolvedValue({
			...TASK_DETAIL,
			agents: [{ ...TASK_DETAIL.agents[0], slotIndex: 8 }],
		});

		await expect(runTaskExecutions("task-1")).rejects.toBeInstanceOf(ZodError);
	});

	it("continues an exact set of persisted Agent sessions", async () => {
		vi.mocked(invoke).mockResolvedValue({
			...TASK_DETAIL,
			task: { ...TASK_DETAIL.task, status: "completed" },
			turns: [
				{
					taskAgentId: "agent-1",
					sequence: 1,
					prompt: "Check tests",
					finalStatus: "completed",
					responseText: "Tests pass.",
					metrics: {},
					createdAtMs: 2,
				},
			],
		});
		const request = {
			taskId: "task-1",
			prompt: "Check tests",
			taskAgentIds: ["agent-1"],
		};

		await expect(continueTask(request)).resolves.toMatchObject({
			turns: [{ prompt: "Check tests" }],
		});
		expect(invoke).toHaveBeenCalledWith("continue_task", { request });
	});
});
