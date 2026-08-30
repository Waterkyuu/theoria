import { useState } from "react";
import {
	ChartColumn,
	CircleStop,
	Clock,
	FileText,
	ListUl,
} from "@gravity-ui/icons";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import type { TaskAgent, TaskAgentResult } from "@/types/task";

type AgentPanelProps = {
	/** Frozen Agent Execution represented by this panel. */
	agent: TaskAgent;
	/** Collected terminal result when execution has finished. */
	result?: TaskAgentResult;
	/** Requests cooperative cancellation for only this Agent. */
	onStop: (taskAgentId: string) => void;
	/** Prevents repeated stop requests while native state is updating. */
	stopPending: boolean;
};

const PANEL_SECTIONS = ["process", "answer", "files", "metrics"] as const;
type PanelSection = (typeof PANEL_SECTIONS)[number];

/** Reads an optional numeric metric without spreading response validation into the page. */
const metricNumber = (
	metrics: Record<string, unknown> | undefined,
	key: string,
) => {
	const value = metrics?.[key];
	return typeof value === "number" ? value : null;
};

/** Reads one nested metric group used by Files and token summaries. */
const metricGroup = (
	metrics: Record<string, unknown> | undefined,
	key: string,
) => {
	const value = metrics?.[key];
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
};

/** Formats compact durations consistently across every Agent panel. */
const formatDuration = (milliseconds: number | null) => {
	if (milliseconds === null) return "-";
	return milliseconds < 1000
		? `${milliseconds} ms`
		: `${(milliseconds / 1000).toFixed(1)} s`;
};

/**
 * Keeps each Agent's process, answer, files, and metrics independently inspectable.
 *
 * @example
 * <AgentPanel agent={agent} result={result} onStop={stopAgent} stopPending={false} />
 */
const AgentPanel = ({
	agent,
	result,
	onStop,
	stopPending,
}: AgentPanelProps) => {
	const { t } = useTranslation();
	const [section, setSection] = useState<PanelSection>("process");
	const canStop = agent.status === "preparing" || agent.status === "running";
	const files = metricGroup(result?.metrics, "files");
	const added = metricNumber(files, "added") ?? 0;
	const modified = metricNumber(files, "modified") ?? 0;
	const deleted = metricNumber(files, "deleted") ?? 0;
	const totalDuration = metricNumber(result?.metrics, "totalDurationMs");
	const timeToFirstToken = metricNumber(result?.metrics, "timeToFirstTokenMs");
	const toolCallCount = metricNumber(result?.metrics, "toolCallCount");

	return (
		<section
			aria-label={`${t(`agentNames.${agent.agentKind}`)} ${t("taskPanel.panel")}`}
			className="flex min-h-80 min-w-0 flex-col overflow-hidden rounded-xl border border-hairline bg-surface-card"
		>
			<header className="flex items-center gap-md border-b border-hairline px-lg py-md">
				<span className="grid size-8 shrink-0 place-items-center rounded-md border border-hairline bg-surface-soft">
					<AgentIcon name={agent.agentKind} width={16} height={16} />
				</span>
				<div className="min-w-0 flex-1">
					<h2 className="truncate text-body-sm font-medium text-ink">
						{t(`agentNames.${agent.agentKind}`)}
					</h2>
					<p className="truncate text-caption-sm text-body">
						{[agent.modelSnapshot, agent.modeSnapshot]
							.filter(Boolean)
							.join(" / ") || t("metricUnavailable")}
					</p>
				</div>
				<span className="rounded-full bg-surface-soft px-sm py-xs text-caption-sm text-charcoal">
					{t(`taskPanel.status.${agent.status}`)}
				</span>
				{canStop ? (
					<button
						aria-label={t("taskPanel.stopAgent", {
							agent: t(`agentNames.${agent.agentKind}`),
						})}
						className="grid size-8 shrink-0 place-items-center rounded-md text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring active:translate-y-px disabled:text-mute"
						disabled={stopPending}
						onClick={() => onStop(agent.id)}
						type="button"
					>
						<CircleStop aria-hidden="true" className="size-4" />
					</button>
				) : null}
			</header>

			<div
				aria-label={t("taskPanel.sections")}
				className="flex border-b border-hairline px-sm"
				role="tablist"
			>
				{PANEL_SECTIONS.map((item) => (
					<button
						aria-selected={section === item}
						className={cn(
							"border-b-2 border-transparent px-md py-sm text-caption-sm text-body outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring",
							section === item && "border-ink text-ink",
						)}
						key={item}
						onClick={() => setSection(item)}
						role="tab"
						type="button"
					>
						{t(`taskPanel.section.${item}`)}
					</button>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto p-lg" role="tabpanel">
				{section === "process" ? (
					<div className="space-y-md text-body-sm">
						<div className="flex items-center gap-sm text-charcoal">
							<ListUl aria-hidden="true" className="size-4" />
							<span>{t(`taskPanel.process.${agent.status}`)}</span>
						</div>
						{toolCallCount !== null ? (
							<p className="text-body">
								{t("taskPanel.toolCalls", { count: toolCallCount })}
							</p>
						) : null}
					</div>
				) : null}
				{section === "answer" ? (
					<div className="whitespace-pre-wrap text-body-sm leading-6 text-charcoal">
						{result?.responseText || t("taskPanel.noAnswer")}
					</div>
				) : null}
				{section === "files" ? (
					<div className="flex items-start gap-sm text-body-sm text-charcoal">
						<FileText aria-hidden="true" className="mt-xs size-4" />
						<span>
							{t("taskPanel.fileSummary", { added, modified, deleted })}
						</span>
					</div>
				) : null}
				{section === "metrics" ? (
					<dl className="grid grid-cols-2 gap-lg text-body-sm">
						<div>
							<dt className="flex items-center gap-xs text-caption-sm text-body">
								<Clock aria-hidden="true" className="size-3.5" />
								{t("totalDuration")}
							</dt>
							<dd className="mt-xs font-mono text-ink">
								{formatDuration(totalDuration)}
							</dd>
						</div>
						<div>
							<dt className="flex items-center gap-xs text-caption-sm text-body">
								<ChartColumn aria-hidden="true" className="size-3.5" />
								{t("firstToken")}
							</dt>
							<dd className="mt-xs font-mono text-ink">
								{formatDuration(timeToFirstToken)}
							</dd>
						</div>
					</dl>
				) : null}
			</div>
		</section>
	);
};

export { AgentPanel };
