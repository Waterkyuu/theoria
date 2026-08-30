import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importLocalSkill } from "@/api/skill";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Skill IPC", () => {
	afterEach(() => vi.clearAllMocks());

	it("imports a complete local Skill folder", async () => {
		vi.mocked(invoke).mockResolvedValue({
			id: "skill-1",
			folderName: "repository-map",
			displayName: "Repository Map",
			description: "Maps repository structure.",
			sourceType: "local_folder",
			sourcePath: "/tmp/repository-map",
			createdAtMs: 1,
			updatedAtMs: 1,
		});

		await importLocalSkill("/tmp/repository-map");

		expect(invoke).toHaveBeenCalledWith("import_local_skill", {
			request: { sourcePath: "/tmp/repository-map" },
		});
	});
});
