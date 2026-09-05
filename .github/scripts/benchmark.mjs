import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BUILD_TIME_LIMIT_PERCENT = 30;
const SIZE_LIMIT_PERCENT = 10;
// Includes the locally bundled editor, with limited headroom over its initial build.
// Absolute budgets prevent the allowed frontend size from growing after every merge.
const FRONTEND_SIZE_BUDGETS = new Map([
	["dist total (bytes)", 2_400_000],
	["JavaScript (bytes)", 1_950_000],
]);

/**
 * Enforce fixed editor-inclusive asset budgets while retaining other growth limits.
 *
 * @example
 * compareMetrics({ "Build time (s)": 10 }, { "Build time (s)": 12 })
 */
const compareMetrics = (baseline, current) => {
	const names = Object.keys(baseline);
	if (!names.length || names.length !== Object.keys(current).length) {
		throw new Error("Baseline and current metrics must match and be nonempty");
	}
	const rows = [
		"| Metric | Baseline | Current | Maximum | Result |",
		"| --- | ---: | ---: | ---: | --- |",
	];
	let failed = false;
	for (const name of names) {
		const before = baseline[name];
		const after = current[name];
		if (
			!Number.isFinite(before) ||
			!Number.isFinite(after) ||
			before < 0 ||
			after < 0
		) {
			throw new Error(`Missing or invalid metric: ${name}`);
		}
		const percent =
			name === "Build time (s)" ? BUILD_TIME_LIMIT_PERCENT : SIZE_LIMIT_PERCENT;
		const budget = FRONTEND_SIZE_BUDGETS.get(name);
		const maximum = budget ?? (before * (100 + percent)) / 100;
		const limitLabel =
			budget === undefined ? `+${percent}%` : "absolute budget";
		const regression = after > maximum;
		failed ||= regression;
		rows.push(
			`| ${name} | ${before.toFixed(3)} | ${after.toFixed(3)} | ${maximum.toFixed(3)} (${limitLabel}) | ${regression ? "FAIL" : "PASS"} |`,
		);
	}
	return { report: rows.join("\n"), failed };
};

/** Run build tools directly and propagate failures before reporting measurements. */
const run = (command, args, cwd, env) => {
	execFileSync(command, args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: "inherit",
	});
};

/** Accumulate actual file bytes, including nested chunks, without directory overhead. */
const collectFrontendSizes = (directory, metrics) => {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = `${directory}/${entry.name}`;
		if (entry.isDirectory()) {
			collectFrontendSizes(path, metrics);
		} else if (entry.isFile()) {
			const { size } = statSync(path);
			metrics["dist total (bytes)"] += size;
			if (entry.name.endsWith(".js")) metrics["JavaScript (bytes)"] += size;
			if (entry.name.endsWith(".css")) metrics["CSS (bytes)"] += size;
		}
	}
};

/** Exclude downloads and give each Rust revision an empty compilation directory. */
const measure = (kind, root) => {
	const target = mkdtempSync(join(tmpdir(), "theoria-benchmark-"));
	const env = { HUSKY: "0", CARGO_TARGET_DIR: target };
	try {
		if (kind === "frontend") {
			run("pnpm", ["install", "--frozen-lockfile"], root, env);
		} else {
			run(
				"cargo",
				["fetch", "--manifest-path", "src-tauri/Cargo.toml", "--locked"],
				root,
				env,
			);
		}
		const durations = [];
		const repetitions = kind === "frontend" ? 3 : 1;
		for (let sample = 0; sample < repetitions; sample++) {
			if (kind === "frontend") {
				// Discard compiler metadata so later samples have the same starting state.
				for (const entry of readdirSync(root, { withFileTypes: true })) {
					if (entry.isFile() && entry.name.endsWith(".tsbuildinfo"))
						rmSync(`${root}/${entry.name}`);
				}
			}
			const started = performance.now();
			if (kind === "frontend") {
				run("pnpm", ["build"], root, env);
			} else {
				run(
					"cargo",
					[
						"build",
						"--manifest-path",
						"src-tauri/Cargo.toml",
						"--locked",
						"--release",
						"--all-features",
						"--bin",
						"agent-gauge",
					],
					root,
					env,
				);
			}
			durations.push((performance.now() - started) / 1000);
		}
		durations.sort((a, b) => a - b);
		const metrics = {
			"Build time (s)": durations[Math.floor(durations.length / 2)],
		};
		if (kind === "frontend") {
			metrics["dist total (bytes)"] = 0;
			metrics["JavaScript (bytes)"] = 0;
			metrics["CSS (bytes)"] = 0;
			collectFrontendSizes(`${root}/dist`, metrics);
			if (!metrics["dist total (bytes)"])
				throw new Error("Frontend build produced no assets");
		} else {
			metrics["Executable (bytes)"] = statSync(
				`${target}/release/agent-gauge`,
			).size;
		}
		return metrics;
	} finally {
		rmSync(target, { recursive: true });
	}
};

/** Write the comparison before returning a failing exit code to Actions. */
const main = () => {
	const [kind, baselinePath, currentPath] = process.argv.slice(2);
	if (
		(kind !== "frontend" && kind !== "rust") ||
		!baselinePath ||
		!currentPath
	) {
		throw new Error(
			"Usage: node benchmark.mjs <frontend|rust> <baseline> <current>",
		);
	}
	const baselineRoot = realpathSync(baselinePath);
	const currentRoot = realpathSync(currentPath);
	const baseline = measure(kind, baselineRoot);
	const current = measure(kind, currentRoot);
	const { report: table, failed } = compareMetrics(baseline, current);
	const revisions = [baselineRoot, currentRoot].map((cwd) =>
		execFileSync("git", ["rev-parse", "HEAD"], {
			cwd,
			encoding: "utf8",
		}).trim(),
	);
	const notes =
		kind === "frontend"
			? "Median of three pnpm builds per revision, including type-checking; uncompressed file sizes."
			: "One cold release build per revision with separate empty target directories; executable size excludes installers.";
	const report = `### ${kind} build benchmark\n\nBaseline: \`${revisions[0]}\`  \nCurrent: \`${revisions[1]}\`\n\n${table}\n\n${notes} Dependency downloads are excluded. Both revisions run on the same runner.\n`;
	console.log(report);
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary) appendFileSync(summary, report);
	process.exitCode = failed ? 1 : 0;
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
	main();

export { compareMetrics };
