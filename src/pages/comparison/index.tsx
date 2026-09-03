/**
 * Deprecated (old version)
 */
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MagicWand, Play } from "@gravity-ui/icons";
import { Button, Card, TextArea, Toast } from "@heroui/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/utils/error";
import { checkAgentProcesses, onAgentProcessStatesChanged } from "@/api/agent";
import {
	checkClaudeInitStatus,
	checkClaudeLogin,
	getClaudeRuntimeConfig,
	onClaudeConfigChanged,
	runClaudeTask,
} from "@/api/claude";
import {
	checkCodexInitStatus,
	checkCodexLogin,
	getCodexRuntimeConfig,
	onCodexConfigChanged,
	runCodexTask,
} from "@/api/codex";
import { saveComparisonHistory } from "@/api/comparison";
import {
	checkOpenCodeInitStatus,
	checkOpenCodeLogin,
	getOpenCodeRuntimeConfig,
	onOpenCodeConfigChanged,
	runOpenCodeTask,
} from "@/api/opencode";
import {
	checkQoderInitStatus,
	checkQoderLogin,
	getQoderRuntimeConfig,
	onQoderConfigChanged,
	runQoderTask,
} from "@/api/qoder";
import {
	checkTraeCodeInitStatus,
	checkTraeCodeLogin,
	getTraeCodeRuntimeConfig,
	onTraeCodeConfigChanged,
	runTraeCodeTask,
} from "@/api/traecode";
import {
	checkWorkBuddyInitStatus,
	checkWorkBuddyLogin,
	getWorkBuddyRuntimeConfig,
	onWorkBuddyConfigChanged,
	runWorkBuddyTask,
} from "@/api/workbuddy";
import { AGENT_KINDS } from "@/constants/agent";
import type {
	AgentKind,
	AgentLoginStatus,
	AgentProcessStates,
	AgentRunResult,
	AgentRuntimeConfig,
	AgentRuntimeStatus,
} from "@/types/agent";
import type { ComparisonResultInput } from "@/types/comparison";
import { AgentComparisonCard } from "./components/agent-comparison-card";
import { AgentSelectionCard } from "./components/agent-selection-card";

type LoginState =
	| { status: "checking" }
	| { status: "resolved"; value: AgentLoginStatus }
	| { status: "failed" };

type LoginStates = Record<AgentKind, LoginState>;

type ProcessState =
	| { status: "checking" }
	| { status: "resolved"; value: AgentProcessStates }
	| { status: "failed" };

type AgentRunState =
	| { status: "idle" }
	| { status: "running" }
	| {
			/** Completed metrics and response from this product. */
			status: "succeeded";
			/** Measured result returned by the local Agent runtime. */
			result: AgentRunResult;
	  }
	| {
			/** Failed run that does not interrupt the other selected products. */
			status: "failed";
			/** Localized error presented inside this product's comparison card. */
			errorMessage: string;
	  };

type AgentStatusDisplay = {
	/** User-visible installation, login, and process state. */
	message: string;
	/** Tailwind color class for the status indicator. */
	tone: string;
	/** Whether this product can participate in a comparison run. */
	isReady: boolean;
};

const AGENT_STATUS_DISPLAYS = {
	agentReady: { tone: "bg-charcoal", isReady: true },
	agentRunning: { tone: "bg-primary", isReady: true },
	checkingLogin: { tone: "bg-mute", isReady: false },
	checkingProcess: { tone: "bg-mute", isReady: true },
	loginCheckFailed: { tone: "bg-hairline-strong", isReady: false },
	notInstalled: { tone: "bg-hairline-strong", isReady: false },
	notLoggedIn: { tone: "bg-hairline-strong", isReady: false },
	processCheckFailed: { tone: "bg-hairline-strong", isReady: true },
} as const satisfies Record<string, Omit<AgentStatusDisplay, "message">>;

type AgentStatusKey = keyof typeof AGENT_STATUS_DISPLAYS;

const AGENT_INIT_CHECKS: Record<AgentKind, () => Promise<AgentRuntimeStatus>> =
	{
		claude: checkClaudeInitStatus,
		codex: checkCodexInitStatus,
		opencode: checkOpenCodeInitStatus,
		qoder: checkQoderInitStatus,
		traecode: checkTraeCodeInitStatus,
		workbuddy: checkWorkBuddyInitStatus,
	};

const AGENT_LOGIN_CHECKS: Record<AgentKind, () => Promise<AgentLoginStatus>> = {
	claude: checkClaudeLogin,
	codex: checkCodexLogin,
	opencode: checkOpenCodeLogin,
	qoder: checkQoderLogin,
	traecode: checkTraeCodeLogin,
	workbuddy: checkWorkBuddyLogin,
};

const AGENT_CONFIG_CHECKS: Record<
	AgentKind,
	() => Promise<AgentRuntimeConfig>
> = {
	claude: getClaudeRuntimeConfig,
	codex: getCodexRuntimeConfig,
	opencode: getOpenCodeRuntimeConfig,
	qoder: getQoderRuntimeConfig,
	traecode: getTraeCodeRuntimeConfig,
	workbuddy: getWorkBuddyRuntimeConfig,
};

const AGENT_TASK_RUNNERS: Record<
	AgentKind,
	(query: string) => Promise<AgentRunResult>
> = {
	claude: runClaudeTask,
	codex: runCodexTask,
	opencode: runOpenCodeTask,
	qoder: runQoderTask,
	traecode: runTraeCodeTask,
	workbuddy: runWorkBuddyTask,
};

/**
 * Compares authentication fields so config changes remain outside login polling.
 *
 * @example
 * areLoginStatusesEqual(previousStatus, nextStatus);
 */
const areLoginStatusesEqual = (
	left: AgentLoginStatus,
	right: AgentLoginStatus,
) =>
	left.installed === right.installed &&
	left.loggedIn === right.loggedIn &&
	left.authenticationMethod === right.authenticationMethod;

/**
 * Uses an ordered rule table so login failures keep priority over process state
 * without duplicating display construction across control-flow branches.
 *
 * @example
 * resolveAgentStatus("codex", { status: "checking" }, processState, t);
 */
const resolveAgentStatus = (
	agent: AgentKind,
	loginState: LoginState,
	processState: ProcessState,
	t: TFunction,
): AgentStatusDisplay => {
	const agentName = t(`agentNames.${agent}`);
	const statusKey =
		(
			[
				[loginState.status === "checking", "checkingLogin"],
				[loginState.status === "failed", "loginCheckFailed"],
				["value" in loginState && !loginState.value.installed, "notInstalled"],
				["value" in loginState && !loginState.value.loggedIn, "notLoggedIn"],
				[processState.status === "checking", "checkingProcess"],
				[processState.status === "failed", "processCheckFailed"],
				["value" in processState && processState.value[agent], "agentRunning"],
			] satisfies [boolean, AgentStatusKey][]
		).find(([matches]) => matches)?.[1] ?? "agentReady";
	const display = AGENT_STATUS_DISPLAYS[statusKey];

	return {
		message: t(statusKey, { agent: agentName }),
		...display,
	};
};

const ComparisonPage = () => {
	const { t, i18n } = useTranslation();
	const [selectedAgents, setSelectedAgents] = useState<AgentKind[]>([
		...AGENT_KINDS,
	]);
	const [loginStates, setLoginStates] = useState<LoginStates>({
		claude: { status: "checking" },
		codex: { status: "checking" },
		opencode: { status: "checking" },
		qoder: { status: "checking" },
		traecode: { status: "checking" },
		workbuddy: { status: "checking" },
	});
	const [query, setQuery] = useState("");
	const [processState, setProcessState] = useState<ProcessState>({
		status: "checking",
	});
	const [runtimeConfigs, setRuntimeConfigs] = useState<
		Record<AgentKind, AgentRuntimeConfig>
	>({
		claude: { model: null, reasoningEffort: null },
		codex: { model: null, reasoningEffort: null },
		opencode: { model: null, reasoningEffort: null },
		qoder: { model: null, reasoningEffort: null },
		traecode: { model: null, reasoningEffort: null },
		workbuddy: { model: null, reasoningEffort: null },
	});
	const [runStates, setRunStates] = useState<Record<AgentKind, AgentRunState>>({
		claude: { status: "idle" },
		codex: { status: "idle" },
		opencode: { status: "idle" },
		qoder: { status: "idle" },
		traecode: { status: "idle" },
		workbuddy: { status: "idle" },
	});
	const loginStatesRef = useRef(loginStates);
	const isRunning = Object.values(runStates).some(
		(state) => state.status === "running",
	);

	useEffect(() => {
		let isActive = true;
		const agentsChangedDuringInit = new Set<AgentKind>();

		/**
		 * Applies configuration payloads directly so file events never trigger login commands.
		 *
		 * @example
		 * applyRuntimeConfig("codex", { model: "gpt-5", reasoningEffort: "high" });
		 */
		const applyRuntimeConfig = (
			agent: AgentKind,
			config: AgentRuntimeConfig,
		) => {
			if (!isActive) {
				return;
			}
			agentsChangedDuringInit.add(agent);
			setRuntimeConfigs((current) => ({ ...current, [agent]: config }));
		};

		const stopConfigListeners = Promise.all([
			onClaudeConfigChanged((config) => applyRuntimeConfig("claude", config)),
			onCodexConfigChanged((config) => applyRuntimeConfig("codex", config)),
			onOpenCodeConfigChanged((config) =>
				applyRuntimeConfig("opencode", config),
			),
			onQoderConfigChanged((config) => applyRuntimeConfig("qoder", config)),
			onTraeCodeConfigChanged((config) =>
				applyRuntimeConfig("traecode", config),
			),
			onWorkBuddyConfigChanged((config) =>
				applyRuntimeConfig("workbuddy", config),
			),
		]);

		for (const agent of AGENT_KINDS) {
			AGENT_INIT_CHECKS[agent]()
				.then(({ model, reasoningEffort, ...login }) => {
					if (!isActive) {
						return;
					}
					const next: LoginStates = {
						...loginStatesRef.current,
						[agent]: { status: "resolved", value: login },
					};
					loginStatesRef.current = next;
					setLoginStates(next);
					if (!agentsChangedDuringInit.has(agent)) {
						setRuntimeConfigs((current) => ({
							...current,
							[agent]: { model, reasoningEffort },
						}));
					}
				})
				.catch(() => {
					if (!isActive) {
						return;
					}
					const next: LoginStates = {
						...loginStatesRef.current,
						[agent]: { status: "failed" },
					};
					loginStatesRef.current = next;
					setLoginStates(next);
				});
		}

		return () => {
			isActive = false;
			stopConfigListeners.then((stopListeners) => {
				for (const stopListening of stopListeners) {
					stopListening();
				}
			});
		};
	}, []);

	useEffect(() => {
		if (isRunning) {
			return;
		}

		let isActive = true;
		const pendingAgents = new Set<AgentKind>();
		const queuedAgents = new Set<AgentKind>();

		/**
		 * Refreshes authentication only and loads config once after a new login.
		 *
		 * @example
		 * refreshLoginState("codex");
		 */
		const refreshLoginState = (agent: AgentKind) => {
			if (pendingAgents.has(agent)) {
				queuedAgents.add(agent);
				return;
			}

			pendingAgents.add(agent);
			AGENT_LOGIN_CHECKS[agent]()
				.then((value) => {
					if (!isActive) {
						return;
					}
					const previous = loginStatesRef.current[agent];
					const becameLoggedIn =
						previous.status === "resolved" &&
						!previous.value.loggedIn &&
						value.loggedIn;
					const loggedOut =
						previous.status === "resolved" &&
						previous.value.loggedIn &&
						!value.loggedIn;
					if (
						previous.status !== "resolved" ||
						!areLoginStatusesEqual(previous.value, value)
					) {
						const next: LoginStates = {
							...loginStatesRef.current,
							[agent]: { status: "resolved", value },
						};
						loginStatesRef.current = next;
						setLoginStates(next);
					}
					if (loggedOut) {
						setRuntimeConfigs((current) => ({
							...current,
							[agent]: { model: null, reasoningEffort: null },
						}));
					}
					if (becameLoggedIn) {
						AGENT_CONFIG_CHECKS[agent]()
							.then((config) => {
								if (isActive) {
									setRuntimeConfigs((current) => ({
										...current,
										[agent]: config,
									}));
								}
							})
							.catch(() => {
								// Keep the last valid configuration until a later event or login.
							});
					}
				})
				.catch(() => {
					if (isActive && loginStatesRef.current[agent].status !== "failed") {
						const next: LoginStates = {
							...loginStatesRef.current,
							[agent]: { status: "failed" },
						};
						loginStatesRef.current = next;
						setLoginStates(next);
					}
				})
				.finally(() => {
					pendingAgents.delete(agent);
					if (isActive && queuedAgents.delete(agent)) {
						refreshLoginState(agent);
					}
				});
		};

		/** Polls every agent's authentication without touching runtime configuration. */
		const refreshLoginStates = () => {
			for (const agent of AGENT_KINDS) {
				refreshLoginState(agent);
			}
		};

		const intervalId = window.setInterval(refreshLoginStates, 5000);
		window.addEventListener("focus", refreshLoginStates);

		return () => {
			isActive = false;
			window.clearInterval(intervalId);
			window.removeEventListener("focus", refreshLoginStates);
		};
	}, [isRunning]);

	useEffect(() => {
		let isActive = true;

		/**
		 * Applies one native process snapshot while the comparison page remains mounted.
		 *
		 * @example
		 * applyProcessStates({ claude: false, codex: true, opencode: false, workbuddy: false });
		 */
		const applyProcessStates = (value: AgentProcessStates) => {
			if (!isActive) {
				return;
			}
			setProcessState({ status: "resolved", value });
		};

		const stopListening = onAgentProcessStatesChanged(applyProcessStates);
		stopListening
			.then(() => checkAgentProcesses())
			.then((value) => {
				if (!isActive) {
					return;
				}
				setProcessState((current) =>
					current.status === "checking"
						? { status: "resolved", value }
						: current,
				);
			})
			.catch(() => {
				if (!isActive) {
					return;
				}
				setProcessState((current) =>
					current.status === "checking" ? { status: "failed" } : current,
				);
			});

		return () => {
			isActive = false;
			stopListening.then(
				(stop) => stop(),
				() => {},
			);
		};
	}, []);

	const agentDisplays = AGENT_KINDS.reduce<
		Record<AgentKind, AgentStatusDisplay>
	>(
		(displays, agent) => {
			displays[agent] = resolveAgentStatus(
				agent,
				loginStates[agent],
				processState,
				t,
			);
			return displays;
		},
		{} as Record<AgentKind, AgentStatusDisplay>,
	);
	const runnableAgents = AGENT_KINDS.filter(
		(agent) => selectedAgents.includes(agent) && agentDisplays[agent].isReady,
	);
	const comparisonAgents = AGENT_KINDS.filter(
		(agent) => runStates[agent].status !== "idle",
	);
	const numberLocale = i18n.resolvedLanguage ?? "en-US";

	/**
	 * Includes or excludes one ready product from the next comparison run.
	 *
	 * @example
	 * toggleAgent("workbuddy");
	 */
	const toggleAgent = (agent: AgentKind) => {
		if (isRunning || !agentDisplays[agent].isReady) {
			return;
		}
		setSelectedAgents((current) =>
			current.includes(agent)
				? current.filter((candidate) => candidate !== agent)
				: [...current, agent],
		);
		setRunStates({
			claude: { status: "idle" },
			codex: { status: "idle" },
			opencode: { status: "idle" },
			qoder: { status: "idle" },
			traecode: { status: "idle" },
			workbuddy: { status: "idle" },
		});
	};

	/**
	 * Sends one query to every selected product concurrently and records each result independently.
	 *
	 * @example
	 * onSubmit(event);
	 */
	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedQuery = query.trim();
		if (
			isRunning ||
			normalizedQuery.length === 0 ||
			runnableAgents.length === 0
		) {
			return;
		}

		const activeAgents = [...runnableAgents];
		const taskLabel =
			normalizedQuery.length > 40
				? `${normalizedQuery.slice(0, 40)}…`
				: normalizedQuery;
		setRunStates({
			claude: activeAgents.includes("claude")
				? { status: "running" }
				: { status: "idle" },
			codex: activeAgents.includes("codex")
				? { status: "running" }
				: { status: "idle" },
			opencode: activeAgents.includes("opencode")
				? { status: "running" }
				: { status: "idle" },
			qoder: activeAgents.includes("qoder")
				? { status: "running" }
				: { status: "idle" },
			traecode: activeAgents.includes("traecode")
				? { status: "running" }
				: { status: "idle" },
			workbuddy: activeAgents.includes("workbuddy")
				? { status: "running" }
				: { status: "idle" },
		});

		const historyResults = await Promise.all(
			activeAgents.map(async (agent) => {
				const loginState = loginStates[agent];
				const loginStatus =
					loginState.status === "resolved" ? loginState.value : null;
				const runtimeStatus =
					loginStatus === null
						? null
						: { ...loginStatus, ...runtimeConfigs[agent] };
				try {
					const result = await AGENT_TASK_RUNNERS[agent](normalizedQuery);
					setRunStates((current) => ({
						...current,
						[agent]: { status: "succeeded", result },
					}));
					Toast.toast.success(
						t("agentRunFinished", {
							task: taskLabel,
							agent: t(`agentNames.${agent}`),
						}),
						{ description: t("viewResult") },
					);
					return {
						agent,
						model: runtimeStatus?.model ?? null,
						reasoningEffort: runtimeStatus?.reasoningEffort ?? null,
						status: "succeeded",
						result,
					} satisfies ComparisonResultInput;
				} catch (error) {
					const errorMessage = getErrorMessage(error, t("requestFailed"));
					setRunStates((current) => ({
						...current,
						[agent]: {
							status: "failed",
							errorMessage,
						},
					}));
					Toast.toast.danger(
						t("agentRunFinished", {
							task: taskLabel,
							agent: t(`agentNames.${agent}`),
						}),
						{ description: t("viewResult") },
					);
					return {
						agent,
						model: runtimeStatus?.model ?? null,
						reasoningEffort: runtimeStatus?.reasoningEffort ?? null,
						status: "failed",
						errorMessage,
					} satisfies ComparisonResultInput;
				}
			}),
		);
		try {
			await saveComparisonHistory({
				query: normalizedQuery,
				results: historyResults,
			});
		} catch {
			Toast.toast.danger(t("comparisonHistory.saveFailed"));
		}
	};

	return (
		<main className="mx-auto max-w-330 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
			<header className="mb-8 border-b border-hairline pb-7">
				<p className="mb-sm text-body-sm font-medium text-body">
					{t("tagline")}
				</p>
				<h1 className="max-w-3xl font-primary text-display-lg font-medium leading-display-lg sm:text-display-xl sm:leading-display-xl">
					{t("title")}
				</h1>
				<p className="mt-md max-w-[65ch] text-body-sm leading-body-md text-body sm:text-body-md">
					{t("description")}
				</p>
			</header>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.35fr)]">
				<section className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
					<header className="flex items-center justify-between gap-lg border-b border-hairline px-lg py-md sm:px-xl">
						<h2 className="text-body-sm-strong font-medium">
							{t("agentSelection")}
						</h2>
						<span className="rounded-full bg-surface-soft px-md py-xs font-mono text-caption-sm text-body tabular-nums">
							{runnableAgents.length} / {AGENT_KINDS.length}
						</span>
					</header>
					<fieldset aria-label={t("agentSelection")}>
						{AGENT_KINDS.map((agent) => {
							const loginState = loginStates[agent];
							const loginStatus =
								loginState.status === "resolved" ? loginState.value : null;
							const runtimeStatus =
								loginStatus === null
									? null
									: { ...loginStatus, ...runtimeConfigs[agent] };
							const isSelected =
								selectedAgents.includes(agent) && agentDisplays[agent].isReady;

							return (
								<AgentSelectionCard
									agent={agent}
									isDisabled={isRunning || !agentDisplays[agent].isReady}
									isSelected={isSelected}
									key={agent}
									onToggle={toggleAgent}
									runtimeStatus={runtimeStatus}
									statusMessage={agentDisplays[agent].message}
									statusTone={agentDisplays[agent].tone}
								/>
							);
						})}
					</fieldset>
				</section>

				<Card className="overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-none">
					<form onSubmit={onSubmit}>
						<Card.Header className="!flex-row !justify-start gap-md border-b border-hairline px-lg py-md sm:px-xl">
							<span className="grid size-8 place-items-center rounded-lg bg-surface-soft text-body">
								<MagicWand aria-hidden="true" className="size-4" />
							</span>
							<p className="text-body-sm-strong font-medium">
								{t("queryLabel")}
							</p>
						</Card.Header>
						<Card.Content className="p-lg sm:p-xl">
							<label
								className="mb-sm block text-body-sm font-medium text-charcoal"
								htmlFor="agent-query"
							>
								{t("queryLabel")}
							</label>
							<TextArea
								className="min-h-56 w-full resize-y rounded-lg border border-hairline bg-canvas p-lg text-body-sm leading-body-md text-ink outline-none transition-colors placeholder:text-mute focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
								disabled={isRunning}
								id="agent-query"
								maxLength={16000}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={t("queryPlaceholder")}
								value={query}
								variant="secondary"
							/>
							<p className="mt-sm text-right font-mono text-caption-sm text-body tabular-nums">
								{query.length.toLocaleString(numberLocale)} / 16,000
							</p>
						</Card.Content>
						<Card.Footer className="flex flex-wrap items-center justify-between gap-md border-t border-hairline bg-surface-soft px-lg py-md sm:px-xl">
							<p className="text-caption-sm text-body">
								{t("selectedAgents", { count: runnableAgents.length })}
							</p>
							<Button
								className="h-9 rounded-full bg-primary px-5 text-button-md font-medium text-on-primary shadow-none transition-transform active:scale-[0.98]"
								isDisabled={
									isRunning ||
									query.trim().length === 0 ||
									runnableAgents.length === 0
								}
								type="submit"
								variant="primary"
							>
								<Play aria-hidden="true" className="size-4" />
								{isRunning
									? t("comparingAgents", { count: runnableAgents.length })
									: t("compareAgents", { count: runnableAgents.length })}
							</Button>
						</Card.Footer>
					</form>
				</Card>
			</div>

			{comparisonAgents.length > 0 ? (
				<section className="mt-8" aria-labelledby="comparison-title">
					<h2
						className="mb-md text-body-sm-strong font-semibold"
						id="comparison-title"
					>
						{t("comparisonTitle")}
					</h2>
					<div className="grid overflow-hidden rounded-xl border border-hairline bg-surface-card lg:grid-cols-4">
						{comparisonAgents.map((agent) => {
							const runState = runStates[agent];

							return (
								<AgentComparisonCard
									agent={agent}
									errorMessage={
										runState.status === "failed" ? runState.errorMessage : null
									}
									isRunning={runState.status === "running"}
									key={agent}
									numberLocale={numberLocale}
									result={
										runState.status === "succeeded" ? runState.result : null
									}
								/>
							);
						})}
					</div>
				</section>
			) : null}
		</main>
	);
};

export { resolveAgentStatus };
export default ComparisonPage;
