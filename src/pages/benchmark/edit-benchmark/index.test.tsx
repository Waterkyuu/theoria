import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import BenchmarkEditorPage from ".";
const { invoke, open } = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

// JSDOM has no text layout; supply the geometry that CodeMirror measures.
beforeAll(() => {
	Object.defineProperty(Range.prototype, "getClientRects", {
		configurable: true,
		value: () => [],
	});
	Object.defineProperty(Range.prototype, "getBoundingClientRect", {
		configurable: true,
		value: () => new DOMRect(),
	});
});

afterAll(() => {
	Reflect.deleteProperty(Range.prototype, "getClientRects");
	Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});

it("retains the saved revision after publication fails so retry uses the latest draft", async () => {
	await i18n.changeLanguage("en-US");
	const document = {
		schemaVersion: 1,
		name: "Answer suite",
		description: "One answer",
		tagId: "code",
		source: null,
		cases: [
			{
				name: "Count",
				prompt: "Return 42",
				timeoutMinutes: 1,
				inputFiles: [],
				checks: [{ kind: "answer", expected: "42" }],
			},
		],
	};
	let revision = 1;
	invoke.mockImplementation(async (command: string) => {
		if (command === "list_benchmark_tags")
			return [{ id: "code", name: "Coding", icon: "Code" }];
		if (command === "save_benchmark_draft") revision++;
		if (command === "publish_benchmark")
			throw {
				code: "BENCHMARK_VALIDATION_FAILED",
				message: "invalid benchmark",
				details: {
					kind: "benchmarkValidation",
					issues: [{ field: "cases.0.prompt", code: "invalid_prompt" }],
				},
			};
		return {
			id: "draft",
			benchmarkId: null,
			document,
			revision,
			updatedAtMs: 1,
		};
	});
	const user = userEvent.setup();
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<MemoryRouter initialEntries={["/benchmark/drafts/draft"]}>
				<Routes>
					<Route
						path="/benchmark/drafts/:draftId"
						element={<BenchmarkEditorPage />}
					/>
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
	await screen.findByDisplayValue("Answer suite");
	await user.click(screen.getByRole("button", { name: "Publish" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith("publish_benchmark", {
			request: { draftId: "draft", expectedRevision: 2 },
		}),
	);
	expect(screen.getByText(/cases\.0\.prompt/)).toBeInTheDocument();
	expect(
		screen.getByText(/Enter complete task requirements/),
	).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Publish" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith("save_benchmark_draft", {
			request: { document, draftId: "draft", expectedRevision: 2 },
		}),
	);
	expect(screen.getByDisplayValue("Return 42")).toBeInTheDocument();
});

it("uploads, previews, and edits files while preserving structured checks", async () => {
	await i18n.changeLanguage("en-US");
	invoke.mockReset();
	open.mockReset();
	open.mockResolvedValue("/selected/input.txt");
	const document = {
		schemaVersion: 1,
		name: "File suite",
		description: "One file check",
		tagId: "code",
		source: null,
		cases: [
			{
				name: "Report",
				prompt: "Create report.json",
				timeoutMinutes: 5,
				inputFiles: [],
				checks: [
					{
						kind: "file_json" as const,
						path: "report.json",
						expected: '{"ok":true}',
					},
				],
			},
		],
	};
	invoke.mockImplementation(async (command: string, args?: unknown) => {
		if (command === "list_benchmark_tags")
			return [{ id: "code", name: "Coding", icon: "Code" }];
		if (command === "get_benchmark_draft")
			return {
				id: "draft-files",
				benchmarkId: null,
				revision: 1,
				document,
				updatedAtMs: 1,
			};
		if (command === "import_benchmark_asset")
			return { path: "input.txt", assetId: "asset-input" };
		if (command === "preview_benchmark_asset")
			return {
				assetId: "asset-input",
				sizeBytes: 7,
				text: "fixture",
				truncated: false,
			};
		if (command === "save_benchmark_text_asset")
			return { path: "input.txt", assetId: "asset-edited" };
		if (command === "save_benchmark_draft") {
			const request = (args as { request: { document: typeof document } })
				.request;
			return {
				id: "draft-files",
				benchmarkId: null,
				revision: 2,
				document: request.document,
				updatedAtMs: 2,
			};
		}
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter initialEntries={["/benchmark/drafts/draft-files"]}>
				<Routes>
					<Route
						path="/benchmark/drafts/:draftId"
						element={<BenchmarkEditorPage />}
					/>
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);

	await screen.findByDisplayValue('{"ok":true}');
	expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
	expect(screen.queryByText("common.delete")).not.toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Add input file" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith("import_benchmark_asset", {
			request: { sourcePath: "/selected/input.txt", path: "input.txt" },
		}),
	);
	await user.click(screen.getByRole("button", { name: "Preview" }));
	const contents = await screen.findByRole("textbox", {
		name: "input.txt",
	});
	await user.clear(contents);
	await user.type(contents, "edited fixture");
	await user.click(screen.getByRole("button", { name: "Save file" }));
	await user.click(screen.getByRole("button", { name: "Save draft" }));

	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith(
			"save_benchmark_draft",
			expect.objectContaining({
				request: expect.objectContaining({
					document: expect.objectContaining({
						cases: [
							expect.objectContaining({
								inputFiles: [{ path: "input.txt", assetId: "asset-edited" }],
								checks: document.cases[0].checks,
							}),
						],
					}),
				}),
			}),
		),
	);
});
