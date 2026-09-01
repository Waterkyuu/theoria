import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoveWorkspace, workspaceKeys } from "@/queries/workspace";
import type { Workspace } from "@/types/workspace";

const workspaceApiMocks = vi.hoisted(() => ({
	createManagedWorkspace: vi.fn(),
	listWorkspaces: vi.fn(),
	registerExternalWorkspace: vi.fn(),
	removeWorkspace: vi.fn(),
}));

vi.mock("@/api/workspace", () => workspaceApiMocks);

type QueryWrapperProps = {
	/** Test content connected to the isolated query cache. */
	children: ReactNode;
};

describe("Workspace queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		workspaceApiMocks.removeWorkspace.mockResolvedValue(undefined);
	});

	it("removes a deleted Workspace from the list cache immediately", async () => {
		const queryClient = new QueryClient();
		const workspace: Workspace = {
			id: "workspace-1",
			name: "Docs",
			sourceKind: "external",
			sourcePath: "/tmp/docs",
			pinnedAtMs: null,
			createdAtMs: 1,
			updatedAtMs: 1,
		};
		queryClient.setQueryData(workspaceKeys.list(), [workspace]);

		/** Connects the hook to a fresh cache so removal assertions cannot leak. */
		const QueryWrapper = ({ children }: QueryWrapperProps) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(() => useRemoveWorkspace(), {
			wrapper: QueryWrapper,
		});

		await act(() =>
			result.current.mutateAsync({
				managedFilesConfirmed: false,
				workspaceId: workspace.id,
			}),
		);

		expect(queryClient.getQueryData(workspaceKeys.list())).toEqual([]);
	});
});
