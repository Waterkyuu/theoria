import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	importBenchmarkAsset,
	importBenchmarkFolder,
	previewBenchmarkAsset,
	previewBenchmarkImport,
} from "@/api/benchmark";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Benchmark import IPC", () => {
	afterEach(() => vi.clearAllMocks());

	it("validates previews and sends picker paths only in requests", async () => {
		vi.mocked(invoke)
			.mockResolvedValueOnce({
				name: "Imported suite",
				description: "Portable fixture",
				source: null,
				cases: [
					{
						name: "One",
						timeoutMinutes: 5,
						inputFileCount: 1,
						checkKinds: ["file_json"],
					},
				],
				fileCount: 1,
				issues: [],
			})
			.mockResolvedValueOnce({
				id: "draft-1",
				benchmarkId: null,
				revision: 1,
				document: {
					schemaVersion: 1,
					name: "Imported suite",
					description: "Portable fixture",
					tagId: "coding",
					source: null,
					cases: [],
				},
				updatedAtMs: 1,
			})
			.mockResolvedValueOnce({ path: "input.txt", assetId: "asset-1" })
			.mockResolvedValueOnce({
				assetId: "asset-1",
				sizeBytes: 7,
				text: "fixture",
				truncated: false,
			});

		await previewBenchmarkImport("/selected/template");
		await importBenchmarkFolder("/selected/template", "coding");
		await importBenchmarkAsset("/selected/input.txt", "input.txt");
		await previewBenchmarkAsset("asset-1");

		expect(invoke).toHaveBeenNthCalledWith(1, "preview_benchmark_import", {
			request: { sourcePath: "/selected/template" },
		});
		expect(invoke).toHaveBeenNthCalledWith(2, "import_benchmark_folder", {
			request: { sourcePath: "/selected/template", tagId: "coding" },
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "import_benchmark_asset", {
			request: { sourcePath: "/selected/input.txt", path: "input.txt" },
		});
		expect(invoke).toHaveBeenNthCalledWith(4, "preview_benchmark_asset", {
			request: { assetId: "asset-1" },
		});
	});
});
