import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import { MarkdownContent } from "@/components/share/markdown-content";
import { formatDuration, formatToolPayload } from "@/utils/common";
import type { ToolCallMetric } from "@/types/agent";
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
	arguments: unknown;
	result: unknown;
	status: ToolCallMetric["status"] | null;
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
			arguments: record.arguments ?? null,
			result: record.result ?? null,
			status:
				record.status === "completed" ||
				record.status === "failed" ||
				record.status === "incomplete"
					? record.status
					: null,
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
	const metadata = [
		agent.modelSnapshot ?? t("unknownModel"),
		agent.modeSnapshot,
	]
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
					{metadata}
				</p>
				<span className="flex shrink-0 items-center gap-[6px] text-[12px] font-medium text-charcoal">
					<span
						aria-hidden="true"
						className={`size-2 rounded-full ${STATUS_DOT_CLASSES[agent.status]}`}
					/>
					{t(`taskPanel.status.${agent.status}`)}
				</span>
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
														duration: formatDuration(
															latestToolCall.durationMs,
															"-",
														),
													})}
										</p>
										<p className="mt-[6px] whitespace-pre-wrap break-all font-mono text-[11px] text-mute">
											{t("taskSummary.arguments")}:{" "}
											{formatToolPayload(latestToolCall.arguments)}
										</p>
										<p className="mt-[4px] whitespace-pre-wrap break-all font-mono text-[11px] text-mute">
											{t("taskSummary.result")}:{" "}
											{formatToolPayload(latestToolCall.result)}
										</p>
										{latestToolCall.status ? (
											<p className="mt-[4px] text-[11px] text-mute">
												{t("taskSummary.toolStatus")}:{" "}
												{t(
													`benchmark.results.toolStatus.${latestToolCall.status}`,
												)}
											</p>
										) : null}
									</div>
								) : null}

								<p className="mt-4 text-[10px] font-medium text-mute">
									{t("taskPanel.run.response")}
								</p>
								<div className="mt-2 break-words text-[14px] leading-5 text-ink [&_a]:font-medium [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-hairline-strong [&_blockquote]:pl-3 [&_code]:rounded-sm [&_code]:bg-surface-soft [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-soft [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
									<MarkdownContent>{output}</MarkdownContent>
								</div>
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
					{formatDuration(totalDuration, "-", true)} ·{" "}
					{formatTokens(totalTokens)} {t("taskPanel.run.tokens")}
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
				) : null}
			</footer>
		</section>
	);
};

export { AgentPanel };
