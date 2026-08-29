import { useEffect, useState } from "react";
import {
	ArrowUp,
	ChevronDown,
	CircleCheckFill,
	CodeTrunk,
	Paperclip,
	Puzzle,
	ShieldCheck,
	Sliders,
} from "@gravity-ui/icons";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentEnvironmentDropdown } from "@/components/share/agent-environment-dropdown";
import { AgentIcon } from "@/components/share/agent-icon";
import { checkAgentProcesses, onAgentProcessStatesChanged } from "@/api/agent";
import { checkClaudeLogin } from "@/api/claude";
import { checkCodexLogin } from "@/api/codex";
import { checkOpenCodeLogin } from "@/api/opencode";
import { checkWorkBuddyConfig, checkWorkBuddyLogin } from "@/api/workbuddy";
import type {
	AgentKind,
	AgentProcessStates,
	AgentRuntimeState,
	AgentRuntimeStatus,
} from "@/types/agent";

type WorkspacePageProps = {
	/** Workspace shown by the composer, or undefined for the unbound homepage. */
	workspaceName?: string;
};

const AGENT_KINDS = ["codex", "claude", "opencode", "workbuddy"] as const;

const AGENT_LOGIN_CHECKS: Record<AgentKind, () => Promise<AgentRuntimeStatus>> =
	{
		claude: checkClaudeLogin,
		codex: checkCodexLogin,
		opencode: checkOpenCodeLogin,
		workbuddy: checkWorkBuddyLogin,
	};

const INITIAL_ENVIRONMENT_RUNTIMES = Object.fromEntries(
	AGENT_KINDS.map((agent) => [agent, { status: "checking" }]),
) as Record<AgentKind, AgentRuntimeState>;

const WorkspacePage = ({ workspaceName }: WorkspacePageProps) => {
	const { t } = useTranslation();
	const [prompt, setPrompt] = useState("");
	const [selectedAgents, setSelectedAgents] = useState<AgentKind[]>([]);
	const [mode, setMode] = useState<"explore" | "benchmark">("explore");
	const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
	const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
	const [isSkillMenuOpen, setIsSkillMenuOpen] = useState(false);
	const [submittedTask, setSubmittedTask] = useState<string | null>(null);
	const [environmentRuntimes, setEnvironmentRuntimes] = useState(
		INITIAL_ENVIRONMENT_RUNTIMES,
	);
	const [agentProcesses, setAgentProcesses] =
		useState<AgentProcessStates | null>(null);

	const isSlashAutocompleteOpen =
		isAgentMenuOpen || prompt.trimEnd().endsWith("/");

	useEffect(() => {
		let isActive = true;

		Promise.all(
			AGENT_KINDS.map(async (agent) => {
				try {
					const runtime = await AGENT_LOGIN_CHECKS[agent]();
					if (agent !== "workbuddy" || !runtime.loggedIn) {
						return [agent, { status: "resolved", value: runtime }] as const;
					}

					try {
						const config = await checkWorkBuddyConfig();
						return [
							agent,
							{ status: "resolved", value: { ...runtime, ...config } },
						] as const;
					} catch {
						return [agent, { status: "resolved", value: runtime }] as const;
					}
				} catch {
					return [agent, { status: "failed" }] as const;
				}
			}),
		).then((entries) => {
			if (isActive) {
				setEnvironmentRuntimes(
					Object.fromEntries(entries) as Record<AgentKind, AgentRuntimeState>,
				);
			}
		});

		return () => {
			isActive = false;
		};
	}, []);

	useEffect(() => {
		let isActive = true;

		/**
		 * Applies native process snapshots only while this Workspace remains mounted.
		 *
		 * @example
		 * applyProcessStates({ claude: false, codex: true, opencode: false, workbuddy: false });
		 */
		const applyProcessStates = (states: AgentProcessStates) => {
			if (isActive) {
				setAgentProcesses(states);
			}
		};

		const stopListening = onAgentProcessStatesChanged(applyProcessStates);
		stopListening
			.then(() => checkAgentProcesses())
			.then((states) => {
				if (isActive) {
					setAgentProcesses((current) => current ?? states);
				}
			})
			.catch(() => {
				// A later native event can still supply a valid process snapshot.
			});

		return () => {
			isActive = false;
			stopListening.then(
				(stop) => stop(),
				() => {},
			);
		};
	}, []);

	/** Keeps the local prototype honest by showing a completed dispatch state after submission. */
	const submitTask = () => {
		const task = prompt.trim();
		if (!task || selectedAgents.length === 0) return;
		setSubmittedTask(task);
		setPrompt("");
		setIsAgentMenuOpen(false);
	};

	return (
		<main className="relative flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			{workspaceName ? (
				<header className="flex h-[34px] shrink-0 items-center justify-between border-b border-hairline px-4 sm:px-xl">
					<p className="truncate text-body-sm font-medium text-charcoal">
						{t("workspace.breadcrumb")}
					</p>
					<div className="hidden items-center gap-sm text-caption-sm text-body sm:flex">
						<CodeTrunk aria-hidden="true" className="size-4" />
						<span>{t("workspace.workspacePath")}</span>
					</div>
				</header>
			) : null}

			<section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-48 pt-lg sm:px-xl sm:pt-xl">
				<div className="mx-auto flex w-full max-w-195 flex-1 flex-col justify-center">
					{submittedTask && (
						<div className="space-y-lg">
							<div className="ml-auto max-w-[90%] rounded-lg bg-surface-dark px-lg py-md text-body-sm text-on-dark sm:max-w-[72%]">
								{submittedTask}
							</div>
							<div className="flex items-center gap-sm text-body-sm text-body">
								<CircleCheckFill
									aria-hidden="true"
									className="size-4 text-ink"
								/>
								{t("workspace.dispatched", { count: selectedAgents.length })}
							</div>
						</div>
					)}
				</div>
			</section>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-canvas via-canvas to-transparent px-3 pb-3 pt-16 sm:px-xl sm:pb-xl">
				<div className="pointer-events-auto relative mx-auto max-w-180">
					{isSlashAutocompleteOpen ? (
						<div className="absolute inset-x-0 bottom-[calc(100%+8px)] overflow-hidden rounded-lg border border-hairline bg-surface-card shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
							<div className="flex items-center justify-between border-b border-hairline px-lg py-sm">
								<p className="text-caption-sm font-medium text-charcoal">
									{t("workspace.runningAgents")}
								</p>
								<span className="text-caption-sm text-mute">/agent</span>
							</div>
							<div
								aria-label={t("workspace.runningAgents")}
								className="p-sm"
								role="listbox"
							>
								{AGENT_KINDS.filter((agent) => agentProcesses?.[agent]).map(
									(agent) => {
										const isSelected = selectedAgents.includes(agent);
										const runtimeState = environmentRuntimes[agent];
										const runtime =
											runtimeState.status === "resolved"
												? runtimeState.value
												: null;
										const runtimeSummary = [
											runtime?.model,
											runtime?.reasoningEffort,
										]
											.filter(Boolean)
											.join(" · ");
										return (
											<button
												aria-selected={isSelected}
												className="flex w-full items-center gap-md rounded-md px-md py-sm text-left outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
												key={agent}
												onClick={() => {
													setSelectedAgents((current) =>
														current.includes(agent)
															? current.filter((kind) => kind !== agent)
															: [...current, agent],
													);
													setPrompt((current) => current.replace(/\/$/, ""));
													setIsAgentMenuOpen(false);
												}}
												role="option"
												type="button"
											>
												<span className="grid size-8 place-items-center rounded-md border border-hairline bg-canvas">
													<AgentIcon name={agent} width={16} height={16} />
												</span>
												<span className="min-w-0 flex-1">
													<span className="block text-body-sm font-medium">
														{t(`agentNames.${agent}`)}
													</span>
													<span className="block text-caption-sm text-body">
														{runtimeState.status === "checking"
															? t("checkingLogin", {
																	agent: t(`agentNames.${agent}`),
																})
															: runtimeState.status === "failed"
																? t("loginCheckFailed", {
																		agent: t(`agentNames.${agent}`),
																	})
																: runtimeSummary || t("metricUnavailable")}
													</span>
												</span>
												<span className="flex items-center gap-xs text-caption-sm text-body">
													<span className="size-1.5 rounded-full bg-terminal-green" />
													{t("workspace.started")}
												</span>
												{isSelected ? (
													<CircleCheckFill
														aria-hidden="true"
														className="size-4"
													/>
												) : null}
											</button>
										);
									},
								)}
							</div>
						</div>
					) : null}

					<div className="rounded-lg border border-hairline-strong bg-surface-card shadow-[0_12px_36px_rgba(0,0,0,0.08)] focus-within:border-charcoal">
						<label className="sr-only" htmlFor="workspace-composer">
							{t("workspace.taskLabel")}
						</label>
						<textarea
							aria-label={t("workspace.taskLabel")}
							className="block min-h-24 w-full resize-none bg-transparent px-lg pb-sm pt-lg text-body-sm text-ink outline-none placeholder:text-mute"
							id="workspace-composer"
							onChange={(event) => setPrompt(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									submitTask();
								}
							}}
							placeholder={t("workspace.composerPlaceholder")}
							value={prompt}
						/>
						<div className="flex flex-wrap items-center justify-between gap-sm border-t border-hairline px-sm py-sm sm:flex-nowrap sm:gap-md">
							<div className="flex min-w-0 flex-wrap items-center gap-xs">
								<button
									aria-label={t("workspace.attachFiles")}
									className="grid size-8 place-items-center rounded-md text-body hover:bg-surface-soft hover:text-ink"
									type="button"
								>
									<Paperclip aria-hidden="true" className="size-4" />
								</button>
								<button
									aria-expanded={isAgentMenuOpen}
									aria-label={t("workspace.selectedAgentCount", {
										count: selectedAgents.length,
									})}
									className="flex h-8 items-center gap-sm rounded-md px-sm text-caption-sm text-charcoal hover:bg-surface-soft"
									onClick={() => setIsAgentMenuOpen((open) => !open)}
									type="button"
								>
									<div className="flex -space-x-1.5">
										{selectedAgents.slice(0, 3).map((agent) => (
											<span
												className="grid size-5 place-items-center rounded-full border border-canvas bg-surface-soft"
												key={agent}
											>
												<AgentIcon name={agent} width={12} height={12} />
											</span>
										))}
									</div>
									<span>{selectedAgents.length}</span>
									<ChevronDown aria-hidden="true" className="size-3" />
								</button>

								<div className="relative">
									<button
										aria-expanded={isModeMenuOpen}
										aria-label={t(
											mode === "explore"
												? "workspace.exploreMode"
												: "workspace.benchmarkMode",
										)}
										className="flex h-8 items-center gap-xs rounded-md px-sm text-caption-sm text-charcoal hover:bg-surface-soft"
										onClick={() => setIsModeMenuOpen((open) => !open)}
										type="button"
									>
										<Sliders aria-hidden="true" className="size-3.5" />
										<span className="max-[420px]:hidden">
											{t(
												mode === "explore"
													? "workspace.exploreMode"
													: "workspace.benchmarkMode",
											)}
										</span>
									</button>
									{isModeMenuOpen ? (
										<div
											aria-label={t("workspace.modeSelection")}
											className="absolute bottom-[calc(100%+8px)] left-0 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-hairline bg-canvas p-sm shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
											role="listbox"
										>
											{(["explore", "benchmark"] as const).map((item) => (
												<button
													aria-label={t(
														item === "explore"
															? "workspace.exploreMode"
															: "workspace.benchmarkMode",
													)}
													aria-selected={mode === item}
													className="block w-full rounded-md px-md py-sm text-left hover:bg-surface-soft"
													key={item}
													onClick={() => {
														setMode(item);
														setIsModeMenuOpen(false);
													}}
													role="option"
													type="button"
												>
													<span className="block text-body-sm font-medium">
														{t(
															item === "explore"
																? "workspace.exploreMode"
																: "workspace.benchmarkMode",
														)}
													</span>
													<span className="mt-xs block text-caption-sm text-body">
														{t(
															item === "explore"
																? "workspace.exploreDescription"
																: "workspace.benchmarkDescription",
														)}
													</span>
												</button>
											))}
										</div>
									) : null}
								</div>

								<div className="relative">
									<button
										aria-expanded={isSkillMenuOpen}
										aria-label={t("workspace.mountedSkillCount", {
											count: 0,
										})}
										className="flex h-8 items-center gap-xs rounded-md px-sm text-caption-sm text-charcoal hover:bg-surface-soft"
										onClick={() => setIsSkillMenuOpen((open) => !open)}
										type="button"
									>
										<Puzzle aria-hidden="true" className="size-3.5" />
										<span>0</span>
									</button>
									{isSkillMenuOpen ? (
										<div
											aria-label={t("workspace.skillSelection")}
											className="absolute bottom-[calc(100%+8px)] left-0 w-56 rounded-lg border border-hairline bg-canvas p-sm shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
											role="listbox"
										></div>
									) : null}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-md">
								<span className="hidden items-center gap-xs text-caption-sm text-body min-[1040px]:flex">
									<ShieldCheck aria-hidden="true" className="size-3.5" />
									{t("workspace.permission")}
								</span>
								<button
									aria-label={t("workspace.sendTask")}
									className="grid size-8 place-items-center rounded-md bg-primary text-on-primary outline-none transition-transform enabled:active:scale-95 disabled:cursor-not-allowed disabled:bg-hairline-strong"
									disabled={!prompt.trim() || selectedAgents.length === 0}
									onClick={submitTask}
									type="button"
								>
									<ArrowUp aria-hidden="true" className="size-4" />
								</button>
							</div>
						</div>
					</div>
					<div
						className={cn(
							"mt-sm px-sm text-[11px] text-mute",
							workspaceName && "flex items-center justify-between",
						)}
					>
						<span>
							{mode === "benchmark"
								? t("workspace.benchmarkNotice")
								: t("workspace.composerHint")}
						</span>
						{workspaceName ? (
							<span className="hidden sm:inline">
								{t("workspace.workspacePath")}
							</span>
						) : null}
					</div>
				</div>
			</div>

			<AgentEnvironmentDropdown
				agentKinds={AGENT_KINDS}
				agentProcesses={agentProcesses}
				environmentRuntimes={environmentRuntimes}
			/>

			{mode === "benchmark" ? (
				<div
					className={cn(
						"absolute right-6 top-20 z-10 max-w-sm rounded-md border border-hairline bg-surface-soft px-md py-sm text-caption-sm text-charcoal",
					)}
				>
					<p className="font-medium">{t("workspace.benchmarkNotice")}</p>
					<p className="mt-xs text-body">
						{t("workspace.benchmarkNoticeDetail")}
					</p>
				</div>
			) : null}
		</main>
	);
};

export default WorkspacePage;
