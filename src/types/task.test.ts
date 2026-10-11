import { describe, expect, it } from "vitest";
import { isActiveTaskStatus } from "@/types/task";

describe("Task status semantics", () => {
	it("treats only preparing and running Tasks as active", () => {
		expect(isActiveTaskStatus("preparing")).toBe(true);
		expect(isActiveTaskStatus("running")).toBe(true);
		expect(isActiveTaskStatus("waiting")).toBe(false);
		expect(isActiveTaskStatus("completed")).toBe(false);
		expect(isActiveTaskStatus("failed")).toBe(false);
		expect(isActiveTaskStatus("stopped")).toBe(false);
		expect(isActiveTaskStatus(undefined)).toBe(false);
	});
});
