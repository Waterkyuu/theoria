import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listWorkspaces, setWorkspacePin } from "@/api/workspace";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Workspace IPC", () => {
	afterEach(() => vi.clearAllMocks());

	it("validates Workspace responses before returning them", async () => {
		vi.mocked(invoke).mockResolvedValue([
			{
				id: "workspace-1",
				name: "Docs",
				sourceKind: "external",
				sourcePath: "/tmp/docs",
				pinnedAtMs: null,
				createdAtMs: 1,
				updatedAtMs: 2,
			},
		]);

		await expect(listWorkspaces()).resolves.toHaveLength(1);
		expect(invoke).toHaveBeenCalledWith("list_workspaces", undefined);
	});

	it("sends the requested Workspace pin state", async () => {
		vi.mocked(invoke).mockResolvedValue({
			id: "workspace-1",
			name: "Docs",
			sourceKind: "external",
			sourcePath: "/tmp/docs",
			pinnedAtMs: 10,
			createdAtMs: 1,
			updatedAtMs: 10,
		});

		await expect(setWorkspacePin("workspace-1", true)).resolves.toMatchObject({
			pinnedAtMs: 10,
		});
		expect(invoke).toHaveBeenCalledWith("set_workspace_pin", {
			request: { isPinned: true, workspaceId: "workspace-1" },
		});
	});
});
