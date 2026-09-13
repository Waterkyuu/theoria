import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "vitest";

const HOOK_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"review_agents_before_commit.mjs",
);
const HOOK_CONFIG_PATH = join(dirname(HOOK_PATH), "..", "hooks.json");

it("configures the hook to run the MJS implementation with Node.js", () => {
	const config = JSON.parse(readFileSync(HOOK_CONFIG_PATH, "utf8"));
	const command = config.hooks.PreToolUse[0].hooks[0].command;

	assert.match(command, /^node .*review_agents_before_commit\.mjs/);
	assert.doesNotMatch(command, /python/i);
});

describe("review_agents_before_commit", () => {
	let repository;

	beforeEach(() => {
		repository = mkdtempSync(join(tmpdir(), "codex-hook-"));
		execFileSync("git", ["init", "--quiet", repository]);
		write("src/AGENTS.md", "REACT_INSTRUCTIONS");
		write("src-tauri/AGENTS.md", "RUST_INSTRUCTIONS");
	});

	afterEach(() => {
		rmSync(repository, { recursive: true, force: true });
	});

	it("injects only Rust instructions for staged Rust files", () => {
		stage("src-tauri/src/lib.rs");

		const result = runHook("git commit -m 'feat: rust'");
		const context = result.hookSpecificOutput.additionalContext;

		assert.equal(result.hookSpecificOutput.permissionDecision, "deny");
		assert.match(context, /RUST_INSTRUCTIONS/);
		assert.doesNotMatch(context, /REACT_INSTRUCTIONS/);
	});

	for (const sourceFile of ["src/example.ts", "src/example.tsx"]) {
		it(`injects only React instructions for ${sourceFile}`, () => {
			stage(sourceFile);

			const result = runHook("git commit -m 'feat: react'");
			const context = result.hookSpecificOutput.additionalContext;

			assert.match(context, /REACT_INSTRUCTIONS/);
			assert.doesNotMatch(context, /RUST_INSTRUCTIONS/);
		});
	}

	it("ignores non-source files in scoped directories", () => {
		stage("src-tauri/tauri.conf.json");
		stage("src/styles.css");

		const completed = invokeHook("git commit -m 'chore: config and styles'");

		assert.equal(completed.status, 0);
		assert.equal(completed.stdout, "");
	});

	it("inspects the repository selected by git -C", () => {
		stage("src-tauri/src/lib.rs");
		const targetRepository = mkdtempSync(join(tmpdir(), "codex-hook-target-"));

		try {
			execFileSync("git", ["init", "--quiet", targetRepository]);
			const targetInstructions = join(targetRepository, "src/AGENTS.md");
			mkdirSync(dirname(targetInstructions), { recursive: true });
			writeFileSync(targetInstructions, "TARGET_REACT_INSTRUCTIONS", "utf8");
			const targetFile = join(targetRepository, "src/example.ts");
			writeFileSync(targetFile, "change", "utf8");
			execFileSync("git", ["-C", targetRepository, "add", "src/example.ts"]);

			const result = runHook(
				`git -C "${targetRepository}" commit -m 'feat: target'`,
			);
			const context = result.hookSpecificOutput.additionalContext;

			assert.match(context, /TARGET_REACT_INSTRUCTIONS/);
			assert.doesNotMatch(context, /RUST_INSTRUCTIONS/);
		} finally {
			rmSync(targetRepository, { recursive: true, force: true });
		}
	});

	it("blocks mixed commits without injecting either instruction file", () => {
		stage("src-tauri/src/lib.rs");
		stage("src/example.ts");

		const result = runHook("git commit -m 'feat: mixed'");
		const output = result.hookSpecificOutput;

		assert.equal(output.permissionDecision, "deny");
		assert.match(
			output.additionalContext,
			/Split the staged Rust and React changes/,
		);
		assert.doesNotMatch(output.additionalContext, /RUST_INSTRUCTIONS/);
		assert.doesNotMatch(output.additionalContext, /REACT_INSTRUCTIONS/);
	});

	it("ignores commits without Rust or React files", () => {
		stage("README.md");

		const completed = invokeHook("git commit -m 'docs: update'");

		assert.equal(completed.status, 0);
		assert.equal(completed.stdout, "");
	});

	it("allows a retried commit carrying the review marker", () => {
		stage("src/example.ts");

		const completed = invokeHook(
			"CODEX_AGENTS_REVIEWED=1 git commit -m 'feat: react'",
		);

		assert.equal(completed.status, 0);
		assert.equal(completed.stdout, "");
	});

	function write(relativePath, content) {
		const path = join(repository, relativePath);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content, "utf8");
	}

	function stage(relativePath) {
		write(relativePath, "change");
		execFileSync("git", ["-C", repository, "add", relativePath]);
	}

	function invokeHook(command) {
		return spawnSync("node", [HOOK_PATH], {
			input: JSON.stringify({
				cwd: repository,
				hook_event_name: "PreToolUse",
				tool_input: { command },
				tool_name: "Bash",
			}),
			encoding: "utf8",
		});
	}

	function runHook(command) {
		const completed = invokeHook(command);
		assert.equal(completed.status, 0, completed.stderr);
		assert.notEqual(completed.stdout, "");
		return JSON.parse(completed.stdout);
	}
});
