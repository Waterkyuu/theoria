import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { BenchmarkImportModal } from "./benchmark-import-modal";

const { invoke, open } = vi.hoisted(() => ({
	invoke: vi.fn(),
	open: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

beforeEach(async () => {
	await i18n.changeLanguage("en-US");
	invoke.mockReset();
	open.mockReset();
	open.mockResolvedValue("/selected/template");
	invoke.mockImplementation(async (command: string) => {
		if (command === "preview_benchmark_import")
			return {
				name: "Imported suite",
				description: "Portable fixture",
				source: "fixture-suite",
				cases: [
					{
						name: "One",
						timeoutMinutes: 5,
						inputFileCount: 1,
						checkKinds: ["file_json"],
					},
				],
				fileCount: 1,
				issues: [{ field: "cases.0.inputFiles.0", code: "missing_file" }],
			};
		if (command === "import_benchmark_folder")
			return {
				id: "draft-1",
				benchmarkId: null,
				revision: 1,
				document: {
					schemaVersion: 1,
					name: "Imported suite",
					description: "Portable fixture",
					tagId: "coding",
					source: "fixture-suite",
					cases: [],
				},
				updatedAtMs: 1,
			};
		return [];
	});
});

it("previews a selected folder and allows repairable issues into a tagged draft", async () => {
	const user = userEvent.setup();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter>
				<BenchmarkImportModal
					isOpen
					onClose={vi.fn()}
					tags={[
						{ id: "coding", name: "Coding", icon: "Code", isSystem: false },
					]}
				/>
			</MemoryRouter>
		</QueryClientProvider>,
	);

	await user.click(screen.getByRole("button", { name: "Choose folder" }));
	expect(open).toHaveBeenCalledWith({
		directory: true,
		multiple: false,
		title: "Choose a Benchmark template folder",
	});
	expect(await screen.findByText("Imported suite")).toBeInTheDocument();
	expect(screen.getByText(/cases\.0\.inputFiles\.0/)).toBeInTheDocument();

	await user.click(screen.getByRole("button", { name: /Choose a tag/ }));
	await user.click(await screen.findByRole("option", { name: "Coding" }));
	await user.click(screen.getByRole("button", { name: "Import draft" }));

	await waitFor(() => {
		expect(invoke).toHaveBeenCalledWith("import_benchmark_folder", {
			request: { sourcePath: "/selected/template", tagId: "coding" },
		});
	});
});
