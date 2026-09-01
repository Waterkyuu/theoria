import { useState } from "react";
import { ArrowUp } from "@gravity-ui/icons";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
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
				<div className="flex items-center gap-xs overflow-x-auto border-b border-hairline px-sm py-sm">
					<button
						aria-pressed={selectedTarget === "all"}
						className="h-7 shrink-0 rounded-md px-sm text-caption-sm font-medium text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring aria-pressed:bg-surface-soft aria-pressed:text-ink"
						onClick={() => setTargetId("all")}
						type="button"
					>
						{t("taskFollowUp.allAgents")}
					</button>
					{resumableAgents.map((agent) => (
						<button
							aria-label={t("taskFollowUp.targetAgent", {
								agent: t(`agentNames.${agent.agentKind}`),
							})}
							aria-pressed={selectedTarget === agent.id}
							className="flex h-7 shrink-0 items-center gap-xs rounded-md px-sm text-caption-sm text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring aria-pressed:bg-surface-soft aria-pressed:text-ink"
							key={agent.id}
							onClick={() => setTargetId(agent.id)}
							type="button"
						>
							<AgentIcon name={agent.agentKind} width={14} height={14} />
							{t(`agentNames.${agent.agentKind}`)}
						</button>
					))}
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
