import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { BenchmarkDetailView } from "./benchmark-detail-view";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const document = {
	schemaVersion: 1,
	name: "Personal suite",
	description: "Owned benchmark",
	tagId: "coding",
	source: null,
	cases: [
		{
			name: "Count",
			prompt: "Return 42",
			timeoutMinutes: 1,
			inputFiles: [],
			checks: [{ kind: "answer" as const, expected: "42" }],
		},
	],
};

it("creates a linked draft when editing a personal benchmark", async () => {
	await i18n.changeLanguage("en-US");
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark") {
			return {
				summary: {
					id: "benchmark-1",
					name: document.name,
					description: document.description,
					tagId: "coding",
					author: "myself",
					source: null,
					archived: false,
					versionId: "version-1",
					versionNumber: 1,
					caseCount: 1,
					createdAtMs: 1,
				},
				versionId: "version-1",
				versionNumber: 1,
				document,
			};
		}
		if (command === "save_benchmark_draft") {
			return {
				id: "draft-1",
				benchmarkId: "benchmark-1",
				revision: 1,
				document,
				updatedAtMs: 2,
			};
		}
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter initialEntries={["/benchmark/benchmark-1"]}>
				<Routes>
					<Route
						path="/benchmark/:benchmarkId"
						element={<BenchmarkDetailView benchmarkId="benchmark-1" />}
					/>
					<Route
						path="/benchmark/drafts/:draftId"
						element={<p>Benchmark editor</p>}
					/>
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);

	await user.click(await screen.findByRole("button", { name: "Edit" }));
	await waitFor(() => {
		expect(invoke).toHaveBeenCalledWith("save_benchmark_draft", {
			request: {
				benchmarkId: "benchmark-1",
				document,
				draftId: null,
				expectedRevision: null,
			},
		});
	});
	expect(await screen.findByText("Benchmark editor")).toBeInTheDocument();
});
