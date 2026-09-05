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
		{ "Build time (s)": 100, "JavaScript (bytes)": 1000 },
		{ "Build time (s)": 50, "JavaScript (bytes)": 1101 },
	);
	assert.equal(result.failed, true);
	assert.match(result.report, /JavaScript/);
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
