import { expect, test } from "@playwright/test";
import type { Skill } from "../src/types/skill";

test("creates a skill and shows it in the library", async ({ page }) => {
	// Keep native storage local to this page while exercising the real form and query cache.
	await page.addInitScript(() => {
		const skills: Skill[] = [];
		Object.assign(window, {
			__TAURI_INTERNALS__: {
				async invoke(
					command: string,
					args: {
						request: Pick<Skill, "displayName" | "description"> & {
							content: string;
						};
					},
				) {
					switch (command) {
						case "set_backend_locale":
							return null;
						case "list_tasks":
						case "list_workspaces":
							return [];
						case "list_skills":
							return [...skills];
						case "create_platform_skill": {
							const { displayName, description, content } = args.request;
							if (!content.trim()) throw new Error("Skill content is required");
							const skill: Skill = {
								id: crypto.randomUUID(),
								folderName: displayName,
								displayName,
								description,
								sourceType: "platform",
								sourcePath: null,
								createdAtMs: 1,
								updatedAtMs: 1,
							};
							skills.push(skill);
							return skill;
						}
						default:
							throw new Error(`Unexpected Tauri command: ${command}`);
					}
				},
			},
		});
	});
	await page.goto("/skills");
	await page.getByRole("button", { name: "Add skill" }).click();
	await page.getByRole("menuitem", { name: "Create in Theoria" }).click();
	await page.getByRole("menuitem", { name: "Simple creation" }).click();

	const create = page.getByRole("button", { name: "Create skill" });
	await expect(create).toBeDisabled();
	await page.getByLabel("Skill name").fill("release-notes");
	await page.getByLabel("Description").fill("Summarize release changes");
	await page.getByLabel("Main content").fill("Group changes by feature.");
	await create.click();

	await expect(page).toHaveURL(/\/skills$/);
	const row = page.getByRole("row").filter({ hasText: "release-notes" });
	await expect(row).toContainText("Summarize release changes");
});
