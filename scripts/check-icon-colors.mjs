import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const ALLOWED_ICON_COLORS = new Set(["text-danger", "text-ink", "text-mute"]);
const BLUE_FOLDER_ICONS = new Set(["FolderFill", "FolderOpenFill"]);
const COLOR_NAME_PATTERN =
	/(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?|(?:primary|on-primary|ink|ink-deep|charcoal|body|mute|canvas|surface-soft|surface-card|hairline|hairline-strong|on-dark|on-dark-mute|surface-dark|focus-ring|link|link-mute|terminal-red|terminal-yellow|terminal-green|danger)(?:\/\d{1,3})?/;
const PROJECT_ROOT = resolve(process.cwd());

/** Returns a one-based source line for concise pre-commit diagnostics. */
const getLine = (source, index) => source.slice(0, index).split("\n").length;

/** Collects icon identifiers imported from the shared icon library. */
const getIconComponentNames = (source) => {
	const names = new Set();
	const importPattern =
		/import\s*{([\s\S]*?)}\s*from\s*["']@gravity-ui\/icons["'];?/g;

	for (const match of source.matchAll(importPattern)) {
		for (const specifier of match[1].split(",")) {
			const importedName = specifier
				.trim()
				.split(/\s+as\s+/)
				.at(-1);
			if (importedName) names.add(importedName);
		}
	}

	return names;
};

/** Finds icon colors that bypass the ink, mute, and danger semantic palette. */
const findIconColorViolations = (source, filePath) => {
	const violations = [];
	const importedIconNames = [...getIconComponentNames(source)];
	if (importedIconNames.length === 0) return violations;
	const iconNames = importedIconNames
		.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|");
	const iconPattern = new RegExp(
		`<(${iconNames})(?=[\\s/>])([\\s\\S]*?)(?:/?>)`,
		"g",
	);

	for (const match of source.matchAll(iconPattern)) {
		const className = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/.exec(
			match[2],
		);
		if (!className) continue;
		const classes = (className[1] ?? className[2] ?? className[3]).split(/\s+/);
		for (const classToken of classes) {
			const color = /^(?:[\w-]+:)*?(text-(.+))$/.exec(classToken);
			const isBlueFolder =
				BLUE_FOLDER_ICONS.has(match[1]) && color?.[1] === "text-blue-300";
			if (
				color &&
				(COLOR_NAME_PATTERN.test(color[2]) || color[2].startsWith("[")) &&
				!ALLOWED_ICON_COLORS.has(color[1]) &&
				!isBlueFolder
			) {
				violations.push({
					filePath,
					line: getLine(source, match.index),
					color: color[1],
				});
			}
		}
	}

	return violations;
};

/** Walks source files for full-repository checks without adding glob dependencies. */
const collectSourceFiles = (directory) =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return collectSourceFiles(path);
		return [".jsx", ".tsx"].includes(extname(entry.name)) ? [path] : [];
	});

/** Resolves either the staged JSX files used by Husky or every JSX source file. */
const resolveFiles = (stagedOnly) => {
	if (!stagedOnly) return collectSourceFiles(join(PROJECT_ROOT, "src"));
	const output = execFileSync(
		"git",
		["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
		{ cwd: PROJECT_ROOT, encoding: "utf8" },
	);
	return output
		.split("\0")
		.filter((path) => [".jsx", ".tsx"].includes(extname(path)))
		.map((path) => join(PROJECT_ROOT, path))
		.filter(existsSync);
};

const isDirectExecution = process.argv[1]
	? resolve(process.argv[1]) ===
		resolve(PROJECT_ROOT, "scripts/check-icon-colors.mjs")
	: false;

if (isDirectExecution) {
	const files = resolveFiles(process.argv.includes("--staged"));
	const violations = files.flatMap((filePath) =>
		findIconColorViolations(
			readFileSync(filePath, "utf8"),
			relative(PROJECT_ROOT, filePath),
		),
	);

	if (violations.length > 0) {
		console.error(
			"Gravity icon colors must use text-ink, text-mute, or text-danger (inverse icons inherit their control color).",
		);
		for (const violation of violations) {
			console.error(
				`  ${violation.filePath}:${violation.line} ${violation.color}`,
			);
		}
		process.exitCode = 1;
	}
}

export { findIconColorViolations };
