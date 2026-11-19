import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

export default defineConfig({
	testDir: "./e2e",
	forbidOnly: !!process.env.CI,
	use: {
		baseURL,
		browserName: "chromium",
		locale: "en-US",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm dev --host 127.0.0.1 --port 4173 --strictPort",
		url: baseURL,
	},
});
