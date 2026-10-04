import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { taskKeys, useRunTask, useSetTaskPin } from "@/queries/task";
import { type Task, TaskDetailSchema } from "@/types/task";

const taskApiMocks = vi.hoisted(() => ({
	runTaskExecutions: vi.fn(),
	setTaskPin: vi.fn(),
}));

vi.mock("@/api/task", () => taskApiMocks);

type QueryWrapperProps = {
	/** Test content connected to the isolated query cache. */
	children: ReactNode;
};

describe("Task queries", () => {
	beforeEach(() => vi.clearAllMocks());

	it("seeds the Task detail and refreshes the owning list after a run", async () => {
		const queryClient = new QueryClient();
		const detail = TaskDetailSchema.parse({
			prompt: "Inspect repository",
			task: {
				id: "task-1",
				workspaceId: "workspace-1",
				title: "Inspect repository",
				kind: "work",
				status: "completed",
				configurationLockedAtMs: 1,
				pinnedAtMs: null,
				createdAtMs: 1,
				updatedAtMs: 2,
			},
			agents: [
				{
					id: "agent-1",
					slotIndex: 0,
					agentKind: "codex",
					modelSnapshot: null,
					modeSnapshot: null,
					status: "completed",
				},
			],
			fileAccess: "read_only",
			commandExecution: "deny",
			skills: [],
			results: [],
			turns: [],
		});
		taskApiMocks.runTaskExecutions.mockResolvedValue(detail);
		queryClient.setQueryData(taskKeys.list(detail.task.workspaceId), []);
		queryClient.setQueryData(taskKeys.list(null), []);

		/** Connects the hook to a fresh cache so seeding assertions cannot leak. */
		const QueryWrapper = ({ children }: QueryWrapperProps) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(() => useRunTask(), {
			wrapper: QueryWrapper,
		});

		await act(() => result.current.mutateAsync(detail.task.id));

		expect(queryClient.getQueryData(taskKeys.detail(detail.task.id))).toEqual(
			detail,
		);
		expect(
			queryClient.getQueryState(taskKeys.list(detail.task.workspaceId))
				?.isInvalidated,
		).toBe(true);
		expect(queryClient.getQueryState(taskKeys.list(null))?.isInvalidated).toBe(
			false,
		);
	});

	it("refreshes the owning Workspace list after pinning its Task", async () => {
		const queryClient = new QueryClient();
		const task: Task = {
			id: "task-1",
			workspaceId: "workspace-1",
			title: "Inspect repository",
			kind: "work",
			status: "completed",
			configurationLockedAtMs: 1,
			pinnedAtMs: 2,
			createdAtMs: 1,
			updatedAtMs: 1,
		};
		taskApiMocks.setTaskPin.mockResolvedValue(task);
		queryClient.setQueryData(taskKeys.list(task.workspaceId), [task]);
		queryClient.setQueryData(taskKeys.list(null), []);

		/** Connects the hook to a fresh cache so scope assertions cannot leak. */
		const QueryWrapper = ({ children }: QueryWrapperProps) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(() => useSetTaskPin(), {
			wrapper: QueryWrapper,
		});

		await act(() =>
			result.current.mutateAsync({ isPinned: true, taskId: task.id }),
		);

		expect(
			queryClient.getQueryState(taskKeys.list(task.workspaceId))?.isInvalidated,
		).toBe(true);
		expect(queryClient.getQueryState(taskKeys.list(null))?.isInvalidated).toBe(
			false,
		);
	});
});
