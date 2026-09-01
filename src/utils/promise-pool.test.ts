import { describe, expect, it } from "vitest";
import { promisePool } from "./promise-pool";

describe("promisePool", () => {
	it("starts the next queued task after one of four running tasks finishes", async () => {
		const startedTasks: number[] = [];
		const resolvers: Array<(value: number) => void> = [];
		const items = Array.from({ length: 5 }, (_, index) => index);
		const worker = (index: number) =>
			new Promise<number>((resolve) => {
				startedTasks.push(index);
				resolvers[index] = resolve;
			});

		const resultPromise = promisePool(items, worker);
		await Promise.resolve();

		expect(startedTasks).toEqual([0, 1, 2, 3]);

		resolvers[1]?.(1);
		await Promise.resolve();
		await Promise.resolve();

		expect(startedTasks).toEqual([0, 1, 2, 3, 4]);

		resolvers[0]?.(0);
		resolvers[2]?.(2);
		resolvers[3]?.(3);
		resolvers[4]?.(4);
		await resultPromise;
	});

	it("returns results in the same order as the queued tasks", async () => {
		let resolveFirstTask: ((value: string) => void) | undefined;
		const firstTask = new Promise<string>((resolve) => {
			resolveFirstTask = resolve;
		});
		const resultPromise = promisePool(["first", "second"], (value) =>
			value === "first" ? firstTask : Promise.resolve(value),
		);

		await Promise.resolve();
		resolveFirstTask?.("first");

		await expect(resultPromise).resolves.toEqual(["first", "second"]);
	});

	it("passes each item and index to the worker", async () => {
		const results = await promisePool(
			["alpha", "beta"],
			async (item, index) => `${index}:${item}`,
		);

		expect(results).toEqual(["0:alpha", "1:beta"]);
	});

	it("uses a custom concurrency limit", async () => {
		const startedTasks: number[] = [];
		const resolvers: Array<(value: number) => void> = [];
		const resultPromise = promisePool(
			[0, 1, 2],
			(index) =>
				new Promise<number>((resolve) => {
					startedTasks.push(index);
					resolvers[index] = resolve;
				}),
			2,
		);

		await Promise.resolve();
		expect(startedTasks).toEqual([0, 1]);

		resolvers[0]?.(0);
		await Promise.resolve();
		await Promise.resolve();
		expect(startedTasks).toEqual([0, 1, 2]);

		resolvers[1]?.(1);
		resolvers[2]?.(2);
		await resultPromise;
	});

	it("caps the concurrency limit at six", async () => {
		const startedTasks: number[] = [];
		const resolvers: Array<(value: number) => void> = [];
		const resultPromise = promisePool(
			[0, 1, 2, 3, 4, 5, 6],
			(index) =>
				new Promise<number>((resolve) => {
					startedTasks.push(index);
					resolvers[index] = resolve;
				}),
			10,
		);

		await Promise.resolve();
		expect(startedTasks).toEqual([0, 1, 2, 3, 4, 5]);

		resolvers[0]?.(0);
		await Promise.resolve();
		await Promise.resolve();
		expect(startedTasks).toEqual([0, 1, 2, 3, 4, 5, 6]);

		for (const [index, resolve] of resolvers.entries()) {
			resolve(index);
		}
		await resultPromise;
	});

	it("retries a rejected worker once by default", async () => {
		let attempts = 0;

		const results = await promisePool(["request"], async (item) => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("Temporary failure");
			}
			return item;
		});

		expect(results).toEqual(["request"]);
		expect(attempts).toBe(2);
	});

	it("rejects after the default retry is exhausted", async () => {
		let attempts = 0;

		const resultPromise = promisePool(["request"], async () => {
			attempts += 1;
			throw new Error("Permanent failure");
		});

		await expect(resultPromise).rejects.toThrow("Permanent failure");
		expect(attempts).toBe(2);
	});
});
