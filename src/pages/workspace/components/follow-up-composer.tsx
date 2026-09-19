import { useState } from "react";
import { ArrowUp, ChevronDown } from "@gravity-ui/icons";
import { Dropdown } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import type { TaskAgent } from "@/types/task";

type FollowUpComposerProps = {
	/** Frozen Agent Executions that may receive another message. */
	agents: TaskAgent[];
	/** Prevents duplicate messages while native sessions are running. */
	isSubmitting: boolean;
	/** Sends one trimmed message to every resumable Agent or one selected Agent. */
	onSubmit: (prompt: string, taskAgentIds: string[]) => Promise<void>;
};

/**
 * Adds a compact continuation control without exposing locked Task configuration.
 *
 * @example
 * <FollowUpComposer agents={agents} isSubmitting={false} onSubmit={continueTask} />
 */
const FollowUpComposer = ({
	agents,
	isSubmitting,
	onSubmit,
}: FollowUpComposerProps) => {
	const { t } = useTranslation();
	const [prompt, setPrompt] = useState("");
	const [targetId, setTargetId] = useState<"all" | string>("all");
	const resumableAgents = agents.filter(
		(agent) => agent.status === "completed" || agent.status === "waiting",
	);
	if (resumableAgents.length === 0) return null;
	const selectedTarget =
		targetId === "all" || resumableAgents.some((agent) => agent.id === targetId)
			? targetId
			: "all";
	const selectedAgent = resumableAgents.find(
		(agent) => agent.id === selectedTarget,
	);
	const selectedTargetLabel = selectedAgent
		? t(`agentNames.${selectedAgent.agentKind}`)
		: t("taskFollowUp.allAgents");
	const hiddenAgentCount = Math.max(resumableAgents.length - 3, 0);

	/** Sends the current message and retains the selected target for the next turn. */
	const submitFollowUp = async () => {
		const message = prompt.trim();
		if (!message || isSubmitting) return;
		await onSubmit(message, selectedTarget === "all" ? [] : [selectedTarget]);
		setPrompt("");
	};

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-canvas via-canvas to-transparent px-3 pb-3 pt-12 sm:px-xl sm:pb-xl">
			<div className="pointer-events-auto mx-auto max-w-180 rounded-2xl border border-hairline-strong bg-surface-card shadow-md">
				<div className="flex items-center border-b border-hairline px-sm py-sm">
					<DropdownMenu
						aria-label={t("taskFollowUp.agentSelection")}
						className="w-72 max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-hairline bg-canvas p-sm shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
						menuClassName="max-h-72 overflow-y-auto p-0"
						placement="top start"
						selectedKeys={[selectedTarget]}
						selectionMode="single"
						trigger={
							<Dropdown.Trigger
								aria-label={t("taskFollowUp.agentSelectionSummary", {
									count: resumableAgents.length,
									target: selectedTargetLabel,
								})}
								className="flex h-7 max-w-full items-center gap-sm rounded-md px-sm text-caption-sm text-charcoal outline-none hover:bg-surface-soft active:scale-100 focus-visible:ring-2 focus-visible:ring-focus-ring data-[pressed=true]:scale-100"
								type="button"
							>
								<span className="shrink-0 text-caption-sm font-medium leading-4 text-ink">
									{selectedTargetLabel}
								</span>
								<span aria-hidden="true" className="flex -space-x-2.5 isolate">
									{resumableAgents.slice(0, 3).map((agent) => (
										<span
											className="relative grid size-5 place-items-center"
											key={agent.id}
										>
											<AgentIcon
												height={20}
												name={agent.agentKind}
												width={20}
											/>
										</span>
									))}
								</span>
								{hiddenAgentCount > 0 ? (
									<span className="text-[11px] tabular-nums text-body">
										+{hiddenAgentCount}
									</span>
								) : null}
								<ChevronDown aria-hidden="true" className="size-3 shrink-0" />
							</Dropdown.Trigger>
						}
					>
						<Dropdown.Item
							className="flex w-full items-center justify-between rounded-md px-md py-sm text-body-sm hover:bg-surface-soft"
							id="all"
							onAction={() => setTargetId("all")}
							textValue={t("taskFollowUp.allAgents")}
						>
							<span className="font-medium">{t("taskFollowUp.allAgents")}</span>
							<span className="text-caption-sm text-mute">
								{resumableAgents.length}
							</span>
						</Dropdown.Item>
						{resumableAgents.map((agent) => {
							const agentName = t(`agentNames.${agent.agentKind}`);
							const model = agent.modelSnapshot ?? t("unknownModel");
							return (
								<Dropdown.Item
									aria-label={`${agentName} ${model}`}
									className="flex w-full items-center gap-sm rounded-md px-md py-sm text-left hover:bg-surface-soft"
									id={agent.id}
									key={agent.id}
									onAction={() => setTargetId(agent.id)}
									textValue={`${agentName} ${model}`}
								>
									<span className="grid size-7 shrink-0 place-items-center">
										<AgentIcon height={16} name={agent.agentKind} width={16} />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block text-body-sm font-medium text-ink">
											{agentName}
										</span>
										<span className="block truncate font-mono text-caption-sm text-mute">
											{model}
										</span>
									</span>
								</Dropdown.Item>
							);
						})}
					</DropdownMenu>
				</div>
				<div className="flex items-end gap-sm px-lg py-md">
					<label className="sr-only" htmlFor="task-follow-up">
						{t("taskFollowUp.label")}
					</label>
					<textarea
						aria-label={t("taskFollowUp.label")}
						className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-sm text-body-sm text-ink outline-none placeholder:text-mute"
						disabled={isSubmitting}
						id="task-follow-up"
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								submitFollowUp();
							}
						}}
						placeholder={t("taskFollowUp.placeholder")}
						rows={1}
						value={prompt}
					/>
					<button
						aria-label={t("taskFollowUp.send")}
						className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-canvas outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-35"
						disabled={!prompt.trim() || isSubmitting}
						onClick={submitFollowUp}
						type="button"
					>
						<ArrowUp aria-hidden="true" className="size-4" />
					</button>
				</div>
			</div>
		</div>
	);
};

export { FollowUpComposer };
