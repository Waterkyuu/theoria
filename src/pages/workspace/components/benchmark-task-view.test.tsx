import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { BenchmarkTaskDetail } from "@/types/benchmark";
import { BenchmarkTaskView } from "./benchmark-task-view";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const task = (
	status: BenchmarkTaskDetail["task"]["status"],
): BenchmarkTaskDetail =>
	({
		task: {
			id: "task-1",
			workspaceId: "workspace-1",
			title: "Answer suite",
			kind: "benchmark",
			status,
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
		resultCompleteness: status === "completed" ? "complete" : "incomplete",
		completionReason: null,
		cancelRequested: false,
		fileAccess: "allow_edits",
		commandExecution: "allow",
		progress: {
			total: 1,
			finished: status === "completed" ? 1 : 0,
			passed: status === "completed" ? 1 : 0,
			failed: 0,
			errors: 0,
		},
		agents: [
			{
				id: "task-agent-1",
				agentKind: "codex",
				position: 0,
				passed: status === "completed" ? 1 : 0,
				failed: 0,
				total: 1,
				passRate: status === "completed" ? 1 : null,
				totalDurationMs: 10,
				durationCoverage: status === "completed" ? 1 : 0,
				totalTokens: 4,
				tokenCoverage: status === "completed" ? 1 : 0,
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
	}) satisfies BenchmarkTaskDetail;

const renderTask = () =>
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<MemoryRouter initialEntries={["/workspaces/workspace-1/task/task-1"]}>
				<Routes>
					<Route
						path="/workspaces/:workspaceId/task/:taskId"
						element={<BenchmarkTaskView taskId="task-1" />}
					/>
					<Route path="/task/:taskId" element={<p>New run</p>} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);

beforeEach(async () => {
	invoke.mockReset();
	await i18n.changeLanguage("en-US");
});

it("cancels an active Benchmark Task through the unified command", async () => {
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark_task") return task("running");
		if (command === "cancel_task") return null;
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	renderTask();

	await user.click(await screen.findByRole("button", { name: "Cancel run" }));
	expect(screen.getByText("No data · No data · No data")).toBeInTheDocument();

	await waitFor(() => {
		expect(invoke).toHaveBeenCalledWith("cancel_task", {
			request: { taskId: "task-1" },
		});
	});
});

it("reruns a terminal task and confirms restoration of a missing mount", async () => {
	let rerunCalls = 0;
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark_task") return task("completed");
		if (command === "rerun_benchmark_task") {
			rerunCalls += 1;
			if (rerunCalls === 1) {
				throw {
					code: "BENCHMARK_MOUNT_REQUIRED",
					message: "Mount required",
				};
			}
			return {
				...task("completed"),
				task: { ...task("completed").task, id: "task-2" },
			};
		}
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	renderTask();

	await user.click(await screen.findByRole("button", { name: "Rerun" }));
	await user.click(screen.getByRole("button", { name: "Start rerun" }));
	await user.click(
		await screen.findByRole("button", { name: "Restore and rerun" }),
	);

	await waitFor(() => {
		const calls = invoke.mock.calls.filter(
			([command]) => command === "rerun_benchmark_task",
		);
		expect(calls).toHaveLength(2);
		expect(calls[0]?.[1].request).toEqual(
			expect.objectContaining({
				sourceTaskId: "task-1",
				agentKinds: ["codex"],
				restoreMount: false,
			}),
		);
		expect(calls[1]?.[1].request).toEqual(
			expect.objectContaining({
				restoreMount: true,
				idempotencyKey: calls[0]?.[1].request.idempotencyKey,
			}),
		);
	});
});

it("shows the selected case requirements and every public validation check", async () => {
	const completed = task("completed");
	completed.executions = [
		{
			id: "execution-1",
			taskCaseId: "task-case-1",
			taskAgentId: "task-agent-1",
			phase: "finished",
			result: "passed",
			terminationReason: null,
			responseText: "42",
			metrics: {
				totalDurationMs: 10,
				timeToFirstTokenMs: null,
				tokenUsage: null,
				toolCallCount: 0,
				toolCalls: [],
			},
			startedAtMs: 10,
			finishedAtMs: 20,
			verdict: "passed",
			report: {
				passed: true,
				checks: [
					{
						kind: "answer",
						path: null,
						passed: true,
						message: "Exact answer matched",
					},
				],
			},
		},
	];
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark_task") return completed;
		if (command === "list_benchmark_execution_artifacts") {
			return [{ path: "result.txt", sizeBytes: 13, change: "added" }];
		}
		if (command === "preview_benchmark_execution_artifact") {
			return {
				path: "result.txt",
				sizeBytes: 13,
				text: "artifact body",
				truncated: false,
			};
		}
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	renderTask();

	await user.click(await screen.findByRole("button", { name: "Passed" }));

	expect(screen.getByText("Return 42")).toBeInTheDocument();
	expect(screen.getByText("42")).toBeInTheDocument();
	expect(screen.getByText("Exact answer matched")).toBeInTheDocument();
	expect(screen.getByText(/Execution duration.*10 ms/)).toBeInTheDocument();
	await user.click(await screen.findByRole("button", { name: /result.txt/ }));
	expect(await screen.findByText("artifact body")).toBeInTheDocument();
});

it("filters matrix rows without changing the full-task aggregate", async () => {
	const completed = task("completed");
	completed.cases.push({
		id: "task-case-2",
		caseId: "case-2",
		position: 1,
		name: "Write file",
		prompt: "Create output.txt",
		timeoutMinutes: 1,
	});
	completed.progress = {
		total: 2,
		finished: 2,
		passed: 1,
		failed: 1,
		errors: 0,
	};
	completed.executions = [
		{
			id: "execution-1",
			taskCaseId: "task-case-1",
			taskAgentId: "task-agent-1",
			phase: "finished",
			result: "passed",
			terminationReason: null,
			responseText: "42",
			metrics: null,
			startedAtMs: 1,
			finishedAtMs: 2,
			verdict: "passed",
			report: null,
		},
		{
			id: "execution-2",
			taskCaseId: "task-case-2",
			taskAgentId: "task-agent-1",
			phase: "finished",
			result: "failed",
			terminationReason: null,
			responseText: "done",
			metrics: null,
			startedAtMs: 2,
			finishedAtMs: 3,
			verdict: "failed",
			report: null,
		},
	];
	invoke.mockImplementation(async (command: string) => {
		if (command === "get_benchmark_task") return completed;
		throw new Error(`Unexpected command: ${command}`);
	});
	const user = userEvent.setup();
	renderTask();

	expect(await screen.findByText("2/2")).toBeInTheDocument();
	await user.type(
		screen.getByRole("searchbox", { name: "Search cases" }),
		"write",
	);

	expect(screen.queryByRole("row", { name: /Count/ })).not.toBeInTheDocument();
	expect(screen.getByRole("row", { name: /Write file/ })).toBeInTheDocument();
	expect(screen.getByText("2/2")).toBeInTheDocument();
});
