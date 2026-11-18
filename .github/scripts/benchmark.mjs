import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BUILD_TIME_LIMIT_PERCENT = 30;
const SIZE_LIMIT_PERCENT = 10;
/**
 * Compare the release build time and executable size against the baseline.
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
		const maximum = (before * (100 + percent)) / 100;
		const regression = after > maximum;
		failed ||= regression;
		rows.push(
			`| ${name} | ${before.toFixed(3)} | ${after.toFixed(3)} | ${maximum.toFixed(3)} (+${percent}%) | ${regression ? "FAIL" : "PASS"} |`,
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

/** Exclude downloads and give each Rust revision an empty compilation directory. */
const measure = (root) => {
	const target = mkdtempSync(join(tmpdir(), "theoria-benchmark-"));
	const env = { CARGO_TARGET_DIR: target };
	try {
		const manifest = ["--manifest-path", "src-tauri/Cargo.toml", "--locked"];
		run("cargo", ["fetch", ...manifest], root, env);
		const started = performance.now();
		run(
			"cargo",
			[
				"build",
				...manifest,
				"--release",
				"--all-features",
				"--bin",
				"agent-gauge",
			],
			root,
			env,
		);
		return {
			"Build time (s)": (performance.now() - started) / 1000,
			"Executable (bytes)": statSync(join(target, "release", "agent-gauge"))
				.size,
		};
	} finally {
		rmSync(target, { recursive: true });
	}
};

/** Write the comparison before returning a failing exit code to Actions. */
const main = () => {
	const [kind, baselinePath, currentPath] = process.argv.slice(2);
	if (kind !== "rust" || !baselinePath || !currentPath) {
		throw new Error("Usage: node benchmark.mjs rust <baseline> <current>");
	}
	const baselineRoot = realpathSync(baselinePath);
	const currentRoot = realpathSync(currentPath);
	const baseline = measure(baselineRoot);
	const current = measure(currentRoot);
	const { report: table, failed } = compareMetrics(baseline, current);
	const revisions = [baselineRoot, currentRoot].map((cwd) =>
		execFileSync("git", ["rev-parse", "HEAD"], {
			cwd,
			encoding: "utf8",
		}).trim(),
	);
	const notes =
		"One cold release build per revision with separate empty target directories. Executable size excludes installers.";
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
