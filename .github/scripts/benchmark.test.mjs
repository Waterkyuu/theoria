import assert from "node:assert/strict";
import test from "node:test";
import { compareMetrics } from "./benchmark.mjs";

test("values exactly at the limits pass", () => {
	const result = compareMetrics(
		{ "Build time (s)": 100, "Executable (bytes)": 1000 },
		{ "Build time (s)": 130, "Executable (bytes)": 1100 },
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

test("executable growth above 10 percent fails even with a faster build", () => {
	const result = compareMetrics(
		{ "Build time (s)": 100, "Executable (bytes)": 1000 },
		{ "Build time (s)": 50, "Executable (bytes)": 1101 },
	);
	assert.equal(result.failed, true);
	assert.match(result.report, /Executable/);
});

test("a zero baseline only permits zero growth", () => {
	assert.equal(compareMetrics({ Size: 0 }, { Size: 1 }).failed, true);
	assert.equal(compareMetrics({ Size: 0 }, { Size: 0 }).failed, false);
});

test("missing or invalid metrics fail instead of silently passing", () => {
	assert.throws(() => compareMetrics({ Size: 100 }, {}));
	assert.throws(() => compareMetrics({}, {}));
	assert.throws(() => compareMetrics({ Size: 100 }, { Size: Number.NaN }));
	assert.throws(() => compareMetrics({ Size: -1 }, { Size: 1 }));
});
