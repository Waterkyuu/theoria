import { compareMetrics } from "./benchmark.mjs";
import assert from "node:assert/strict";
import test from "node:test";

test("values exactly at the limits pass", () => {
	const result = compareMetrics(
		{ "Build time (s)": 100, "Total size (bytes)": 1000 },
		{ "Build time (s)": 130, "Total size (bytes)": 1100 },
	);
	assert.equal(result.failed, false);
	assert.match(result.report, /PASS/);
});

test("build time growth above 30 percent fails", () => {
	const result = compareMetrics(
		{ "Build time (s)": 100 },
		{ "Build time (s)": 130.01 },
	);
	assert.equal(result.failed, true);
	assert.match(result.report, /FAIL/);
});

test("asset growth above 10 percent fails even with a faster build", () => {
	const result = compareMetrics(
		{ "Build time (s)": 100, "CSS (bytes)": 1000 },
		{ "Build time (s)": 50, "CSS (bytes)": 1101 },
	);
	assert.equal(result.failed, true);
	assert.match(result.report, /CSS/);
});

test("new asset categories cannot bypass the size limit", () => {
	assert.equal(compareMetrics({ CSS: 0 }, { CSS: 1 }).failed, true);
	assert.equal(compareMetrics({ CSS: 0 }, { CSS: 0 }).failed, false);
});

test("missing or invalid metrics fail instead of silently passing", () => {
	assert.throws(() => compareMetrics({ Size: 100 }, {}));
	assert.throws(() => compareMetrics({}, {}));
	assert.throws(() => compareMetrics({ Size: 100 }, { Size: Number.NaN }));
	assert.throws(() => compareMetrics({ Size: -1 }, { Size: 1 }));
});

test("editor assets fit the explicit frontend budgets", () => {
	const result = compareMetrics(
		{ "dist total (bytes)": 1649805, "JavaScript (bytes)": 1197382 },
		{ "dist total (bytes)": 2283349, "JavaScript (bytes)": 1827499 },
	);
	assert.equal(result.failed, false);
	assert.match(result.report, /absolute budget/);
});

test("frontend budgets accept the boundary and reject one extra byte", () => {
	for (const [name, budget] of [
		["dist total (bytes)", 3550000],
		["JavaScript (bytes)", 3100000],
	]) {
		assert.equal(
			compareMetrics({ [name]: 100 }, { [name]: budget }).failed,
			false,
		);
		assert.equal(
			compareMetrics({ [name]: budget }, { [name]: budget + 1 }).failed,
			true,
		);
	}
});

test("Rust executable growth still uses the 10 percent limit", () => {
	assert.equal(
		compareMetrics(
			{ "Executable (bytes)": 1000 },
			{ "Executable (bytes)": 1101 },
		).failed,
		true,
	);
});

test("additional local language modes fit the frontend budgets", () => {
	const result = compareMetrics(
		{ "dist total (bytes)": 1649805, "JavaScript (bytes)": 1197382 },
		{ "dist total (bytes)": 2493366, "JavaScript (bytes)": 2037525 },
	);
	assert.equal(result.failed, false);
});

test("the offline language catalog fits the frontend budgets", () => {
	const result = compareMetrics(
		{ "dist total (bytes)": 1649805, "JavaScript (bytes)": 1197382 },
		{ "dist total (bytes)": 3337005, "JavaScript (bytes)": 2881164 },
	);
	assert.equal(result.failed, false);
});
