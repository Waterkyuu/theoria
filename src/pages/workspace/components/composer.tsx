import { useState } from "react";
import {
	ArrowUp,
	ChevronDown,
	CircleCheckFill,
	Paperclip,
	Puzzle,
	ShieldCheck,
} from "@gravity-ui/icons";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
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
	const [isSkillMenuOpen, setIsSkillMenuOpen] = useState(false);
	const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false);
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

							<div className="relative">
								<button
									aria-expanded={isSkillMenuOpen}
									aria-label={t("workspace.mountedSkillCount", {
										count: workspaceSkillsLocked
											? availableSkills.length
											: selectedSkillIds.length,
									})}
									className="flex h-8 items-center gap-xs rounded-md px-sm text-caption-sm text-charcoal hover:bg-surface-soft"
									onClick={() => setIsSkillMenuOpen((open) => !open)}
									type="button"
								>
									<Puzzle aria-hidden="true" className="size-3.5" />
									<span>
										{workspaceSkillsLocked
											? availableSkills.length
											: selectedSkillIds.length}
									</span>
								</button>
								{isSkillMenuOpen ? (
									<div
										aria-label={t("workspace.skillSelection")}
										className="absolute bottom-[calc(100%+8px)] left-0 max-h-64 w-64 overflow-y-auto rounded-lg border border-hairline bg-canvas p-sm shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
										role="listbox"
									>
										{availableSkills.length > 0 ? (
											availableSkills.map((skill) => {
												const selected =
													workspaceSkillsLocked ||
													selectedSkillIds.includes(skill.id);
												return (
													<button
														aria-selected={selected}
														className="flex w-full items-start gap-sm rounded-md px-md py-sm text-left hover:bg-surface-soft disabled:cursor-default"
														disabled={workspaceSkillsLocked}
														key={skill.id}
														onClick={() =>
															setSelectedSkillIds((current) =>
																current.includes(skill.id)
																	? current.filter((id) => id !== skill.id)
																	: [...current, skill.id],
															)
														}
														role="option"
														type="button"
													>
														<Puzzle
															aria-hidden="true"
															className="mt-xs size-4"
														/>
														<span className="min-w-0 flex-1">
															<span className="block truncate text-body-sm font-medium">
																{skill.displayName}
															</span>
															<span className="line-clamp-2 text-caption-sm text-body">
																{skill.description}
															</span>
														</span>
														{selected ? (
															<CircleCheckFill
																aria-hidden="true"
																className="size-4"
															/>
														) : null}
													</button>
												);
											})
										) : (
											<p className="px-md py-sm text-caption-sm text-mute">
												{t("workspace.noSkills")}
											</p>
										)}
									</div>
								) : null}
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-md">
							<div className="relative hidden min-[1040px]:block">
								<button
									aria-expanded={isPermissionMenuOpen}
									aria-label={t("workspace.permission")}
									className="flex h-8 items-center gap-xs rounded-md px-sm text-caption-sm text-body outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
									onClick={() => setIsPermissionMenuOpen((open) => !open)}
									type="button"
								>
									<ShieldCheck aria-hidden="true" className="size-3.5" />
									{t(
										fileAccess === "allow_edits"
											? "workspace.permission"
											: "workspace.permissionReadOnly",
									)}
								</button>
								{isPermissionMenuOpen ? (
									<fieldset
										aria-label={t("workspace.permissionSelection")}
										className="absolute bottom-[calc(100%+8px)] right-0 w-64 rounded-lg border border-hairline bg-canvas p-sm shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
									>
										<p className="px-md pb-xs text-[11px] font-medium uppercase text-mute">
											{t("workspace.filePermission")}
										</p>
										{(["read_only", "allow_edits"] as const).map((access) => (
											<button
												aria-label={t(
													access === "read_only"
														? "workspace.permissionReadOnly"
														: "workspace.permissionAllowEdits",
												)}
												aria-selected={fileAccess === access}
												className="flex w-full items-center justify-between rounded-md px-md py-sm text-left text-body-sm hover:bg-surface-soft"
												key={access}
												onClick={() => setFileAccess(access)}
												role="option"
												type="button"
											>
												{t(
													access === "read_only"
														? "workspace.permissionReadOnly"
														: "workspace.permissionAllowEdits",
												)}
												{fileAccess === access ? (
													<CircleCheckFill
														aria-hidden="true"
														className="size-4"
													/>
												) : null}
											</button>
										))}
										<p className="mt-xs border-t border-hairline px-md pb-xs pt-sm text-[11px] font-medium uppercase text-mute">
											{t("workspace.commandPermission")}
										</p>
										{(["deny", "ask", "allow"] as const).map((permission) => (
											<button
												aria-label={t(
													`workspace.commandPermissionOption.${permission}`,
												)}
												aria-selected={commandExecution === permission}
												className="flex w-full items-center justify-between rounded-md px-md py-sm text-left text-body-sm hover:bg-surface-soft"
												key={permission}
												onClick={() => setCommandExecution(permission)}
												role="option"
												type="button"
											>
												{t(`workspace.commandPermissionOption.${permission}`)}
												{commandExecution === permission ? (
													<CircleCheckFill
														aria-hidden="true"
														className="size-4"
													/>
												) : null}
											</button>
										))}
									</fieldset>
								) : null}
							</div>
							<button
								aria-label={t("workspace.sendTask")}
								className="grid size-8 place-items-center rounded-md bg-primary text-on-primary outline-none transition-transform enabled:active:scale-95 disabled:cursor-not-allowed disabled:bg-hairline-strong"
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
