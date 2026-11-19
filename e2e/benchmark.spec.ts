import { expect, test } from "@playwright/test";

for (const width of [375, 768, 960, 1024, 1440]) {
	test(`public benchmark setup stays usable at ${width}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 640 });
		// Only the native persistence boundary is substituted; the production catalog and modal run unchanged.
		await page.addInitScript(() => {
			Object.assign(window, {
				__TAURI_INTERNALS__: {
					async invoke(command: string) {
						if (command === "set_backend_locale") return null;
						if (command === "list_benchmark_tags")
							return [{ id: "coding", name: "Coding", icon: "Code" }];
						if (
							["list_tasks", "list_workspaces", "list_benchmarks"].includes(
								command,
							)
						)
							return [];
						throw new Error(`Unexpected Tauri command: ${command}`);
					},
				},
			});
		});
		await page.goto("/benchmark");
		await page.getByRole("button", { name: "Add new" }).click();
		await page.getByRole("menuitem", { name: "Add public benchmark" }).click();
		const modal = page.getByRole("dialog", {
			name: "Add public benchmark",
			exact: true,
		});
		await expect(modal).toBeVisible();
		await expect(modal.getByText(/Harbor 0.26.0/)).toBeVisible();
		await modal
			.getByRole("textbox", { name: "Upstream task names" })
			.fill("build-cython-ext");
		await expect(
			modal.getByRole("button", { name: "Add public benchmark" }),
		).toBeEnabled();
		await expect(
			modal.getByRole("button", { name: "Close", exact: true }),
		).toBeVisible();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	});
}
