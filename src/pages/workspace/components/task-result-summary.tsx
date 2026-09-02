import { useState } from "react";
import {
	ChevronsCollapseUpRight,
	ChevronsExpandUpRight,
} from "@gravity-ui/icons";
import { Table } from "@heroui/react";
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
	/** Stable translation-backed row label. */
	label: string;
	/** Extracts one display value from an Agent result. */
	value: (result: TaskAgentResult | undefined) => string;
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
	const unavailable = t("taskSummary.unavailable");
	const results = new Map(
		task.results.map((result) => [result.taskAgentId, result]),
	);
	const rows: MetricRow[] = [
		{
			label: t("taskSummary.status"),
			value: (result) =>
				result ? t(`taskPanel.status.${result.finalStatus}`) : unavailable,
		},
		{
			label: t("taskSummary.duration"),
			value: (result) =>
				formatDuration(metricNumber(result, "totalDurationMs"), unavailable),
		},
		{
			label: t("taskSummary.firstToken"),
			value: (result) =>
				formatDuration(metricNumber(result, "timeToFirstTokenMs"), unavailable),
		},
		{
			label: t("taskSummary.tokens"),
			value: (result) => {
				const total = metricObject(result, "tokenUsage")?.totalTokens;
				return typeof total === "number"
					? total.toLocaleString(i18n.language)
					: unavailable;
			},
		},
		{
			label: t("taskSummary.toolCalls"),
			value: (result) =>
				metricNumber(result, "toolCallCount")?.toLocaleString(i18n.language) ??
				unavailable,
		},
		{
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

	return (
		<aside
			aria-label={t("taskSummary.title")}
			className={cn(
				"flex shrink-0 flex-col bg-surface-card",
				isFullscreen
					? "fixed inset-0 z-50 w-full min-w-0"
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
						>
							<Table.Header>
								<Table.Column
									className="sticky left-0 z-10 min-w-28 bg-surface-secondary"
									isRowHeader
								>
									{t("taskSummary.metric")}
								</Table.Column>
								{task.agents.map((agent) => (
									<Table.Column className="min-w-36 text-ink" key={agent.id}>
										<span className="flex items-center gap-sm">
											<AgentIcon
												height={16}
												name={agent.agentKind}
												width={16}
											/>
											<span>{t(`agentNames.${agent.agentKind}`)}</span>
										</span>
									</Table.Column>
								))}
							</Table.Header>
							<Table.Body>
								{rows.map((row) => (
									<Table.Row key={row.label}>
										<Table.Cell className="sticky left-0 z-10 bg-surface-card font-medium text-charcoal">
											{row.label}
										</Table.Cell>
										{task.agents.map((agent) => (
											<Table.Cell
												className="font-mono text-caption-sm tabular-nums text-ink"
												key={agent.id}
											>
												{row.value(results.get(agent.id))}
											</Table.Cell>
										))}
									</Table.Row>
								))}
							</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			</div>
		</aside>
	);
};

export { TaskResultSummary };
