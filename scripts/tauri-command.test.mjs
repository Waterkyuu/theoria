import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("the desktop executable uses the Tauri product name", () => {
	const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
	const metadata = execFileSync(
		"cargo",
		[
			"metadata",
			"--format-version",
			"1",
			"--no-deps",
			"--manifest-path",
			"src-tauri/Cargo.toml",
		],
		{ encoding: "utf8" },
	);
	const binaries = JSON.parse(metadata).packages[0].targets.filter((target) =>
		target.kind.includes("bin"),
	);
	expect(binaries.map((target) => target.name)).toEqual([config.productName]);
});

test("pnpm tauri dev uses the port-selecting launcher", () => {
	const output = execFileSync("pnpm", ["tauri", "dev", "--help"], {
		encoding: "utf8",
	});
	expect(output).toMatch(/Starting Tauri and Vite on port \d+/);
	expect(output).toContain("Run your app in development mode");
});
