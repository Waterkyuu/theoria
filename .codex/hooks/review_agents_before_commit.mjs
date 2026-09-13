#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

const COMMIT_PATTERN =
	/(?:^|[;&|]\s*)(?<reviewed>CODEX_AGENTS_REVIEWED=1\s+)?git(?:\s+-C\s+(?:'[^']*'|"[^"]*"|\S+))?\s+commit(?:\s|$)/;
const REACT_EXTENSIONS = new Set([".ts", ".tsx"]);
const REACT_INSTRUCTIONS = "src/AGENTS.md";
const RUST_INSTRUCTIONS = "src-tauri/AGENTS.md";

// A synchronous denial gives Codex the selected instructions before it retries the commit.
function deny(reason, context) {
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: reason,
				additionalContext: context,
			},
		}),
	);
}

const event = JSON.parse(readFileSync(0, "utf8"));
const command = event.tool_input?.command;

if (typeof command !== "string") {
	process.exit(0);
}

const commitMatch = command.match(COMMIT_PATTERN);
if (commitMatch === null) {
	process.exit(0);
}

const cwd = event.cwd || process.cwd();
let repository;
let stagedFiles;

try {
	repository = execFileSync(
		"git",
		["-C", cwd, "rev-parse", "--show-toplevel"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		},
	).trim();
	stagedFiles = execFileSync(
		"git",
		["-C", cwd, "diff", "--cached", "--name-only", "-z"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		},
	).split("\0");
} catch {
	deny(
		"Cannot inspect the staged files.",
		"Do not commit until the repository and staged files can be inspected.",
	);
	process.exit(0);
}

const hasRust = stagedFiles.some((path) => extname(path) === ".rs");
const hasReact = stagedFiles.some((path) =>
	REACT_EXTENSIONS.has(extname(path)),
);

if (hasRust && hasReact) {
	deny(
		"Rust and React files are staged together.",
		"Split the staged Rust and React changes into separate commits. " +
			"No scoped AGENTS.md file was injected.",
	);
	process.exit(0);
}

const instructionsPath = hasRust
	? RUST_INSTRUCTIONS
	: hasReact
		? REACT_INSTRUCTIONS
		: null;

if (instructionsPath === null) {
	process.exit(0);
}

let instructions;
try {
	instructions = readFileSync(join(repository, instructionsPath), "utf8");
} catch {
	deny(
		`Required instruction file is unavailable: ${instructionsPath}`,
		`Do not commit until ${instructionsPath} can be read.`,
	);
	process.exit(0);
}

if (commitMatch.groups?.reviewed) {
	process.exit(0);
}

deny(
	`Review ${instructionsPath} before committing.`,
	"Review and apply the current scoped instructions below. Then retry the same " +
		"command with `CODEX_AGENTS_REVIEWED=1` immediately before `git commit`.\n\n" +
		`===== ${instructionsPath} =====\n${instructions}`,
);
