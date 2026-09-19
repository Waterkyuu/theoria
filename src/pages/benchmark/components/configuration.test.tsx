import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { BenchmarkMount, BenchmarkTaskDetail } from "@/types/benchmark";
import { BenchmarkConfiguration } from "./configuration";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const mount: BenchmarkMount = {
	id: "mount-1",
	workspaceId: "workspace-1",
	benchmarkId: "benchmark-1",
	versionId: "version-1",
	pinnedAtMs: null,
	createdAtMs: 1,
};

const task: BenchmarkTaskDetail = {
	task: {
		id: "task-1",
		workspaceId: "workspace-1",
		title: "Answer suite",
		kind: "benchmark",
		status: "preparing",
		configurationLockedAtMs: 1,
		pinnedAtMs: null,
		createdAtMs: 1,
		updatedAtMs: 1,
	},
	benchmarkId: "benchmark-1",
	benchmarkName: "Answer suite",
	versionId: "version-1",
	versionNumber: 1,
	rerunOfTaskId: null,
	resultCompleteness: "incomplete",
	completionReason: null,
	cancelRequested: false,
	fileAccess: "allow_edits",
	commandExecution: "allow",
	progress: { total: 1, finished: 0, passed: 0, failed: 0, errors: 0 },
	agents: [
		{
			id: "task-agent-1",
			agentKind: "codex",
			position: 0,
			passed: 0,
			failed: 0,
			total: 1,
			passRate: null,
			totalDurationMs: 0,
			durationCoverage: 0,
			totalTokens: 0,
			tokenCoverage: 0,
			toolCallCount: 0,
		},
	],
	cases: [
		{
			id: "task-case-1",
			caseId: "case-1",
			position: 0,
			name: "Count",
			prompt: "Return 42",
			timeoutMinutes: 1,
		},
	],
	executions: [],
};

it("starts a checked benchmark once and opens its task route", async () => {
	await i18n.changeLanguage("en-US");
	invoke.mockImplementation(async (command: string) => {
		if (command === "preview_benchmark_task") {
			return {
				versionId: "version-1",
				versionNumber: 1,
				name: "Answer suite",
				cases: [{ position: 0, name: "Count", timeoutMinutes: 1 }],
				agentKinds: ["codex"],
				executionCount: 1,
				fileAccess: "allow_edits",
				commandExecution: "allow",
				issues: [],
			};
		}
		if (command === "start_benchmark_task") return task;
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<MemoryRouter initialEntries={["/workspaces/workspace-1"]}>
				<Routes>
					<Route
						path="/workspaces/:workspaceId"
						element={<BenchmarkConfiguration mount={mount} />}
					/>
					<Route
						path="/workspaces/:workspaceId/task/:taskId"
						element={<p>Benchmark result</p>}
					/>
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);

	await user.click(
		screen.getByRole("button", { name: "Configure evaluation" }),
	);
	await user.click(screen.getByText("Codex"));
	await user.click(screen.getByRole("button", { name: "Check prerequisites" }));
	await screen.findByText("No missing prerequisites found.");
	await user.click(screen.getByRole("button", { name: "Start" }));

	await waitFor(() => {
		expect(invoke).toHaveBeenCalledWith("start_benchmark_task", {
			request: expect.objectContaining({
				workspaceId: "workspace-1",
				mountId: "mount-1",
				expectedVersionId: "version-1",
				agentKinds: ["codex"],
				fileAccess: "allow_edits",
				commandExecution: "allow",
				idempotencyKey: expect.any(String),
			}),
		});
	});
	expect(await screen.findByText("Benchmark result")).toBeInTheDocument();
});
