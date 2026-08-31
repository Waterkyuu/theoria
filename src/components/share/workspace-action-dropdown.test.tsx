import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceActionDropdown } from "./workspace-action-dropdown";

const queryMocks = vi.hoisted(() => ({
	removeWorkspace: vi.fn(),
	setWorkspacePin: vi.fn(),
}));

vi.mock("@/queries/workspace", () => ({
	useRemoveWorkspace: () => ({
		error: null,
		isPending: false,
		mutateAsync: queryMocks.removeWorkspace,
	}),
	useSetWorkspacePin: () => ({
		isPending: false,
		mutateAsync: queryMocks.setWorkspacePin,
	}),
}));

describe("WorkspaceActionDropdown", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryMocks.setWorkspacePin.mockResolvedValue(undefined);
	});

	it("offers to unpin a pinned Workspace and persists that choice", async () => {
		const user = userEvent.setup();
		render(
			<WorkspaceActionDropdown
				workspace={{
					id: "workspace-1",
					name: "Docs",
					sourceKind: "external",
					sourcePath: "/tmp/docs",
					pinnedAtMs: 10,
					createdAtMs: 1,
					updatedAtMs: 10,
				}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Docs 的更多操作" }));
		await user.click(await screen.findByRole("menuitem", { name: "取消置顶" }));

		expect(queryMocks.setWorkspacePin).toHaveBeenCalledWith({
			isPinned: false,
			workspaceId: "workspace-1",
		});
	});
});
