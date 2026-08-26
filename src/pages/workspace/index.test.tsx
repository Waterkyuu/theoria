import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacePage from ".";

const apiMocks = vi.hoisted(() => ({
	checkAgentProcesses: vi.fn(),
	checkClaudeLogin: vi.fn(),
	checkCodexLogin: vi.fn(),
	checkOpenCodeLogin: vi.fn(),
	checkWorkBuddyConfig: vi.fn(),
	checkWorkBuddyLogin: vi.fn(),
	onAgentProcessStatesChanged: vi.fn(),
}));

vi.mock("@/api/agent", () => ({
	checkAgentProcesses: apiMocks.checkAgentProcesses,
	onAgentProcessStatesChanged: apiMocks.onAgentProcessStatesChanged,
}));
vi.mock("@/api/claude", () => ({
	checkClaudeLogin: apiMocks.checkClaudeLogin,
}));
vi.mock("@/api/codex", () => ({
	checkCodexLogin: apiMocks.checkCodexLogin,
}));
vi.mock("@/api/opencode", () => ({
	checkOpenCodeLogin: apiMocks.checkOpenCodeLogin,
}));
vi.mock("@/api/workbuddy", () => ({
	checkWorkBuddyConfig: apiMocks.checkWorkBuddyConfig,
	checkWorkBuddyLogin: apiMocks.checkWorkBuddyLogin,
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
		apiMocks.checkCodexLogin.mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "api-key",
			model: "gpt-runtime",
			reasoningEffort: "xhigh",
		});
		apiMocks.checkClaudeLogin.mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "oauth",
			model: "claude-runtime",
			reasoningEffort: null,
		});
		apiMocks.checkOpenCodeLogin.mockResolvedValue({
			installed: false,
			loggedIn: false,
			authenticationMethod: null,
			model: null,
			reasoningEffort: null,
		});
		apiMocks.checkWorkBuddyLogin.mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "local",
			model: null,
			reasoningEffort: null,
		});
		apiMocks.checkWorkBuddyConfig.mockResolvedValue({
			model: "workbuddy-runtime",
			reasoningEffort: "enabled",
		});
		apiMocks.onAgentProcessStatesChanged.mockResolvedValue(vi.fn());
	});

	it("renders a desktop conversation workspace with a complete composer", () => {
		render(<WorkspacePage />);

		expect(
			screen.getByRole("heading", { name: "从 agent-gauge 开始" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("textbox", {
				name: "任务内容",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "探索模式" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "已选择 1 个 Agent" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "发送任务" })).toBeDisabled();
	});

	it("opens agent autocomplete when slash is entered and adds a running agent", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.type(screen.getByRole("textbox", { name: "任务内容" }), "/");

		const agents = screen.getByRole("listbox", { name: "已启动的 Agent" });
		expect(agents).toBeInTheDocument();
		await user.click(screen.getByRole("option", { name: /OpenCode/ }));
		expect(
			screen.getByRole("button", { name: "已选择 2 个 Agent" }),
		).toBeInTheDocument();
	});

	it("makes benchmark semantics explicit before a formal run", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.click(screen.getByRole("button", { name: "探索模式" }));
		await user.click(screen.getByRole("option", { name: "基准测试模式" }));

		expect(
			screen.getByText("每个 Agent 从相同内容开始，运行期间彼此隔离。"),
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
		expect(apiMocks.checkCodexLogin).toHaveBeenCalledOnce();
		expect(apiMocks.checkClaudeLogin).toHaveBeenCalledOnce();
		expect(apiMocks.checkOpenCodeLogin).toHaveBeenCalledOnce();
		expect(apiMocks.checkWorkBuddyLogin).toHaveBeenCalledOnce();
		expect(apiMocks.checkWorkBuddyConfig).toHaveBeenCalledOnce();
	});
});
