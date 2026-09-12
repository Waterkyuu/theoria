import { useState } from "react";
import {
	ArrowUp,
	ChevronDown,
	CircleCheckFill,
	Paperclip,
} from "@gravity-ui/icons";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import {
	ComposerPermissionDropdown,
	ComposerSkillDropdown,
} from "@/components/share/composer-dropdowns";
import type {
	AgentKind,
	AgentProcessStates,
	AgentRuntimeState,
} from "@/types/agent";
import type { Skill } from "@/types/skill";
import type { CreateTaskRequest } from "@/types/task";

type ComposerSubmission = {
	/** Normalized initial Task request. */
	prompt: string;
	/** Agent products with model settings frozen from their latest runtime probe. */
	agents: CreateTaskRequest["agents"];
	/** Explicit Skill Library choices allowed for an ordinary Task. */
	skillIds: string[];
	/** File mutation policy frozen after the first successful submission. */
	fileAccess: CreateTaskRequest["fileAccess"];
	/** Command approval policy frozen after the first successful submission. */
	commandExecution: CreateTaskRequest["commandExecution"];
};

type ComposerProps = {
	/** Agent kinds that can be selected by the composer. */
	agentKinds: readonly AgentKind[];
	/** Latest native process state used to show only running agents. */
	agentProcesses: AgentProcessStates | null;
	/** Runtime details displayed beside each running agent. */
	environmentRuntimes: Record<AgentKind, AgentRuntimeState>;
	/** Skills available for selection or displayed as locked Workspace mounts. */
	availableSkills: Skill[];
	/** Prevents duplicate submission while Task preparation is in progress. */
	isSubmitting: boolean;
	/** Receives the complete immutable Task selection after submission. */
	onSubmit: (submission: ComposerSubmission) => Promise<void>;
	/** True when Skills come from Workspace mounts instead of per-Task choices. */
	workspaceSkillsLocked: boolean;
	/** Workspace shown below the composer, or undefined on the homepage. */
	workspaceName?: string;
};

/**
 * Keeps task composition state together while the page owns environment loading and results.
 * Dropdown primitives manage dismissal and focus without changing the compact toolbar styling.
 *
 * @example
 * <Composer
 *   agentKinds={["codex"]}
 *   agentProcesses={processes}
 *   environmentRuntimes={runtimes}
 *   availableSkills={skills}
 *   isSubmitting={false}
 *   onSubmit={dispatchTask}
 *   workspaceSkillsLocked={false}
 * />
 */
const Composer = ({
	agentKinds,
	agentProcesses,
	environmentRuntimes,
	availableSkills,
	isSubmitting,
	onSubmit,
	workspaceSkillsLocked,
	workspaceName,
}: ComposerProps) => {
	const { t } = useTranslation();
	const [prompt, setPrompt] = useState("");
	const [selectedAgents, setSelectedAgents] = useState<AgentKind[]>([]);
	const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
	const [fileAccess, setFileAccess] =
		useState<CreateTaskRequest["fileAccess"]>("allow_edits");
	const [commandExecution, setCommandExecution] =
		useState<CreateTaskRequest["commandExecution"]>("allow");
	const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
	const isSlashAutocompleteOpen =
		isAgentMenuOpen || prompt.trimEnd().endsWith("/");

	/** Freezes the latest runtime settings so later global changes cannot alter this Task. */
	const submitTask = async () => {
		const task = prompt.trim();
		if (!task || selectedAgents.length === 0 || isSubmitting) return;
		const agents = selectedAgents.map((agentKind) => {
			const runtimeState = environmentRuntimes[agentKind];
			const runtime =
				runtimeState.status === "resolved" ? runtimeState.value : null;
			return {
				agentKind,
				model: runtime?.model ?? null,
				mode: runtime?.reasoningEffort ?? null,
			};
		});
		await onSubmit({
			prompt: task,
			agents,
			skillIds: workspaceSkillsLocked ? [] : selectedSkillIds,
			fileAccess,
			commandExecution,
		});
		setPrompt("");
		setIsAgentMenuOpen(false);
	};

	return (
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
							{agentKinds
								.filter((agent) => agentProcesses?.[agent])
								.map((agent) => {
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
								})}
						</div>
					</div>
				) : null}

				<div className="rounded-2xl border border-hairline-strong bg-surface-card shadow-md">
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

							<ComposerSkillDropdown
								availableSkills={availableSkills}
								selectedSkillIds={selectedSkillIds}
								onSelectionChange={setSelectedSkillIds}
								workspaceSkillsLocked={workspaceSkillsLocked}
							/>
						</div>
						<div className="flex shrink-0 items-center gap-md">
							<ComposerPermissionDropdown
								fileAccess={fileAccess}
								commandExecution={commandExecution}
								onFileAccessChange={setFileAccess}
								onCommandExecutionChange={setCommandExecution}
							/>
							<button
								aria-label={t("workspace.sendTask")}
								className="grid size-8 place-items-center rounded-full bg-primary text-on-primary outline-none transition-transform enabled:active:scale-95 disabled:cursor-not-allowed disabled:bg-hairline-strong"
								disabled={
									!prompt.trim() || selectedAgents.length === 0 || isSubmitting
								}
								onClick={() => submitTask()}
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
					<span>{t("workspace.composerHint")}</span>
					{workspaceName ? (
						<span className="hidden sm:inline">
							{t("workspace.workspacePath", {
								workspace: workspaceName,
							})}
						</span>
					) : null}
				</div>
			</div>
		</div>
	);
};

export type { ComposerSubmission };
export { Composer };
