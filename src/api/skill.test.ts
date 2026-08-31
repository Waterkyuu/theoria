import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createPlatformSkill,
	importGitSkill,
	importLocalSkill,
	updateGitSkill,
} from "@/api/skill";

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

	it("creates a minimal platform Skill", async () => {
		vi.mocked(invoke).mockResolvedValue({
			id: "skill-2",
			folderName: "release-notes",
			displayName: "Release Notes",
			description: "Creates release notes.",
			sourceType: "platform",
			sourcePath: null,
			createdAtMs: 1,
			updatedAtMs: 1,
		});

		await createPlatformSkill({
			displayName: "Release Notes",
			description: "Creates release notes.",
			content: "Summarize the changes.",
		});

		expect(invoke).toHaveBeenCalledWith("create_platform_skill", {
			request: {
				displayName: "Release Notes",
				description: "Creates release notes.",
				content: "Summarize the changes.",
			},
		});
	});

	it("imports and updates a Git-backed Skill", async () => {
		vi.mocked(invoke).mockResolvedValue({
			id: "skill-3",
			folderName: "git-skill",
			displayName: "Git Skill",
			description: "Imported from Git.",
			sourceType: "git",
			sourcePath: "https://github.com/example/git-skill.git",
			createdAtMs: 1,
			updatedAtMs: 1,
		});

		await importGitSkill("https://github.com/example/git-skill.git");
		await updateGitSkill("skill-3");

		expect(invoke).toHaveBeenNthCalledWith(1, "import_git_skill", {
			request: { gitUrl: "https://github.com/example/git-skill.git" },
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "update_git_skill", {
			request: { skillId: "skill-3" },
		});
	});
});
