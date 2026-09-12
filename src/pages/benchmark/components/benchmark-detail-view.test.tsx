import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
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

const detail = (versionNumber = 1) => ({
	summary: {
		id: "benchmark-1",
		name: document.name,
		description: document.description,
		tagId: "coding",
		author: "myself" as const,
		source: null,
		archived: false,
		versionId: `version-${versionNumber}`,
		versionNumber,
		caseCount: 1,
		createdAtMs: 1,
	},
	versionId: versionNumber === 1 ? "version-1" : `version-${versionNumber}`,
	versionNumber,
	document,
});

beforeEach(async () => {
	invoke.mockReset();
	await i18n.changeLanguage("en-US");
});

it("creates a linked draft when editing a personal benchmark", async () => {
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark") return detail();
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

it("archives a personal catalog definition after confirmation", async () => {
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark") return detail();
		if (command === "archive_benchmark") {
			return {
				...detail(),
				summary: { ...detail().summary, archived: true },
			};
		}
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter>
				<BenchmarkDetailView benchmarkId="benchmark-1" />
			</MemoryRouter>
		</QueryClientProvider>,
	);

	await user.click(await screen.findByRole("button", { name: "Archive" }));
	const dialog = await screen.findByRole("alertdialog", {
		name: "Archive Benchmark?",
	});
	await user.click(
		within(dialog).getByRole("button", { name: "Archive Benchmark" }),
	);

	await waitFor(() => {
		expect(invoke).toHaveBeenCalledWith("archive_benchmark", {
			request: { benchmarkId: "benchmark-1" },
		});
	});
});

it("offers an explicit update when a workspace mount is behind the latest version", async () => {
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark") {
			return {
				...detail(2),
				versionId: "version-1",
				versionNumber: 1,
			};
		}
		if (command === "update_benchmark_mount") {
			return {
				id: "mount-1",
				workspaceId: "workspace-1",
				benchmarkId: "benchmark-1",
				versionId: "version-2",
				createdAtMs: 1,
			};
		}
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter>
				<BenchmarkDetailView
					benchmarkId="benchmark-1"
					mount={{
						id: "mount-1",
						workspaceId: "workspace-1",
						benchmarkId: "benchmark-1",
						versionId: "version-1",
						createdAtMs: 1,
					}}
				/>
			</MemoryRouter>
		</QueryClientProvider>,
	);

	await user.click(
		await screen.findByRole("button", { name: "Update to version 2" }),
	);
	const dialog = await screen.findByRole("alertdialog", {
		name: "Update mounted version?",
	});
	await user.click(
		within(dialog).getByRole("button", { name: "Update mount" }),
	);

	await waitFor(() => {
		expect(invoke).toHaveBeenCalledWith("update_benchmark_mount", {
			request: {
				workspaceId: "workspace-1",
				mountId: "mount-1",
				versionId: "version-2",
			},
		});
	});
});
