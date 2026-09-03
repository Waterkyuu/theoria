import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TFunction } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { AgentProcessStates, AgentRuntimeConfig } from "@/types/agent";

const apiMocks = vi.hoisted(() => ({
	checkAgentProcesses: vi.fn(),
	checkClaudeInitStatus: vi.fn(),
	checkClaudeLogin: vi.fn(),
	getClaudeRuntimeConfig: vi.fn(),
	checkCodexInitStatus: vi.fn(),
	checkCodexLogin: vi.fn(),
	getCodexRuntimeConfig: vi.fn(),
	checkOpenCodeInitStatus: vi.fn(),
	checkOpenCodeLogin: vi.fn(),
	getOpenCodeRuntimeConfig: vi.fn(),
	checkQoderInitStatus: vi.fn(),
	checkQoderLogin: vi.fn(),
	getQoderRuntimeConfig: vi.fn(),
	checkTraeCodeInitStatus: vi.fn(),
	checkTraeCodeLogin: vi.fn(),
	getTraeCodeRuntimeConfig: vi.fn(),
	checkWorkBuddyInitStatus: vi.fn(),
	checkWorkBuddyLogin: vi.fn(),
	getWorkBuddyRuntimeConfig: vi.fn(),
	onClaudeConfigChanged: vi.fn(),
	onCodexConfigChanged: vi.fn(),
	onOpenCodeConfigChanged: vi.fn(),
	onQoderConfigChanged: vi.fn(),
	onTraeCodeConfigChanged: vi.fn(),
	onWorkBuddyConfigChanged: vi.fn(),
	onAgentProcessStatesChanged: vi.fn(),
	runClaudeTask: vi.fn(),
	runCodexTask: vi.fn(),
	runOpenCodeTask: vi.fn(),
	runQoderTask: vi.fn(),
	runTraeCodeTask: vi.fn(),
	runWorkBuddyTask: vi.fn(),
	saveComparisonHistory: vi.fn(),
}));

vi.mock("@/api/agent", () => ({
	checkAgentProcesses: apiMocks.checkAgentProcesses,
	onAgentProcessStatesChanged: apiMocks.onAgentProcessStatesChanged,
}));

vi.mock("@/api/claude", () => ({
	checkClaudeInitStatus: apiMocks.checkClaudeInitStatus,
	checkClaudeLogin: apiMocks.checkClaudeLogin,
	getClaudeRuntimeConfig: apiMocks.getClaudeRuntimeConfig,
	onClaudeConfigChanged: apiMocks.onClaudeConfigChanged,
	runClaudeTask: apiMocks.runClaudeTask,
}));

vi.mock("@/api/codex", () => ({
	checkCodexInitStatus: apiMocks.checkCodexInitStatus,
	checkCodexLogin: apiMocks.checkCodexLogin,
	getCodexRuntimeConfig: apiMocks.getCodexRuntimeConfig,
	onCodexConfigChanged: apiMocks.onCodexConfigChanged,
	runCodexTask: apiMocks.runCodexTask,
}));

vi.mock("@/api/opencode", () => ({
	checkOpenCodeInitStatus: apiMocks.checkOpenCodeInitStatus,
	checkOpenCodeLogin: apiMocks.checkOpenCodeLogin,
	getOpenCodeRuntimeConfig: apiMocks.getOpenCodeRuntimeConfig,
	onOpenCodeConfigChanged: apiMocks.onOpenCodeConfigChanged,
	runOpenCodeTask: apiMocks.runOpenCodeTask,
}));

vi.mock("@/api/qoder", () => ({
	checkQoderInitStatus: apiMocks.checkQoderInitStatus,
	checkQoderLogin: apiMocks.checkQoderLogin,
	getQoderRuntimeConfig: apiMocks.getQoderRuntimeConfig,
	onQoderConfigChanged: apiMocks.onQoderConfigChanged,
	runQoderTask: apiMocks.runQoderTask,
}));

vi.mock("@/api/traecode", () => ({
	checkTraeCodeInitStatus: apiMocks.checkTraeCodeInitStatus,
	checkTraeCodeLogin: apiMocks.checkTraeCodeLogin,
	getTraeCodeRuntimeConfig: apiMocks.getTraeCodeRuntimeConfig,
	onTraeCodeConfigChanged: apiMocks.onTraeCodeConfigChanged,
	runTraeCodeTask: apiMocks.runTraeCodeTask,
}));

vi.mock("@/api/workbuddy", () => ({
	checkWorkBuddyInitStatus: apiMocks.checkWorkBuddyInitStatus,
	checkWorkBuddyLogin: apiMocks.checkWorkBuddyLogin,
	getWorkBuddyRuntimeConfig: apiMocks.getWorkBuddyRuntimeConfig,
	onWorkBuddyConfigChanged: apiMocks.onWorkBuddyConfigChanged,
	runWorkBuddyTask: apiMocks.runWorkBuddyTask,
}));

vi.mock("@/api/comparison", () => ({
	saveComparisonHistory: apiMocks.saveComparisonHistory,
}));

import ComparisonPage, { resolveAgentStatus } from ".";

const RUNTIME_STATUS = {
	installed: true,
	loggedIn: true,
	authenticationMethod: "test",
	model: "test-model",
	reasoningEffort: "medium",
};

const LOGIN_STATUS = {
	installed: true,
	loggedIn: true,
	authenticationMethod: "test",
};

let processStateListener: ((states: AgentProcessStates) => void) | null = null;
let workBuddyConfigListener: ((config: AgentRuntimeConfig) => void) | null =
	null;
const stopProcessStateListener = vi.fn();
const stopWorkBuddyConfigListener = vi.fn();

describe("resolveAgentStatus", () => {
	const stoppedProcesses: AgentProcessStates = {
		claude: false,
		codex: false,
		opencode: false,
		qoder: false,
		traecode: false,
		workbuddy: false,
	};
	const runningProcesses = { ...stoppedProcesses, codex: true };
	const translate = vi.fn((key: string, options?: { agent?: string }) =>
		options?.agent ? `${key}:${options.agent}` : key,
	) as unknown as TFunction;
	const readyLogin = { status: "resolved", value: RUNTIME_STATUS } as const;

	it.each([
		{
			name: "login check",
			loginState: { status: "checking" } as const,
			processState: { status: "resolved", value: runningProcesses } as const,
			expected: ["checkingLogin:agentNames.codex", "bg-mute", false],
		},
		{
			name: "failed login check",
			loginState: { status: "failed" } as const,
			processState: { status: "resolved", value: runningProcesses } as const,
			expected: [
				"loginCheckFailed:agentNames.codex",
				"bg-hairline-strong",
				false,
			],
		},
		{
			name: "missing installation",
			loginState: {
				status: "resolved",
				value: { ...RUNTIME_STATUS, installed: false },
			} as const,
			processState: { status: "resolved", value: runningProcesses } as const,
			expected: ["notInstalled:agentNames.codex", "bg-hairline-strong", false],
		},
		{
			name: "missing login",
			loginState: {
				status: "resolved",
				value: { ...RUNTIME_STATUS, loggedIn: false },
			} as const,
			processState: { status: "resolved", value: runningProcesses } as const,
			expected: ["notLoggedIn:agentNames.codex", "bg-hairline-strong", false],
		},
		{
			name: "process check",
			loginState: readyLogin,
			processState: { status: "checking" } as const,
			expected: ["checkingProcess:agentNames.codex", "bg-mute", true],
		},
		{
			name: "failed process check",
			loginState: readyLogin,
			processState: { status: "failed" } as const,
			expected: [
				"processCheckFailed:agentNames.codex",
				"bg-hairline-strong",
				true,
			],
		},
		{
			name: "running process",
			loginState: readyLogin,
			processState: { status: "resolved", value: runningProcesses } as const,
			expected: ["agentRunning:agentNames.codex", "bg-primary", true],
		},
		{
			name: "ready process",
			loginState: readyLogin,
			processState: { status: "resolved", value: stoppedProcesses } as const,
			expected: ["agentReady:agentNames.codex", "bg-charcoal", true],
		},
	])("maps $name to its display", ({ loginState, processState, expected }) => {
		const display = resolveAgentStatus(
			"codex",
			loginState,
			processState,
			translate,
		);

		expect([display.message, display.tone, display.isReady]).toEqual(expected);
	});
});

// Covers native status subscriptions owned by the comparison page lifecycle.
describe("ComparisonPage native status updates", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		await i18n.changeLanguage("zh-CN");
		stopProcessStateListener.mockClear();
		stopWorkBuddyConfigListener.mockClear();
		apiMocks.checkAgentProcesses.mockResolvedValue({
			claude: false,
			codex: false,
			opencode: false,
			qoder: false,
			traecode: false,
			workbuddy: false,
		});
		apiMocks.checkClaudeInitStatus.mockResolvedValue(RUNTIME_STATUS);
		apiMocks.checkCodexInitStatus.mockResolvedValue(RUNTIME_STATUS);
		apiMocks.checkOpenCodeInitStatus.mockResolvedValue(RUNTIME_STATUS);
		apiMocks.checkQoderInitStatus.mockResolvedValue(RUNTIME_STATUS);
		apiMocks.checkTraeCodeInitStatus.mockResolvedValue(RUNTIME_STATUS);
		apiMocks.checkWorkBuddyInitStatus.mockResolvedValue({
			model: "initial-workbuddy-model",
			reasoningEffort: "medium",
			...LOGIN_STATUS,
		});
		apiMocks.checkClaudeLogin.mockResolvedValue(LOGIN_STATUS);
		apiMocks.checkCodexLogin.mockResolvedValue(LOGIN_STATUS);
		apiMocks.checkOpenCodeLogin.mockResolvedValue(LOGIN_STATUS);
		apiMocks.checkQoderLogin.mockResolvedValue(LOGIN_STATUS);
		apiMocks.checkTraeCodeLogin.mockResolvedValue(LOGIN_STATUS);
		apiMocks.checkWorkBuddyLogin.mockResolvedValue(LOGIN_STATUS);
		apiMocks.getClaudeRuntimeConfig.mockResolvedValue({
			model: "test-model",
			reasoningEffort: "medium",
		});
		apiMocks.getCodexRuntimeConfig.mockResolvedValue({
			model: "test-model",
			reasoningEffort: "medium",
		});
		apiMocks.getOpenCodeRuntimeConfig.mockResolvedValue({
			model: "test-model",
			reasoningEffort: "medium",
		});
		apiMocks.getQoderRuntimeConfig.mockResolvedValue({
			model: "test-model",
			reasoningEffort: null,
		});
		apiMocks.getTraeCodeRuntimeConfig.mockResolvedValue({
			model: "test-model",
			reasoningEffort: null,
		});
		apiMocks.getWorkBuddyRuntimeConfig.mockResolvedValue({
			model: "initial-workbuddy-model",
			reasoningEffort: "medium",
		});
		apiMocks.onClaudeConfigChanged.mockResolvedValue(vi.fn());
		apiMocks.onCodexConfigChanged.mockResolvedValue(vi.fn());
		apiMocks.onOpenCodeConfigChanged.mockResolvedValue(vi.fn());
		apiMocks.onQoderConfigChanged.mockResolvedValue(vi.fn());
		apiMocks.onTraeCodeConfigChanged.mockResolvedValue(vi.fn());
		apiMocks.onWorkBuddyConfigChanged.mockImplementation((listener) => {
			workBuddyConfigListener = listener;
			return Promise.resolve(stopWorkBuddyConfigListener);
		});
		apiMocks.onAgentProcessStatesChanged.mockImplementation((listener) => {
			processStateListener = listener;
			return Promise.resolve(stopProcessStateListener);
		});
		apiMocks.saveComparisonHistory.mockResolvedValue({ id: 1 });
	});

	afterEach(() => {
		processStateListener = null;
		workBuddyConfigListener = null;
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("does not repeat process checks on a one-second timer", async () => {
		render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(apiMocks.checkAgentProcesses).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(3_100);
		});

		expect(apiMocks.checkAgentProcesses).toHaveBeenCalledTimes(1);
	});

	it("applies a Codex config event without repeating its login probe", async () => {
		let configListener: ((config: AgentRuntimeConfig) => void) | undefined;
		apiMocks.onCodexConfigChanged.mockImplementation((listener) => {
			configListener = listener;
			return Promise.resolve(vi.fn());
		});
		render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(apiMocks.checkCodexInitStatus).toHaveBeenCalledTimes(1);
		expect(apiMocks.checkCodexLogin).not.toHaveBeenCalled();

		act(() =>
			configListener?.({
				model: "event-codex-model",
				reasoningEffort: "high",
			}),
		);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(apiMocks.checkCodexLogin).not.toHaveBeenCalled();
		const card = within(screen.getByRole("button", { name: "Codex" }));
		expect(card.getByText("event-codex-model")).toBeInTheDocument();
		expect(card.getByText("高 (high)")).toBeInTheDocument();
	});

	it("applies native process state changes to the Agent card", async () => {
		render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(apiMocks.onAgentProcessStatesChanged).toHaveBeenCalledTimes(1);

		act(() => {
			processStateListener?.({
				claude: false,
				codex: true,
				opencode: false,
				qoder: false,
				traecode: false,
				workbuddy: false,
			});
		});

		expect(
			within(screen.getByRole("button", { name: "Codex" })).getByText("已启动"),
		).toBeInTheDocument();
	});

	it("removes the native process listener when the page unmounts", async () => {
		const { unmount } = render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		unmount();
		await act(async () => {
			await Promise.resolve();
		});

		expect(stopProcessStateListener).toHaveBeenCalledTimes(1);
	});

	it("uses complete initialization once while polling only login every five seconds", async () => {
		render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(apiMocks.checkCodexInitStatus).toHaveBeenCalledTimes(1);
		expect(apiMocks.checkCodexLogin).not.toHaveBeenCalled();
		expect(apiMocks.getCodexRuntimeConfig).not.toHaveBeenCalled();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_100);
		});

		expect(apiMocks.checkCodexInitStatus).toHaveBeenCalledTimes(1);
		expect(apiMocks.checkCodexLogin).toHaveBeenCalledTimes(1);
		expect(apiMocks.getCodexRuntimeConfig).not.toHaveBeenCalled();
	});

	it("starts WorkBuddy config monitoring after a later login", async () => {
		apiMocks.checkWorkBuddyInitStatus.mockResolvedValueOnce({
			installed: false,
			loggedIn: false,
			authenticationMethod: null,
			model: null,
			reasoningEffort: null,
		});
		apiMocks.checkWorkBuddyLogin
			.mockResolvedValueOnce({
				...LOGIN_STATUS,
			})
			.mockResolvedValue(LOGIN_STATUS);
		render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(apiMocks.getWorkBuddyRuntimeConfig).not.toHaveBeenCalled();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_100);
		});

		expect(apiMocks.getWorkBuddyRuntimeConfig).toHaveBeenCalledTimes(1);
	});

	it("applies native WorkBuddy model changes to its card", async () => {
		render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		act(() => {
			workBuddyConfigListener?.({
				model: "event-workbuddy-model",
				reasoningEffort: "high",
			});
		});

		const workBuddyCard = within(
			screen.getByRole("button", { name: "WorkBuddy" }),
		);
		expect(
			workBuddyCard.getByText("event-workbuddy-model"),
		).toBeInTheDocument();
		expect(workBuddyCard.getByText("高 (high)")).toBeInTheDocument();
	});

	it("persists one history record after every selected Agent settles", async () => {
		const runResult = {
			response: "done",
			totalDurationMs: 1000,
			timeToFirstTokenMs: 100,
			tokenUsage: null,
			thinkingDurationMs: 200,
			compactionCount: 0,
			toolCallCount: 0,
			toolCalls: [],
		};
		apiMocks.runClaudeTask.mockResolvedValue(runResult);
		apiMocks.runCodexTask.mockResolvedValue(runResult);
		apiMocks.runOpenCodeTask.mockResolvedValue(runResult);
		apiMocks.runQoderTask.mockResolvedValue(runResult);
		apiMocks.runTraeCodeTask.mockResolvedValue(runResult);
		apiMocks.runWorkBuddyTask.mockResolvedValue(runResult);
		render(<ComparisonPage />);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		fireEvent.change(screen.getByLabelText("任务内容"), {
			target: { value: "检查性能" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "运行 6 个 Agent 对比" }),
		);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(apiMocks.saveComparisonHistory).toHaveBeenCalledTimes(1);
		expect(apiMocks.saveComparisonHistory).toHaveBeenCalledWith(
			expect.objectContaining({
				query: "检查性能",
				results: expect.arrayContaining([
					expect.objectContaining({ agent: "codex", status: "succeeded" }),
					expect.objectContaining({ agent: "claude", status: "succeeded" }),
					expect.objectContaining({ agent: "opencode", status: "succeeded" }),
					expect.objectContaining({ agent: "qoder", status: "succeeded" }),
					expect.objectContaining({
						agent: "traecode",
						status: "succeeded",
					}),
					expect.objectContaining({ agent: "workbuddy", status: "succeeded" }),
				]),
			}),
		);
	});
});
