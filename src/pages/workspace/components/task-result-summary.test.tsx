import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskDetail } from "@/types/task";
import { TaskResultSummary } from "./task-result-summary";

const COMPLETE_TASK: TaskDetail = {
	task: {
		id: "task-42",
		workspaceId: null,
		title: "Inspect repository",
		prompt: "Inspect repository",
		status: "completed",
		configurationLockedAtMs: 1,
		pinnedAtMs: null,
		createdAtMs: 1,
		updatedAtMs: 2,
	},
	agents: [
		{
			id: "task-agent-1",
			slotIndex: 0,
			agentKind: "codex",
			modelSnapshot: "gpt-runtime",
			modeSnapshot: "xhigh",
			status: "completed",
		},
		{
			id: "task-agent-2",
			slotIndex: 1,
			agentKind: "workbuddy",
			modelSnapshot: null,
			modeSnapshot: "enabled",
			status: "completed",
		},
	],
	fileAccess: "allow_edits",
	commandExecution: "allow",
	skills: [],
	results: [
		{
			taskAgentId: "task-agent-1",
			finalStatus: "completed",
			responseText: "Repository inspection complete.",
			metrics: {
				totalDurationMs: 1250,
				toolCallCount: 2,
				toolCalls: [
					{ sequence: 1, name: "workspace.read", durationMs: 250 },
					{ sequence: 2, name: "workspace.search", durationMs: 1200 },
				],
			},
		},
		{
			taskAgentId: "task-agent-2",
			finalStatus: "completed",
			responseText: "Repository inspection complete.",
			metrics: {
				totalDurationMs: 2000,
				toolCallCount: 3,
				toolCalls: [
					{ sequence: 1, name: "WebSearch", durationMs: 500 },
					{ sequence: 2, name: "WebFetch", durationMs: 600 },
					{ sequence: 3, name: "WebFetch", durationMs: 700 },
				],
			},
		},
	],
	turns: [],
};

describe("TaskResultSummary", () => {
	it("shows each Agent's concrete model in its column header", () => {
		render(<TaskResultSummary onClose={vi.fn()} task={COMPLETE_TASK} />);

		const summary = screen.getByRole("complementary", { name: "结果汇总" });
		const agentHeader = within(summary).getAllByRole("columnheader")[1];
		expect(agentHeader).toHaveTextContent("Codex");
		expect(agentHeader).toHaveTextContent("gpt-runtime");
		const unknownModelHeader = within(summary).getAllByRole("columnheader")[2];
		expect(unknownModelHeader).toHaveTextContent("WorkBuddy");
		expect(unknownModelHeader).toHaveTextContent("未知模型");
		expect(unknownModelHeader).not.toHaveTextContent("不可用");
	});

	it("reveals individual tool durations only while the tool row is expanded", async () => {
		const user = userEvent.setup();
		render(<TaskResultSummary onClose={vi.fn()} task={COMPLETE_TASK} />);

		const summary = screen.getByRole("complementary", { name: "结果汇总" });
		expect(
			within(summary).queryByText("workspace.read"),
		).not.toBeInTheDocument();
		expect(within(summary).queryByText("250 ms")).not.toBeInTheDocument();

		await user.click(
			within(summary).getByRole("button", { name: /展开工具调用明细/ }),
		);

		expect(within(summary).getByText("workspace.read")).toBeInTheDocument();
		expect(within(summary).getByText("250 ms")).toBeInTheDocument();
		expect(within(summary).getByText("workspace.search")).toBeInTheDocument();
		expect(within(summary).getByText("1.20 s")).toBeInTheDocument();
		const thirdCallLabel = within(summary).getByRole("rowheader", {
			name: "调用 3",
		});
		expect(thirdCallLabel.closest("tr")).toHaveTextContent("无");

		await user.click(
			within(summary).getByRole("button", { name: /收起工具调用明细/ }),
		);

		expect(
			within(summary).queryByText("workspace.read"),
		).not.toBeInTheDocument();
		expect(within(summary).queryByText("250 ms")).not.toBeInTheDocument();
	});
});
