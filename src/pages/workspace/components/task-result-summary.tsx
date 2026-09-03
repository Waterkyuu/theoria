import type { ReactNode } from "react";
import { useState } from "react";
import {
	ChevronRight,
	ChevronsCollapseUpRight,
	ChevronsExpandUpRight,
} from "@gravity-ui/icons";
import type { Selection } from "@heroui/react";
import { Button, Table } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import type { TaskAgentResult, TaskDetail } from "@/types/task";

type TaskResultSummaryProps = {
	/** Closes the supplementary split without changing Task state. */
	onClose: () => void;
	/** Restored Task conditions and current Agent results. */
	task: TaskDetail;
};

type MetricRow = {
	/** Stable key used by HeroUI to track expansion state. */
	key: string;
	/** Stable translation-backed row label. */
	label: string;
	/** Extracts one display value from an Agent result. */
	value: (result: TaskAgentResult | undefined) => ReactNode;
	/** Detail rows revealed when this metric is expanded. */
	children?: MetricRow[];
};

type ToolCall = {
	/** Stable tool name supplied by the Agent protocol. */
	name: string;
	/** Wall-clock duration between the tool request and matching result. */
	durationMs: number;
};

/** Reads a numeric field from untyped persisted Comparison metrics. */
const metricNumber = (result: TaskAgentResult | undefined, key: string) => {
	const value = result?.metrics[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Reads an object field from untyped persisted Comparison metrics. */
const metricObject = (result: TaskAgentResult | undefined, key: string) => {
	const value = result?.metrics[key];
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
};

/**
 * Keeps only tool measurements that the summary can render safely.
 *
 * @example metricToolCalls(result)[0]?.durationMs
 */
const metricToolCalls = (result: TaskAgentResult | undefined): ToolCall[] => {
	const value = result?.metrics.toolCalls;
	if (!Array.isArray(value)) return [];

	return value.flatMap((toolCall) => {
		if (typeof toolCall !== "object" || toolCall === null) return [];
		const record = toolCall as Record<string, unknown>;
		return typeof record.name === "string" &&
			typeof record.durationMs === "number" &&
			Number.isFinite(record.durationMs)
			? [{ name: record.name, durationMs: record.durationMs }]
			: [];
	});
};

/** Formats a measured latency while retaining useful sub-second precision. */
const formatDuration = (milliseconds: number | null, unavailable: string) => {
	if (milliseconds === null) return unavailable;
	if (milliseconds < 1000) return `${milliseconds} ms`;
	return `${(milliseconds / 1000).toFixed(2)} s`;
};

/** Renders the documented read-only Task-level Comparison split. */
const TaskResultSummary = ({ onClose, task }: TaskResultSummaryProps) => {
	const { i18n, t } = useTranslation();
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [expandedKeys, setExpandedKeys] = useState<Selection>(() => new Set());
	const unavailable = t("taskSummary.unavailable");
	const noToolCall = t("taskSummary.noToolCall");
	const unknownModel = t("unknownModel");
	const results = new Map(
		task.results.map((result) => [result.taskAgentId, result]),
	);
	const toolCallRowCount = Math.max(
		0,
		...task.results.map((result) => metricToolCalls(result).length),
	);
	const toolCallRows: MetricRow[] = Array.from(
		{ length: toolCallRowCount },
		(_, index) => ({
			key: `tool-call-${index + 1}`,
			label: t("taskSummary.toolCall", { sequence: index + 1 }),
			value: (result) => {
				const toolCall = metricToolCalls(result)[index];
				if (!toolCall) return noToolCall;
				return (
					<span className="flex items-center justify-between gap-lg">
						<span className="font-sans text-charcoal">{toolCall.name}</span>
						<span>{formatDuration(toolCall.durationMs, unavailable)}</span>
					</span>
				);
			},
		}),
	);
	const rows: MetricRow[] = [
		{
			key: "status",
			label: t("taskSummary.status"),
			value: (result) =>
				result ? t(`taskPanel.status.${result.finalStatus}`) : unavailable,
		},
		{
			key: "duration",
			label: t("taskSummary.duration"),
			value: (result) =>
				formatDuration(metricNumber(result, "totalDurationMs"), unavailable),
		},
		{
			key: "first-token",
			label: t("taskSummary.firstToken"),
			value: (result) =>
				formatDuration(metricNumber(result, "timeToFirstTokenMs"), unavailable),
		},
		{
			key: "tokens",
			label: t("taskSummary.tokens"),
			value: (result) => {
				const total = metricObject(result, "tokenUsage")?.totalTokens;
				return typeof total === "number"
					? total.toLocaleString(i18n.language)
					: unavailable;
			},
		},
		{
			key: "tool-calls",
			label: t("taskSummary.toolCalls"),
			children: toolCallRows,
			value: (result) =>
				metricNumber(result, "toolCallCount")?.toLocaleString(i18n.language) ??
				unavailable,
		},
		{
			key: "files",
			label: t("taskSummary.files"),
			value: (result) => {
				const files = metricObject(result, "files");
				if (!files) return unavailable;
				return t("taskSummary.fileCounts", {
					added: typeof files.added === "number" ? files.added : 0,
					modified: typeof files.modified === "number" ? files.modified : 0,
					deleted: typeof files.deleted === "number" ? files.deleted : 0,
				});
			},
		},
	];

	/**
	 * Nests tool measurements under their aggregate count using HeroUI's tree rows.
	 *
	 * @example <Table.Body items={rows}>{renderMetricRow}</Table.Body>
	 */
	const renderMetricRow = (row: MetricRow) => (
		<Table.Row id={row.key} textValue={row.label}>
			<Table.Cell
				className="sticky left-0 z-10 bg-surface-card font-medium text-charcoal"
				textValue={row.label}
			>
				{({ hasChildItems, isDisabled, isExpanded, isTreeColumn }) => (
					<span className="flex items-center gap-xs">
						{hasChildItems && isTreeColumn ? (
							<Button
								aria-label={t(
									isExpanded
										? "taskSummary.collapseToolCalls"
										: "taskSummary.expandToolCalls",
								)}
								className="min-w-0 rounded-md p-xs text-mute shadow-none"
								isDisabled={isDisabled}
								isIconOnly
								size="sm"
								slot="chevron"
								variant="ghost"
							>
								<ChevronRight
									aria-hidden="true"
									className={cn(
										"size-3 transition-transform duration-150 motion-reduce:transition-none",
										isExpanded && "rotate-90",
									)}
								/>
							</Button>
						) : null}
						<span>{row.label}</span>
					</span>
				)}
			</Table.Cell>
			{task.agents.map((agent) => (
				<Table.Cell
					className="font-mono text-caption-sm tabular-nums text-ink"
					key={agent.id}
				>
					{row.value(results.get(agent.id))}
				</Table.Cell>
			))}
			<Table.Collection items={row.children ?? []}>
				{renderMetricRow}
			</Table.Collection>
		</Table.Row>
	);

	return (
		<aside
			aria-label={t("taskSummary.title")}
			className={cn(
				"flex shrink-0 flex-col bg-surface-card",
				isFullscreen
					? "fixed inset-x-0 bottom-0 top-11 z-50 w-full min-w-0"
					: "h-full w-full min-w-0 border-l border-hairline max-md:absolute max-md:inset-y-[34px] max-md:right-0 max-md:z-30 max-md:h-auto max-md:w-[min(520px,calc(100%-1rem))] max-md:shadow-xl",
			)}
		>
			<header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-lg">
				<div>
					<h2 className="text-body-sm font-semibold text-ink">
						{t("taskSummary.title")}
					</h2>
					<p className="text-caption-sm text-mute">
						{t("taskSummary.readOnly")}
					</p>
				</div>
				<div className="flex items-center gap-xs">
					<button
						aria-label={t(
							isFullscreen
								? "taskSummary.exitFullscreen"
								: "taskSummary.enterFullscreen",
						)}
						className="grid size-8 place-items-center rounded-md text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => setIsFullscreen((fullscreen) => !fullscreen)}
						type="button"
					>
						{isFullscreen ? (
							<ChevronsCollapseUpRight aria-hidden="true" className="size-4" />
						) : (
							<ChevronsExpandUpRight aria-hidden="true" className="size-4" />
						)}
					</button>
					<button
						aria-label={t("taskSummary.close")}
						className="rounded-md px-sm py-xs text-body-sm text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={onClose}
						type="button"
					>
						{t("taskSummary.close")}
					</button>
				</div>
			</header>
			<div className="min-h-0 flex-1 overflow-auto p-lg">
				<Table className="rounded-lg">
					<Table.ScrollContainer>
						<Table.Content
							aria-label={t("taskSummary.title")}
							className="min-w-max"
							expandedKeys={expandedKeys}
							onExpandedChange={setExpandedKeys}
							treeColumn="metric"
						>
							<Table.Header>
								<Table.Column
									className="sticky left-0 z-10 min-w-28 bg-surface-secondary"
									id="metric"
									isRowHeader
								>
									{t("taskSummary.metric")}
								</Table.Column>
								{task.agents.map((agent) => (
									<Table.Column
										className="min-w-36 text-ink"
										id={agent.id}
										key={agent.id}
									>
										<span className="flex items-center gap-sm">
											<AgentIcon
												height={16}
												name={agent.agentKind}
												width={16}
											/>
											<span>{t(`agentNames.${agent.agentKind}`)}</span>
											<span aria-hidden="true" className="text-mute">
												·
											</span>
											<span className="font-mono text-caption-sm font-normal text-mute">
												{agent.modelSnapshot ?? unknownModel}
											</span>
										</span>
									</Table.Column>
								))}
							</Table.Header>
							<Table.Body items={rows}>{renderMetricRow}</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			</div>
		</aside>
	);
};

export { TaskResultSummary };
