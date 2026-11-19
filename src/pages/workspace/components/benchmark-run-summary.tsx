import { useTranslation } from "react-i18next";
import { formatDuration } from "@/utils/common";
import type { BenchmarkTaskDetail } from "@/types/benchmark";

type BenchmarkRunSummaryProps = {
	/**
	 * Full experiment, unaffected by the case list's search or status filter.
	 */
	detail: BenchmarkTaskDetail;
};

/**
 * Keeps coverage visible so missing provider measurements cannot appear as free or zero-token runs.
 *
 * @example
 * <BenchmarkRunSummary detail={detail} />
 */
const BenchmarkRunSummary = ({ detail }: BenchmarkRunSummaryProps) => {
	const { t, i18n } = useTranslation();
	const errors = new Map<string, number>();
	for (const execution of detail.executions) {
		if (execution.phase === "finished" && execution.terminationReason) {
			errors.set(
				execution.terminationReason,
				(errors.get(execution.terminationReason) ?? 0) + 1,
			);
		}
	}
	return (
		<section
			aria-label={t("benchmark.results.experimentSummary")}
			className="max-h-64 shrink-0 space-y-sm overflow-auto border-b border-hairline px-lg py-md"
		>
			{detail.agents.map((agent) => {
				const cells = detail.executions.filter(
					(execution) => execution.taskAgentId === agent.id,
				);
				const costs = cells.flatMap((execution) =>
					execution.metrics?.costNanoUsd == null
						? []
						: [execution.metrics.costNanoUsd],
				);
				const cost = costs.length
					? new Intl.NumberFormat(i18n.language, {
							style: "currency",
							currency: "USD",
							maximumFractionDigits: 6,
						}).format(costs.reduce((sum, value) => sum + value, 0) / 1e9)
					: "—";
				return (
					<div
						className="space-y-xs text-caption-sm text-charcoal"
						key={agent.id}
					>
						<p className="break-words font-medium text-ink">
							{agent.profile?.label || t(`agentNames.${agent.agentKind}`)} ·{" "}
							{agent.profile?.model ?? t("benchmark.results.unknownModel")}
						</p>
						<div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
							<span>
								{t("benchmark.results.passRateSummary", {
									value:
										agent.passRate == null
											? "—"
											: new Intl.NumberFormat(i18n.language, {
													style: "percent",
													maximumFractionDigits: 1,
												}).format(agent.passRate),
								})}
							</span>
							<span>
								{t("benchmark.results.durationSummary", {
									value: formatDuration(
										agent.durationCoverage ? agent.totalDurationMs : null,
									),
								})}
							</span>
							<span>
								{t("benchmark.results.tokenSummary", {
									value: agent.tokenCoverage
										? agent.totalTokens.toLocaleString(i18n.language)
										: "—",
								})}
							</span>
							<span>{t("benchmark.results.costSummary", { value: cost })}</span>
						</div>
						<p className="text-mute">
							{t("benchmark.results.coverageSummary", {
								duration: agent.durationCoverage,
								tokens: agent.tokenCoverage,
								cost: costs.length,
								total: agent.total,
							})}
						</p>
					</div>
				);
			})}
			{errors.size ? (
				<p className="break-words text-caption-sm text-terminal-red">
					{[...errors]
						.map(
							([reason, count]) =>
								`${t(`benchmark.results.state.${reason}`, { defaultValue: reason })}: ${count}`,
						)
						.join(" · ")}
				</p>
			) : null}
			{detail.runOptions?.runner.kind === "harbor" ? (
				<p className="text-caption-sm text-mute">
					{t("benchmark.results.externalTiming")}
				</p>
			) : null}
		</section>
	);
};

export { BenchmarkRunSummary };
