import { Toast } from "@heroui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacePage from ".";

const apiMocks = vi.hoisted(() => ({
	checkAgentProcesses: vi.fn(),
	checkClaudeInitStatus: vi.fn(),
	checkCodexInitStatus: vi.fn(),
	checkOpenCodeInitStatus: vi.fn(),
	checkWorkBuddyInitStatus: vi.fn(),
	onAgentProcessStatesChanged: vi.fn(),
	createTask: vi.fn(),
	continueTask: vi.fn(),
	runTask: vi.fn(),
	stopTaskAgent: vi.fn(),
	useTask: vi.fn(),
}));

const RESTORED_TASK = {
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
				toolCalls: [{ name: "workspace.read", durationMs: 250 }],
				tokenUsage: { totalTokens: 1200 },
				files: { added: 1, modified: 2, deleted: 0 },
			},
		},
	],
	turns: [
		{
			taskAgentId: "task-agent-1",
			sequence: 0,
			prompt: "Inspect repository",
			finalStatus: "completed",
			responseText: "Repository inspection complete.",
			metrics: {
				totalDurationMs: 1250,
				toolCalls: [{ name: "workspace.read", durationMs: 250 }],
			},
			createdAtMs: 2,
		},
	],
};

vi.mock("@/api/agent", () => ({
	checkAgentProcesses: apiMocks.checkAgentProcesses,
	onAgentProcessStatesChanged: apiMocks.onAgentProcessStatesChanged,
}));
vi.mock("@/api/claude", () => ({
	checkClaudeInitStatus: apiMocks.checkClaudeInitStatus,
}));
vi.mock("@/api/codex", () => ({
	checkCodexInitStatus: apiMocks.checkCodexInitStatus,
}));
vi.mock("@/api/opencode", () => ({
	checkOpenCodeInitStatus: apiMocks.checkOpenCodeInitStatus,
}));
vi.mock("@/api/workbuddy", () => ({
	checkWorkBuddyInitStatus: apiMocks.checkWorkBuddyInitStatus,
}));
vi.mock("@/queries/task", () => ({
	useContinueTask: () => ({
		mutateAsync: apiMocks.continueTask,
		isPending: false,
		error: null,
	}),
	useCreateTask: () => ({
		mutateAsync: apiMocks.createTask,
		isPending: false,
		error: null,
	}),
	useRunTask: () => ({ mutate: apiMocks.runTask }),
	useStopTaskAgent: () => ({
		mutate: apiMocks.stopTaskAgent,
		isPending: false,
	}),
	useTask: apiMocks.useTask,
}));
vi.mock("@/queries/skill", () => ({
	useSkills: () => ({ data: [], isLoading: false }),
	useWorkspaceSkills: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/queries/workspace", () => ({
	useWorkspaces: () => ({
		data: [
			{
				id: "workspace-docs",
				name: "docs-lab",
				sourceKind: "external",
				sourcePath: "/Users/me/docs-lab",
				pinnedAtMs: null,
				createdAtMs: 1,
				updatedAtMs: 1,
			},
		],
		isLoading: false,
	}),
}));

describe("WorkspacePage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.checkAgentProcesses.mockResolvedValue({
			claude: false,
			codex: true,
			opencode: false,
			workbuddy: true,
		});
		apiMocks.checkCodexInitStatus.mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "api-key",
			model: "gpt-runtime",
			reasoningEffort: "xhigh",
		});
		apiMocks.checkClaudeInitStatus.mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "oauth",
			model: "claude-runtime",
			reasoningEffort: null,
		});
		apiMocks.checkOpenCodeInitStatus.mockResolvedValue({
			installed: false,
			loggedIn: false,
			authenticationMethod: null,
			model: null,
			reasoningEffort: null,
		});
		apiMocks.checkWorkBuddyInitStatus.mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "local",
			model: "workbuddy-runtime",
			reasoningEffort: "enabled",
		});
		apiMocks.onAgentProcessStatesChanged.mockResolvedValue(vi.fn());
		apiMocks.createTask.mockResolvedValue({
			...RESTORED_TASK,
			task: { ...RESTORED_TASK.task, status: "preparing" },
			agents: RESTORED_TASK.agents.map((agent) => ({
				...agent,
				status: "preparing",
			})),
			results: [],
		});
		apiMocks.useTask.mockReturnValue({ data: undefined, isLoading: false });
	});

	it("renders the composer without the welcome empty state", () => {
		render(<WorkspacePage />);

		expect(
			screen.queryByRole("heading", { name: "从 agent-gauge 开始" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByText("描述任务，然后选择一个或多个本地 Agent 协作或对比。"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("textbox", {
				name: "任务内容",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "探索模式" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "已选择 0 个 Agent" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "0 个技能" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "发送任务" })).toBeDisabled();
		expect(screen.queryByText("agent-gauge / 新会话")).not.toBeInTheDocument();
		expect(screen.queryByText("agent-gauge · main")).not.toBeInTheDocument();
	});

	it("shows the workspace breadcrumb without its absolute path", () => {
		render(<WorkspacePage workspaceId="workspace-docs" />);

		expect(screen.getByText("docs-lab / 新任务")).toBeInTheDocument();
		expect(screen.queryByText("/Users/me/docs-lab")).not.toBeInTheDocument();
	});

	it("builds agent autocomplete from backend process and runtime data", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.type(screen.getByRole("textbox", { name: "任务内容" }), "/");

		const agents = screen.getByRole("listbox", { name: "已启动的 Agent" });
		expect(agents).toBeInTheDocument();
		expect(
			await screen.findByRole("option", { name: /Codex/ }),
		).toHaveTextContent("gpt-runtime · xhigh");
		expect(screen.getByRole("option", { name: /WorkBuddy/ })).toHaveTextContent(
			"workbuddy-runtime · enabled",
		);
		expect(
			screen.queryByRole("option", { name: /Claude Code/ }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: /OpenCode/ }),
		).not.toBeInTheDocument();
		expect(screen.queryByText("gpt-5.6")).not.toBeInTheDocument();
		await user.click(screen.getByRole("option", { name: /Codex/ }));
		expect(
			screen.getByRole("button", { name: "已选择 1 个 Agent" }),
		).toBeInTheDocument();
	});

	it("makes benchmark semantics explicit before a formal run", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.click(screen.getByRole("button", { name: "探索模式" }));
		await user.click(screen.getByRole("option", { name: "基准测试模式" }));

		expect(
			screen.getByText("每个 Agent 从相同内容开始，运行期间彼此隔离"),
		).toBeInTheDocument();
	});

	it("shows backend Agent installation, process, and runtime configuration", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.click(screen.getByRole("button", { name: "查看 Agent 环境" }));

		expect(
			screen.getByRole("dialog", { name: "Agent 环境" }),
		).toBeInTheDocument();
		expect(await screen.findByText("2 个已启动")).toBeInTheDocument();
		expect(screen.getByText("gpt-runtime · xhigh")).toBeInTheDocument();
		expect(screen.getByText("claude-runtime")).toBeInTheDocument();
		expect(screen.getAllByText("已启动")).toHaveLength(2);
		expect(screen.getAllByText("未启动")).toHaveLength(2);
		expect(screen.getByText("未安装")).toBeInTheDocument();
		expect(apiMocks.checkAgentProcesses).toHaveBeenCalledOnce();
		expect(apiMocks.checkCodexInitStatus).toHaveBeenCalledOnce();
		expect(apiMocks.checkClaudeInitStatus).toHaveBeenCalledOnce();
		expect(apiMocks.checkOpenCodeInitStatus).toHaveBeenCalledOnce();
		expect(apiMocks.checkWorkBuddyInitStatus).toHaveBeenCalledOnce();
	});

	it("moves the environment button by dragging without opening the panel", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		const button = screen.getByRole("button", { name: "查看 Agent 环境" });
		const workspace = button.closest("main");
		expect(workspace).not.toBeNull();
		vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
			new DOMRect(736, 732, 44, 44),
		);
		vi.spyOn(workspace as HTMLElement, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 800, 800),
		);

		await user.pointer([
			{ target: button, coords: { clientX: 758, clientY: 754 } },
			{ keys: "[MouseLeft>]" },
			{ target: button, coords: { clientX: 638, clientY: 674 } },
			{ keys: "[/MouseLeft]" },
		]);

		expect(button.parentElement).toHaveStyle({
			transform: "translate3d(-120px, -80px, 0)",
		});
		expect(
			screen.queryByRole("dialog", { name: "Agent 环境" }),
		).not.toBeInTheDocument();
	});

	it("opens the environment panel from the dragged Dropdown anchor", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		const button = screen.getByRole("button", { name: "查看 Agent 环境" });
		const workspace = button.closest("main");
		expect(workspace).not.toBeNull();
		vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
			new DOMRect(736, 732, 44, 44),
		);
		vi.spyOn(workspace as HTMLElement, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 800, 800),
		);
		await user.pointer([
			{ target: button, coords: { clientX: 758, clientY: 754 } },
			{ keys: "[MouseLeft>]" },
			{ target: button, coords: { clientX: 638, clientY: 674 } },
			{ keys: "[/MouseLeft]" },
		]);
		await user.click(button);

		const dialog = screen.getByRole("dialog", { name: "Agent 环境" });
		expect(
			button.closest('[data-component="agent-environment-dropdown"]'),
		).not.toBeNull();
		expect(dialog.closest('[data-slot="dropdown-popover"]')).not.toBeNull();
	});

	it("creates a locked Task and starts every selected Agent", async () => {
		const user = userEvent.setup();
		const toastSuccess = vi.spyOn(Toast.toast, "success");
		render(<WorkspacePage />);

		await user.type(screen.getByRole("textbox", { name: "任务内容" }), "/");
		await user.click(await screen.findByRole("option", { name: /Codex/ }));
		await user.type(
			screen.getByRole("textbox", { name: "任务内容" }),
			"Inspect repository",
		);
		await user.click(screen.getByRole("button", { name: "发送任务" }));

		expect(apiMocks.createTask).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Inspect repository",
				agents: [
					{
						agentKind: "codex",
						model: "gpt-runtime",
						mode: "xhigh",
					},
				],
			}),
		);
		expect(
			await screen.findByRole("region", { name: /Codex/ }),
		).toBeInTheDocument();
		expect(apiMocks.runTask).toHaveBeenCalledWith(
			"task-42",
			expect.objectContaining({
				onError: expect.any(Function),
				onSuccess: expect.any(Function),
			}),
		);
		expect(toastSuccess).toHaveBeenCalledWith("任务已分发到 1 个 Agent");
	});

	it("freezes the Composer permission selection into the created Task", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.click(screen.getByRole("button", { name: "可写入工作区" }));
		await user.click(screen.getByRole("option", { name: "只读文件" }));
		await user.click(screen.getByRole("option", { name: "禁止执行命令" }));
		await user.type(screen.getByRole("textbox", { name: "任务内容" }), "/");
		await user.click(await screen.findByRole("option", { name: /Codex/ }));
		await user.type(
			screen.getByRole("textbox", { name: "任务内容" }),
			"Inspect safely",
		);
		await user.click(screen.getByRole("button", { name: "发送任务" }));

		expect(apiMocks.createTask).toHaveBeenCalledWith(
			expect.objectContaining({
				fileAccess: "read_only",
				commandExecution: "deny",
			}),
		);
	});

	it("restores a completed Task directly into the Figma Agent run panel", () => {
		apiMocks.useTask.mockReturnValue({ data: RESTORED_TASK, isLoading: false });
		render(<WorkspacePage taskId="task-42" />);

		expect(screen.getByRole("region", { name: /Codex/ })).toBeInTheDocument();
		expect(
			screen.getByText("Repository inspection complete."),
		).toBeInTheDocument();
		expect(screen.getByText("workspace.read")).toBeInTheDocument();
	});

	it("opens a read-only HeroUI result summary table from the Task header", async () => {
		const user = userEvent.setup();
		apiMocks.useTask.mockReturnValue({ data: RESTORED_TASK, isLoading: false });
		render(<WorkspacePage taskId="task-42" />);

		await user.click(screen.getByRole("button", { name: "查看结果汇总" }));

		const summary = screen.getByRole("complementary", { name: "结果汇总" });
		expect(summary.querySelector('[data-slot="table"]')).toBeInTheDocument();
		expect(screen.getByRole("columnheader", { name: "指标" })).toHaveClass(
			"bg-surface-secondary",
		);
		expect(summary).toHaveTextContent("Codex");
		expect(summary).toHaveTextContent("1.25 s");
		expect(summary).toHaveTextContent("1,200");
		expect(summary).toHaveTextContent("新增 1 · 修改 2 · 删除 0");
		expect(screen.queryByText("最佳 Agent")).not.toBeInTheDocument();
	});

	it("toggles the result summary between split and full-screen layouts", async () => {
		const user = userEvent.setup();
		apiMocks.useTask.mockReturnValue({ data: RESTORED_TASK, isLoading: false });
		render(<WorkspacePage taskId="task-42" />);

		await user.click(screen.getByRole("button", { name: "查看结果汇总" }));
		await user.click(screen.getByRole("button", { name: "全屏查看" }));

		const summary = screen.getByRole("complementary", { name: "结果汇总" });
		expect(summary).toHaveClass(
			"fixed",
			"inset-x-0",
			"bottom-0",
			"top-11",
			"w-full",
		);

		await user.click(screen.getByRole("button", { name: "退出全屏" }));

		expect(summary).not.toHaveClass("fixed");
		expect(
			screen.getByRole("button", { name: "全屏查看" }),
		).toBeInTheDocument();
	});

	it("renders an accessible separator for resizing the result summary", async () => {
		const user = userEvent.setup();
		apiMocks.useTask.mockReturnValue({ data: RESTORED_TASK, isLoading: false });
		render(<WorkspacePage taskId="task-42" />);

		await user.click(screen.getByRole("button", { name: "查看结果汇总" }));

		expect(
			screen.getByRole("separator", { name: "调整结果汇总宽度" }),
		).toBeInTheDocument();
	});

	it("continues the restored Task for all or one existing Agent", async () => {
		const user = userEvent.setup();
		const toastSuccess = vi.spyOn(Toast.toast, "success");
		apiMocks.useTask.mockReturnValue({ data: RESTORED_TASK, isLoading: false });
		apiMocks.continueTask.mockResolvedValue(RESTORED_TASK);
		render(<WorkspacePage taskId="task-42" />);

		const followUp = screen.getByRole("textbox", { name: "继续任务" });
		await user.type(followUp, "Check all tests");
		await user.click(screen.getByRole("button", { name: "发送继续任务" }));
		expect(apiMocks.continueTask).toHaveBeenCalledWith({
			taskId: "task-42",
			prompt: "Check all tests",
			taskAgentIds: [],
		});

		await user.click(screen.getByRole("button", { name: "仅发送给 Codex" }));
		await user.type(followUp, "Check Codex output");
		await user.click(screen.getByRole("button", { name: "发送继续任务" }));
		expect(apiMocks.continueTask).toHaveBeenLastCalledWith({
			taskId: "task-42",
			prompt: "Check Codex output",
			taskAgentIds: ["task-agent-1"],
		});
		expect(toastSuccess).toHaveBeenCalledWith("已发送继续任务");
	});
});
