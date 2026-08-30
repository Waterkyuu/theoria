import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskAgent, TaskAgentResult } from "@/types/task";
import { AgentPanel } from "./agent-panel";

const RUNNING_AGENT: TaskAgent = {
	id: "agent-run-1",
	slotIndex: 0,
	agentKind: "codex",
	modelSnapshot: "gpt-5.6-sol",
	modeSnapshot: "high",
	status: "running",
};

const COMPLETE_RESULT: TaskAgentResult = {
	taskAgentId: "agent-run-1",
	finalStatus: "completed",
	responseText: "The workspace review is complete.",
	metrics: {
		totalDurationMs: 134_000,
		tokenUsage: { totalTokens: 18_400 },
		toolCalls: [{ name: "workspace.read", durationMs: 420 }],
	},
};

describe("AgentPanel", () => {
	it("renders the Figma Running state from live Task data and stops one Agent", async () => {
		const user = userEvent.setup();
		const stopAgent = vi.fn();
		render(
			<AgentPanel
				agent={RUNNING_AGENT}
				onStop={stopAgent}
				prompt="Review the workspace task and report the result."
				stopPending={false}
			/>,
		);

		expect(screen.getByText("gpt-5.6-sol high")).toBeInTheDocument();
		expect(
			screen.getByText("Review the workspace task and report the result."),
		).toBeInTheDocument();
		expect(screen.getByText("运行中")).toBeInTheDocument();
		expect(screen.getByText("Agent 正在隔离工作区中执行")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "停止 Codex" }));
		expect(stopAgent).toHaveBeenCalledWith("agent-run-1");
	});

	it("renders the Figma Complete state from persisted response metrics", () => {
		render(
			<AgentPanel
				agent={{ ...RUNNING_AGENT, status: "completed" }}
				onStop={vi.fn()}
				prompt="Review the workspace task and report the result."
				result={COMPLETE_RESULT}
				stopPending={false}
			/>,
		);

		expect(screen.getByText("已完成")).toBeInTheDocument();
		expect(
			screen.getByText("The workspace review is complete."),
		).toBeInTheDocument();
		expect(screen.getByText("workspace.read")).toBeInTheDocument();
		expect(screen.getByText("2m 14s · 18.4k tokens")).toBeInTheDocument();
		expect(screen.getByText("打开记录")).toBeInTheDocument();
	});

	it("keeps the existing Stop control available while an Agent is waiting", async () => {
		const user = userEvent.setup();
		const stopAgent = vi.fn();
		render(
			<AgentPanel
				agent={{ ...RUNNING_AGENT, status: "waiting" }}
				onStop={stopAgent}
				prompt="Choose a test suite."
				stopPending={false}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "停止 Codex" }));
		expect(stopAgent).toHaveBeenCalledWith("agent-run-1");
	});

	it("maps failed and stopped executions to the Figma Error treatment", () => {
		render(
			<AgentPanel
				agent={{ ...RUNNING_AGENT, status: "failed" }}
				onStop={vi.fn()}
				prompt="Review the workspace task."
				result={{
					...COMPLETE_RESULT,
					finalStatus: "failed",
					responseText: "Execution failed.",
				}}
				stopPending={false}
			/>,
		);

		expect(screen.getByText("失败")).toBeInTheDocument();
		expect(screen.getByText("执行失败，请检查日志")).toBeInTheDocument();
	});
});
