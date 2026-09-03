import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { taskKeys, useSetTaskPin } from "@/queries/task";
import type { Task } from "@/types/task";

const taskApiMocks = vi.hoisted(() => ({
	setTaskPin: vi.fn(),
}));

vi.mock("@/api/task", () => taskApiMocks);

type QueryWrapperProps = {
	/** Test content connected to the isolated query cache. */
	children: ReactNode;
};

describe("Task queries", () => {
	beforeEach(() => vi.clearAllMocks());

	it("refreshes the owning Workspace list after pinning its Task", async () => {
		const queryClient = new QueryClient();
		const task: Task = {
			id: "task-1",
			workspaceId: "workspace-1",
			title: "Inspect repository",
			prompt: "Inspect repository",
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
