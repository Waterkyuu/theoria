import { Ellipsis } from "@gravity-ui/icons";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import type {
	TaskAgent,
	TaskAgentResult,
	TaskAgentTurn,
	TaskStatus,
} from "@/types/task";

type AgentPanelProps = {
	/** Frozen Agent Execution represented by this panel. */
	agent: TaskAgent;
	/** Initial Task prompt shared by every sibling Agent. */
	prompt: string;
	/** Collected terminal result when execution has finished. */
	result?: TaskAgentResult;
	/** Ordered exchanges preserved for this Agent session. */
	turns?: TaskAgentTurn[];
	/** Requests cooperative cancellation for only this Agent. */
	onStop: (taskAgentId: string) => void;
	/** Prevents repeated stop requests while native state is updating. */
	stopPending: boolean;
};

type ToolCallSummary = {
	name: string;
	durationMs: number | null;
};

const STATUS_DOT_CLASSES: Record<TaskStatus, string> = {
	preparing: "bg-terminal-yellow",
	running: "bg-ink",
	waiting: "bg-terminal-yellow",
	completed: "bg-terminal-green",
	failed: "bg-terminal-red",
	stopped: "bg-terminal-red",
};

/**
 * Reads a nested metric object without weakening the validated IPC boundary.
 *
 * @example
 * readMetricObject(result.metrics, "tokenUsage");
 */
const readMetricObject = (
	metrics: Record<string, unknown> | undefined,
	key: string,
) => {
	const value = metrics?.[key];
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
};

/**
 * Reads an optional numeric metric used in the compact footer.
 *
 * @example
 * readMetricNumber(result.metrics, "totalDurationMs");
 */
const readMetricNumber = (
	metrics: Record<string, unknown> | undefined,
	key: string,
) => {
	const value = metrics?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/**
 * Returns the latest persisted tool call that contains a usable name.
 *
 * @example
 * readLatestToolCall(result.metrics);
 */
const readLatestToolCall = (
	metrics: Record<string, unknown> | undefined,
): ToolCallSummary | null => {
	const value = metrics?.toolCalls;
	if (!Array.isArray(value)) return null;
	for (let index = value.length - 1; index >= 0; index -= 1) {
		const item = value[index];
		if (typeof item !== "object" || item === null || Array.isArray(item))
			continue;
		const record = item as Record<string, unknown>;
		if (typeof record.name !== "string" || !record.name.trim()) continue;
		return {
			name: record.name,
			durationMs:
				typeof record.durationMs === "number" &&
				Number.isFinite(record.durationMs)
					? record.durationMs
					: null,
		};
	}
	return null;
};

/**
 * Formats milliseconds using the compact duration shown in the Figma footer.
 *
 * @example
 * formatDuration(134000); // "2m 14s"
 */
const formatDuration = (milliseconds: number | null) => {
	if (milliseconds === null) return "-";
	const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

/**
 * Formats a token count without hiding the source Agent's reported precision.
 *
 * @example
 * formatTokens(18400); // "18.4k"
 */
const formatTokens = (total: number | null) => {
	if (total === null) return "-";
	if (total < 1000) return String(total);
	const compact = (total / 1000).toFixed(1);
	return `${compact.replace(/\.0$/, "")}k`;
};

/**
 * Renders the four-state transcript panel defined by Figma node 25:247.
 *
 * @example
 * <AgentPanel agent={agent} prompt={prompt} result={result} onStop={stopAgent} stopPending={false} />
 */
const AgentPanel = ({
	agent,
	prompt,
	result,
	turns = [],
	onStop,
	stopPending,
}: AgentPanelProps) => {
	const { t } = useTranslation();
	const canStop =
		agent.status === "preparing" ||
		agent.status === "running" ||
		agent.status === "waiting";
	const metadata = [agent.modelSnapshot, agent.modeSnapshot]
		.filter(Boolean)
		.join(" ");
	const tokenUsage = readMetricObject(result?.metrics, "tokenUsage");
	const totalTokens = readMetricNumber(tokenUsage, "totalTokens");
	const totalDuration = readMetricNumber(result?.metrics, "totalDurationMs");
	const exchanges: TaskAgentTurn[] =
		turns.length > 0
			? turns
			: [
					{
						taskAgentId: agent.id,
						sequence: 0,
						prompt,
						finalStatus: agent.status,
						responseText: result?.responseText ?? null,
						metrics: result?.metrics ?? {},
						createdAtMs: 0,
					},
				];
	const isTerminal = ["completed", "failed", "stopped"].includes(agent.status);

	return (
		<section
			aria-label={`${t(`agentNames.${agent.agentKind}`)} ${t("taskPanel.panel")}`}
			className="flex h-125 min-w-70 flex-1 flex-col overflow-hidden rounded-xl border border-hairline bg-surface-card"
		>
			<header className="flex h-16 shrink-0 items-center gap-[10px] overflow-hidden border-b border-hairline px-4">
				<span className="grid size-6 shrink-0 place-items-center overflow-hidden">
					<AgentIcon name={agent.agentKind} width={24} height={24} />
				</span>
				<p className="min-w-0 flex-1 truncate text-[12px] text-mute">
					{metadata || t("metricUnavailable")}
				</p>
				<span className="flex shrink-0 items-center gap-[6px] text-[12px] font-medium text-charcoal">
					<span
						aria-hidden="true"
						className={`size-2 rounded-full ${STATUS_DOT_CLASSES[agent.status]}`}
					/>
					{t(`taskPanel.status.${agent.status}`)}
				</span>
				<button
					aria-label={t("taskPanel.run.moreActions", {
						agent: t(`agentNames.${agent.agentKind}`),
					})}
					className="grid size-4 shrink-0 place-items-center text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
					type="button"
				>
					<Ellipsis aria-hidden="true" className="size-4" />
				</button>
			</header>

			<div className="flex h-97 min-h-0 shrink-0 flex-col overflow-y-auto bg-surface-card p-4">
				<div className="space-y-4">
					{exchanges.map((exchange) => {
						const latestToolCall = readLatestToolCall(exchange.metrics);
						const output =
							exchange.responseText || t(`taskPanel.process.${agent.status}`);
						return (
							<div key={`${agent.id}-${exchange.sequence}`}>
								<div className="rounded-lg bg-surface-soft px-3 py-[10px]">
									<p className="text-[10px] font-medium text-mute">
										{t("taskPanel.run.you")}
									</p>
									<p className="mt-[2px] whitespace-pre-wrap text-[14px] leading-[18px] text-ink">
										{exchange.prompt}
									</p>
								</div>

								{latestToolCall ? (
									<div className="mt-3 rounded-lg bg-surface-soft px-3 py-[10px]">
										<p className="truncate font-mono text-[12px] text-ink">
											{latestToolCall.name}
										</p>
										<p className="mt-[6px] text-[12px] text-charcoal">
											{latestToolCall.durationMs === null
												? t("taskPanel.run.toolCompleted")
												: t("taskPanel.run.toolDuration", {
														duration: formatDuration(latestToolCall.durationMs),
													})}
										</p>
									</div>
								) : null}

								<p className="mt-4 text-[10px] font-medium text-mute">
									{t("taskPanel.run.response")}
								</p>
								<p className="mt-2 whitespace-pre-wrap text-[14px] leading-5 text-ink">
									{output}
								</p>
							</div>
						);
					})}
				</div>

				<div className="mt-auto flex h-12 shrink-0 items-center gap-[10px] rounded-lg bg-surface-soft px-3">
					<span
						aria-hidden="true"
						className={`size-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[agent.status]}`}
					/>
					<p className="truncate text-[13px] text-charcoal">
						{t(`taskPanel.run.activity.${agent.status}`)}
					</p>
				</div>
			</div>

			<footer className="flex h-12 shrink-0 items-center justify-between bg-surface-soft px-4 text-[12px]">
				<p className="min-w-0 truncate text-mute">
					{formatDuration(totalDuration)} · {formatTokens(totalTokens)}{" "}
					{t("taskPanel.run.tokens")}
				</p>
				{canStop ? (
					<button
						aria-label={t("taskPanel.stopAgent", {
							agent: t(`agentNames.${agent.agentKind}`),
						})}
						className="shrink-0 font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:text-mute"
						disabled={stopPending}
						onClick={() => onStop(agent.id)}
						type="button"
					>
						{t("taskPanel.run.action.stop")}
					</button>
				) : (
					<p className="shrink-0 font-medium text-ink">
						{t(
							isTerminal
								? "taskPanel.run.action.openRecord"
								: "taskPanel.run.action.approve",
						)}
					</p>
				)}
			</footer>
		</section>
	);
};

export { AgentPanel };
