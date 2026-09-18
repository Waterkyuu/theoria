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

	// Each source keeps its own usage while unsupported or incomplete sources stay visually quiet.
	it("shows context progress only for supported agents with complete usage", async () => {
		apiMocks.checkAgentActivities.mockResolvedValueOnce({
			activities: [
				{
					id: "codex-context",
					title: "Codex context",
					agent: "codex",
					status: "running",
					updatedAtMs: 42,
					contextUsage: { usedTokens: 25_000, windowTokens: 100_000 },
				},
				{
					id: "claude-context",
					title: "Claude context",
					agent: "claude",
					status: "waiting",
					updatedAtMs: 42,
					contextUsage: { usedTokens: 90_000, windowTokens: 200_000 },
				},
				{
					id: "opencode-context",
					title: "OpenCode context",
					agent: "opencode",
					status: "finish",
					updatedAtMs: 42,
					contextUsage: { usedTokens: 70_000, windowTokens: 200_000 },
				},
				{
					id: "workbuddy-context",
					title: "WorkBuddy context",
					agent: "workbuddy",
					status: "error",
					updatedAtMs: 42,
					contextUsage: { usedTokens: 80_000, windowTokens: 200_000 },
				},
				{
					id: "codex-unavailable",
					title: "Unknown context",
					agent: "codex",
					status: "running",
					updatedAtMs: 42,
					contextUsage: null,
				},
			],
		});
		render(<RunBoardPage />);

		const cards = await screen.findAllByRole("article");
		const card = (title: string) =>
			cards.find((item) =>
				within(item).queryByRole("heading", { name: title }),
			);
		for (const [title, percentage] of [
			["Codex context", 25],
			["Claude context", 45],
			["OpenCode context", 35],
		] as const) {
			const article = card(title);
			expect(article).toBeDefined();
			expect(
				within(article as HTMLElement).getByRole("progressbar", {
					name: "上下文占用",
				}),
			).toHaveAttribute("aria-valuenow", String(percentage));
			expect(
				within(article as HTMLElement).getByText(`${percentage}%`),
			).toBeInTheDocument();
		}
		expect(
			within(card("WorkBuddy context") as HTMLElement).queryByRole(
				"progressbar",
			),
		).not.toBeInTheDocument();
		expect(
			within(card("Unknown context") as HTMLElement).queryByRole("progressbar"),
		).not.toBeInTheDocument();
	});

	it("uses blue below 80% context occupancy and orange from 80%", async () => {
		apiMocks.checkAgentActivities.mockResolvedValueOnce({
			activities: [
				{
					id: "context-below-threshold",
					title: "Below threshold",
					agent: "claude",
					status: "waiting",
					updatedAtMs: 42,
					contextUsage: { usedTokens: 79_000, windowTokens: 100_000 },
				},
				{
					id: "context-at-threshold",
					title: "At threshold",
					agent: "opencode",
					status: "finish",
					updatedAtMs: 42,
					contextUsage: { usedTokens: 80_000, windowTokens: 100_000 },
				},
			],
		});
		render(<RunBoardPage />);

		const cards = await screen.findAllByRole("article");
		const fill = (title: string) =>
			cards
				.find((card) => within(card).queryByRole("heading", { name: title }))
				?.querySelector('[data-slot="progress-bar-fill"]');
		expect(fill("Below threshold")).toHaveClass("bg-blue-600");
		expect(fill("At threshold")).toHaveClass("bg-orange-500");
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

	// Neighboring panels should take their new slots before the pointer is released.
	it("moves occupied panels aside while dragging the whole status panel", async () => {
		render(<RunBoardPage />);
		await screen.findAllByRole("article");
		const board = screen.getByTestId("run-board");
		const names = () =>
			within(board)
				.getAllByRole("heading", { level: 2 })
				.map((heading) => heading.textContent);
		expect(names()).toEqual(["运行中1", "等待用户1", "已完成1", "异常1"]);

		const panels = within(board).getAllByRole("region");
		for (const [index, panel] of panels.entries()) {
			vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
				left: index * 100,
				right: index * 100 + 100,
				top: 0,
				bottom: 100,
			} as DOMRect);
		}
		const [source, waiting, finished] = panels;
		fireEvent.pointerDown(source, {
			button: 0,
			pointerId: 1,
			pointerType: "mouse",
			clientX: 50,
			clientY: 50,
		});
		fireEvent.pointerMove(source, {
			pointerId: 1,
			pointerType: "mouse",
			clientX: 250,
			clientY: 50,
		});
		expect(waiting).toHaveStyle({ transform: "translate3d(-100px, 0px, 0px)" });
		expect(finished).toHaveStyle({
			transform: "translate3d(-100px, 0px, 0px)",
		});
		expect(source).toHaveStyle({ transform: "translate3d(200px, 0px, 0px)" });
		fireEvent.pointerUp(source, {
			pointerId: 1,
			pointerType: "mouse",
			clientX: 250,
			clientY: 50,
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
