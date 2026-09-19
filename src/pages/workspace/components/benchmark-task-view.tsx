import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/share/page-header";
import { BenchmarkFeedback } from "@/pages/benchmark/components/feedback";
import { useBenchmarkTask } from "@/queries/benchmark";
import { BenchmarkExecutionDetail } from "./benchmark-execution-detail";
import { BenchmarkResultMatrix } from "./benchmark-result-matrix";
import { BenchmarkTaskActions } from "./benchmark-task-actions";

type BenchmarkTaskViewProps = {
	/** Persisted Benchmark Task identifier read from the route. */
	taskId: string;
};

/** Formats an aggregate value together with the executions that reported it.
 * @example formatCoveredMetric("120 ms", 2, 3, t)
 */
const formatCoveredMetric = (
	value: string,
	coverage: number,
	total: number,
	translate: (key: string, values?: Record<string, unknown>) => string,
) =>
	coverage === 0
		? translate("benchmark.results.noData")
		: translate("benchmark.results.metricCoverage", {
				value,
				coverage,
				total,
			});

/** Renders Task progress and composes the result-specific child views.
 * @example <BenchmarkTaskView taskId="task-1" />
 */
const BenchmarkTaskView = ({ taskId }: BenchmarkTaskViewProps) => {
	const { t } = useTranslation();
	const query = useBenchmarkTask(taskId);
	const [executionId, setExecutionId] = useState<string | null>(null);
	if (!query.data) {
		return (
			<main className="h-dvh min-w-0 flex-1 overflow-y-auto bg-canvas p-xl">
				<BenchmarkFeedback
					failed={query.isError}
					loading={query.isLoading}
					retry={() => query.refetch()}
				/>
			</main>
		);
	}
	const detail = query.data;

	return (
		<main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<div className="min-w-0">
					<p className="truncate text-body-sm font-medium text-charcoal">
						{detail.benchmarkName}
					</p>
					<p className="text-caption-sm text-mute">
						{t("benchmark.version", { number: detail.versionNumber })} ·{" "}
						{t(`benchmark.taskStatus.${detail.task.status}`)}
					</p>
				</div>
				<BenchmarkTaskActions detail={detail} />
			</PageHeader>

			<section className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-lg p-lg sm:p-xl">
					<section className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
						<div className="grid divide-y divide-hairline sm:grid-cols-4 sm:divide-x sm:divide-y-0">
							{[
								[
									"progress",
									`${detail.progress.finished}/${detail.progress.total}`,
								],
								["passed", detail.progress.passed],
								["failed", detail.progress.failed],
								["errors", detail.progress.errors],
							].map(([label, value]) => (
								<div className="min-w-0 px-lg py-md" key={label}>
									<p className="text-caption-sm font-medium text-mute">
										{t(`benchmark.results.${label}`)}
									</p>
									<p className="mt-xs text-heading-md font-semibold tabular-nums text-ink">
										{value}
									</p>
								</div>
							))}
						</div>
						<div className="h-1 bg-surface-soft">
							<div
								className="h-full bg-ink transition-[width] duration-300"
								style={{
									width: `${detail.progress.total === 0 ? 0 : (detail.progress.finished / detail.progress.total) * 100}%`,
								}}
							/>
						</div>
					</section>

					<section className="grid gap-md lg:grid-cols-2">
						{detail.agents.map((agent) => (
							<article
								className="overflow-hidden rounded-xl border border-hairline bg-surface-card"
								key={agent.id}
							>
								<div className="flex items-end justify-between gap-md px-lg py-md">
									<div>
										<h2 className="font-medium text-ink">
											{t(`agentNames.${agent.agentKind}`)}
										</h2>
										<p className="mt-xs text-caption-sm text-mute">
											{agent.passRate === null
												? t("benchmark.results.incompleteCoverage")
												: `${agent.passed}/${agent.total} ${t("benchmark.results.passed")}`}
										</p>
									</div>
									<p className="text-heading-lg font-semibold tabular-nums text-ink">
										{agent.passRate === null
											? "—"
											: `${Math.round(agent.passRate * 100)}%`}
									</p>
								</div>
								<div className="grid grid-cols-3 divide-x divide-hairline border-t border-hairline bg-surface-soft">
									{[
										formatCoveredMetric(
											t("benchmark.results.durationValue", {
												value: agent.totalDurationMs,
											}),
											agent.durationCoverage,
											agent.total,
											t,
										),
										formatCoveredMetric(
											t("benchmark.results.tokenValue", {
												count: agent.totalTokens,
											}),
											agent.tokenCoverage,
											agent.total,
											t,
										),
										formatCoveredMetric(
											t("benchmark.results.toolValue", {
												count: agent.toolCallCount,
											}),
											agent.durationCoverage,
											agent.total,
											t,
										),
									].map((metric, index) => (
										<p
											className="min-w-0 px-md py-sm text-caption-sm leading-relaxed text-body"
											key={index}
										>
											{metric}
										</p>
									))}
								</div>
							</article>
						))}
					</section>

					<BenchmarkResultMatrix
						detail={detail}
						onSelect={setExecutionId}
						selectedExecutionId={executionId}
					/>
					{executionId ? (
						<BenchmarkExecutionDetail
							detail={detail}
							executionId={executionId}
							key={executionId}
						/>
					) : null}
				</div>
			</section>
		</main>
	);
};

export { BenchmarkTaskView };
