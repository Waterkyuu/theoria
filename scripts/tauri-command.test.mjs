import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

test("pnpm tauri dev uses the port-selecting launcher", () => {
	const output = execFileSync("pnpm", ["tauri", "dev", "--help"], {
		encoding: "utf8",
	});
	expect(output).toMatch(/Starting Tauri and Vite on port \d+/);
	expect(output).toContain("Run your app in development mode");
});
