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
			className="flex w-[min(520px,48vw)] min-w-90 shrink-0 flex-col border-l border-hairline bg-surface-card max-lg:absolute max-lg:inset-y-[34px] max-lg:right-0 max-lg:z-30 max-lg:w-[min(520px,calc(100%-1rem))] max-lg:shadow-xl"
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
				<button
					aria-label={t("taskSummary.close")}
					className="rounded-md px-sm py-xs text-body-sm text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
					onClick={onClose}
					type="button"
				>
					{t("taskSummary.close")}
				</button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto p-lg">
				<table className="w-full border-separate border-spacing-0 text-left text-body-sm">
					<thead>
						<tr>
							<th className="sticky left-0 z-10 min-w-24 border-b border-hairline bg-surface-card pb-md pr-md font-medium text-mute">
								{t("taskSummary.metric")}
							</th>
							{task.agents.map((agent) => (
								<th
									className="min-w-36 border-b border-hairline px-md pb-md font-medium text-ink"
									key={agent.id}
								>
									<span className="flex items-center gap-sm">
										<AgentIcon height={16} name={agent.agentKind} width={16} />
										<span>{t(`agentNames.${agent.agentKind}`)}</span>
									</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.label}>
								<th className="sticky left-0 z-10 border-b border-hairline bg-surface-card py-md pr-md font-medium text-charcoal">
									{row.label}
								</th>
								{task.agents.map((agent) => (
									<td
										className="border-b border-hairline px-md py-md font-mono text-caption-sm tabular-nums text-ink"
										key={agent.id}
									>
										{row.value(results.get(agent.id))}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</aside>
	);
};

export { TaskResultSummary };
