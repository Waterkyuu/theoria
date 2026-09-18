import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import RunBoardPage from ".";

const apiMocks = vi.hoisted(() => ({
	checkAgentActivities: vi.fn(),
	onAgentActivitiesChanged: vi.fn(),
}));

vi.mock("@/api/agent", () => apiMocks);

const INITIAL_ACTIVITIES = {
	activities: [
		{
			id: "codex-running",
			title: "优化看板标题显示",
			agent: "codex",
			status: "running",
			updatedAtMs: Date.parse("2026-08-17T01:30:00Z"),
		},
		{
			id: "claude-waiting",
			title: null,
			agent: "claude",
			status: "waiting",
			updatedAtMs: Date.parse("2026-08-17T01:20:00Z"),
		},
		{
			id: "workbuddy-finish",
			title: null,
			agent: "workbuddy",
			status: "finish",
			updatedAtMs: Date.parse("2026-08-17T01:10:00Z"),
		},
		{
			id: "codex-error",
			title: null,
			agent: "codex",
			status: "error",
			updatedAtMs: Date.parse("2026-08-17T01:00:00Z"),
		},
	],
};

// Covers the user-visible run board workflow.
describe("RunBoardPage", () => {
	beforeEach(() => {
		apiMocks.checkAgentActivities.mockResolvedValue(INITIAL_ACTIVITIES);
		apiMocks.onAgentActivitiesChanged.mockResolvedValue(vi.fn());
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		Reflect.deleteProperty(document, "elementFromPoint");
	});

	// Verifies that only backend Agent activities are rendered instead of bundled demo records.
	it("renders the real activity snapshot and applies changed events", async () => {
		let activityListener:
			| ((response: typeof INITIAL_ACTIVITIES) => void)
			| undefined;
		apiMocks.onAgentActivitiesChanged.mockImplementation((listener) => {
			activityListener = listener;
			return Promise.resolve(vi.fn());
		});
		render(<RunBoardPage />);

		expect(await screen.findAllByRole("article")).toHaveLength(4);
		expect(screen.queryByText("仓库架构审计")).not.toBeInTheDocument();
		expect(apiMocks.checkAgentActivities).toHaveBeenCalledOnce();

		act(() => {
			activityListener?.({
				activities: [
					{
						id: "claude-completed",
						title: null,
						agent: "claude",
						status: "finish",
						updatedAtMs: Date.parse("2026-08-17T01:40:00Z"),
					},
				],
			});
		});

		expect(screen.getAllByRole("article")).toHaveLength(1);
		expect(screen.getByText("Claude Code")).toBeInTheDocument();
	});

	// Verifies that a resolved conversation title replaces the opaque activity identifier.
	it("uses the conversation title when the backend provides one", async () => {
		render(<RunBoardPage />);

		const card = (await screen.findAllByRole("article"))[0];

		expect(
			within(card).getByRole("heading", { name: "优化看板标题显示" }),
		).toBeInTheDocument();
		expect(within(card).queryByText("codex-running")).not.toBeInTheDocument();
	});

	// Opaque identifiers are implementation details and must never become card titles.
	it("uses an untitled label instead of exposing an activity identifier", async () => {
		apiMocks.checkAgentActivities.mockResolvedValueOnce({
			activities: [
				{
					id: "claude-private-session",
					title: null,
					agent: "claude",
					status: "running",
					updatedAtMs: Date.parse("2026-08-17T01:30:00Z"),
				},
			],
		});
		render(<RunBoardPage />);

		const card = await screen.findByRole("article");

		expect(within(card).getByText("未命名任务")).toBeInTheDocument();
		expect(
			within(card).queryByText("claude-private-session"),
		).not.toBeInTheDocument();
	});

	// The board column already names the lifecycle, so cards keep only its useful description.
	it("does not repeat the status name inside each card", async () => {
		render(<RunBoardPage />);

		const card = (await screen.findAllByRole("article"))[0];

		expect(within(card).queryByText("运行中")).not.toBeInTheDocument();
		expect(within(card).getByText("正在执行")).toBeInTheDocument();
	});

	it("uses the concise English label for successful runs", async () => {
		await i18n.changeLanguage("en-US");
		render(<RunBoardPage />);

		const cards = await screen.findAllByRole("article");
		const finishedCard = cards.find((card) =>
			within(card).queryByText("WorkBuddy"),
		);

		expect(finishedCard).toBeDefined();
		expect(
			within(finishedCard as HTMLElement).getByText("Successful"),
		).toBeInTheDocument();
	});

	it("shows status panels without search or layout controls", () => {
		render(<RunBoardPage />);

		expect(
			screen.queryByRole("searchbox", { name: "搜索 Agent 产品" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("group", { name: "切换看板布局" }),
		).not.toBeInTheDocument();
	});

	// Dragging a status panel changes its position without moving its activity cards to another status.
	it("shows visible counts and reorders status panels by dragging", async () => {
		render(<RunBoardPage />);
		await screen.findAllByRole("article");
		const board = screen.getByTestId("run-board");
		const names = () =>
			within(board)
				.getAllByRole("heading", { level: 2 })
				.map((heading) => heading.textContent);
		expect(names()).toEqual(["运行中1", "等待用户1", "已完成1", "异常1"]);

		const source = screen.getByRole("region", { name: "运行中1" });
		const target = screen.getByRole("region", { name: "已完成1" });
		Object.defineProperty(document, "elementFromPoint", {
			configurable: true,
			value: vi.fn().mockReturnValue(target),
		});
		fireEvent.pointerDown(source, {
			button: 0,
			pointerId: 1,
			pointerType: "mouse",
			clientX: 100,
			clientY: 100,
		});
		fireEvent.pointerMove(source, {
			pointerId: 1,
			pointerType: "mouse",
			clientX: 130,
			clientY: 140,
		});
		fireEvent.pointerUp(source, {
			pointerId: 1,
			pointerType: "mouse",
			clientX: 130,
			clientY: 140,
		});
		expect(names()).toEqual(["等待用户1", "已完成1", "运行中1", "异常1"]);
		expect(within(source).getByRole("article")).toHaveTextContent(
			"优化看板标题显示",
		);
	});

	it("moves the entire panel with the pointer before drop", async () => {
		render(<RunBoardPage />);
		await screen.findAllByRole("article");
		const panel = screen.getByRole("region", { name: "运行中1" });

		fireEvent.pointerDown(panel, {
			button: 0,
			pointerId: 1,
			pointerType: "mouse",
			clientX: 100,
			clientY: 100,
		});
		fireEvent.pointerMove(panel, {
			pointerId: 1,
			pointerType: "mouse",
			clientX: 130,
			clientY: 140,
		});

		expect(panel).toHaveStyle({ transform: "translate3d(30px, 40px, 0px)" });
	});

	it("moves a focused panel with arrow keys", async () => {
		const user = userEvent.setup();
		render(<RunBoardPage />);
		await screen.findAllByRole("article");
		const board = screen.getByTestId("run-board");
		const grip = screen.getByRole("button", { name: "拖动运行中面板" });

		grip.focus();
		await user.keyboard("{ArrowRight}");

		expect(
			within(board)
				.getAllByRole("heading", { level: 2 })
				.map((heading) => heading.textContent),
		).toEqual(["等待用户1", "运行中1", "已完成1", "异常1"]);
	});
});
