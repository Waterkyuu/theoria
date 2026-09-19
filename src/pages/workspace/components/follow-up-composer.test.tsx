import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { TaskAgent } from "@/types/task";
import { FollowUpComposer } from "./follow-up-composer";

const AGENTS: TaskAgent[] = [
	["codex", "gpt-5.6-sol"],
	["claude", "claude-opus-4-1"],
	["opencode", "gpt-5.6-sol"],
	["workbuddy", "gpt-5.6-sol"],
	["codex", "gpt-5.5"],
	["claude", "claude-sonnet-4-5"],
].map(([agentKind, modelSnapshot], slotIndex) => ({
	id: `task-agent-${slotIndex + 1}`,
	slotIndex,
	agentKind: agentKind as TaskAgent["agentKind"],
	modelSnapshot,
	modeSnapshot: null,
	status: "completed",
}));

/**
 * Renders the continuation composer with a full six-Agent Task.
 * @example renderFollowUpComposer();
 */
const renderFollowUpComposer = () => {
	const onSubmit = vi.fn().mockResolvedValue(undefined);
	render(
		<FollowUpComposer
			agents={AGENTS}
			isSubmitting={false}
			onSubmit={onSubmit}
		/>,
	);
	return onSubmit;
};

it("collapses Task Agents into three icons and expands their details", async () => {
	const user = userEvent.setup();
	renderFollowUpComposer();
	const trigger = screen.getByRole("button", {
		name: "全部 Agent，任务中共 6 个 Agent",
	});

	expect(within(trigger).getAllByRole("img", { hidden: true })).toHaveLength(3);
	expect(within(trigger).getByText("+3")).toBeVisible();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();

	await user.click(trigger);

	expect(
		screen.getByRole("menu", { name: "全部 Agent，任务中共 6 个 Agent" }),
	).toBeVisible();
	expect(
		screen.getByRole("menuitemradio", { name: "Codex gpt-5.6-sol" }),
	).toBeVisible();
	expect(
		screen.getByRole("menuitemradio", {
			name: "Claude Code claude-sonnet-4-5",
		}),
	).toBeVisible();
});

it("submits a follow-up only to the Agent selected from the expanded list", async () => {
	const user = userEvent.setup();
	const onSubmit = renderFollowUpComposer();
	await user.click(
		screen.getByRole("button", {
			name: "全部 Agent，任务中共 6 个 Agent",
		}),
	);
	await user.click(
		screen.getByRole("menuitemradio", { name: "OpenCode gpt-5.6-sol" }),
	);
	await user.type(
		screen.getByRole("textbox", { name: "继续任务" }),
		"继续检查",
	);
	await user.click(screen.getByRole("button", { name: "发送继续任务" }));

	expect(onSubmit).toHaveBeenCalledWith("继续检查", ["task-agent-3"]);
});
