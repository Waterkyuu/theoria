import { Toast, toast } from "@heroui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceActionDropdown } from "./workspace-action-dropdown";

const queryMocks = vi.hoisted(() => ({
	renameWorkspace: vi.fn(),
	removeWorkspace: vi.fn(),
	setWorkspacePin: vi.fn(),
}));

vi.mock("@/queries/workspace", () => ({
	useRenameWorkspace: () => ({
		isPending: false,
		mutateAsync: queryMocks.renameWorkspace,
	}),
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
		queryMocks.renameWorkspace.mockResolvedValue(undefined);
		queryMocks.setWorkspacePin.mockResolvedValue(undefined);
	});

	it("offers to unpin a pinned Workspace and persists that choice", async () => {
		const user = userEvent.setup();
		const toastSuccess = vi.spyOn(Toast.toast, "success");
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
		expect(toastSuccess).toHaveBeenCalledWith("已取消置顶工作区“Docs”");
	});

	it("shows a danger toast when the pin update fails", async () => {
		const user = userEvent.setup();
		const pinError = new Error("置顶失败，请重试。");
		const toastDanger = vi.spyOn(toast, "danger");
		vi.spyOn(console, "error").mockImplementation(() => {});
		queryMocks.setWorkspacePin.mockRejectedValueOnce(pinError);
		render(
			<WorkspaceActionDropdown
				workspace={{
					id: "workspace-1",
					name: "Docs",
					sourceKind: "external",
					sourcePath: "/tmp/docs",
					pinnedAtMs: null,
					createdAtMs: 1,
					updatedAtMs: 1,
				}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Docs 的更多操作" }));
		await user.click(await screen.findByRole("menuitem", { name: "置顶" }));

		expect(toastDanger).toHaveBeenCalledWith("工作区置顶状态更新失败，请重试");
	});

	it("renames a Workspace through the shared rename modal", async () => {
		const user = userEvent.setup();
		const toastSuccess = vi.spyOn(Toast.toast, "success");
		render(
			<WorkspaceActionDropdown
				workspace={{
					id: "workspace-1",
					name: "Docs",
					sourceKind: "external",
					sourcePath: "/tmp/docs",
					pinnedAtMs: null,
					createdAtMs: 1,
					updatedAtMs: 1,
				}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Docs 的更多操作" }));
		await user.click(await screen.findByRole("menuitem", { name: "重命名" }));
		const dialog = await screen.findByRole("dialog", { name: "重命名工作区" });
		const nameInput = within(dialog).getByRole("textbox", {
			name: "工作区名称",
		});
		await user.clear(nameInput);
		await user.type(nameInput, "  Research  ");
		await user.click(within(dialog).getByRole("button", { name: "保存" }));

		expect(queryMocks.renameWorkspace).toHaveBeenCalledWith({
			name: "Research",
			workspaceId: "workspace-1",
		});
		expect(toastSuccess).toHaveBeenCalledWith("已重命名工作区为“Research”");
	});
});
