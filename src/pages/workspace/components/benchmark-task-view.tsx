import { useState } from "react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/share/page-header";
import { BenchmarkFeedback } from "@/pages/benchmark/components/feedback";
import { useBenchmarkTask } from "@/queries/benchmark";

type BenchmarkTaskViewProps = {
	taskId: string;
};

const resultClass = (result: string) => {
	if (result === "passed") return "bg-terminal-green/10 text-terminal-green";
	if (result === "failed") return "bg-terminal-red/10 text-terminal-red";
	return "bg-surface-soft text-body";
};

/** Renders the persisted Case × Agent matrix and coverage-aware aggregate metrics. */
const BenchmarkTaskView = ({ taskId }: BenchmarkTaskViewProps) => {
	const { t } = useTranslation();
	const query = useBenchmarkTask(taskId);
	const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
		null,
	);
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
	const selected = detail.executions.find(
		(execution) => execution.id === selectedExecutionId,
	);

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
			</PageHeader>

			<section className="min-h-0 flex-1 space-y-xl overflow-y-auto p-lg sm:p-xl">
				<div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
					{[
						[
							"progress",
							`${detail.progress.finished}/${detail.progress.total}`,
						],
						["passed", detail.progress.passed],
						["failed", detail.progress.failed],
						["errors", detail.progress.errors],
					].map(([label, value]) => (
						<div
							className="rounded-xl border border-hairline bg-surface-card p-lg"
							key={label}
						>
							<p className="text-caption-sm text-mute">
								{t(`benchmark.results.${label}`)}
							</p>
							<p className="mt-xs text-heading-lg font-semibold text-ink">
								{value}
							</p>
						</div>
					))}
				</div>

				<div className="grid gap-md lg:grid-cols-2 xl:grid-cols-4">
					{detail.agents.map((agent) => (
						<article
							className="rounded-xl border border-hairline bg-surface-card p-lg"
							key={agent.id}
						>
							<h2 className="font-medium text-ink">
								{t(`agentNames.${agent.agentKind}`)}
							</h2>
							<p className="mt-sm text-body-sm text-body">
								{agent.passRate === null
									? t("benchmark.results.incompleteCoverage")
									: t("benchmark.results.passRate", {
											rate: Math.round(agent.passRate * 100),
										})}
							</p>
							<p className="mt-xs text-caption-sm text-mute">
								{t("benchmark.results.metrics", {
									duration: agent.totalDurationMs,
									tokens: agent.totalTokens,
									tools: agent.toolCallCount,
								})}
							</p>
						</article>
					))}
				</div>

				<div className="overflow-x-auto rounded-xl border border-hairline bg-surface-card">
					<table className="w-full min-w-180 border-collapse text-body-sm">
						<thead>
							<tr className="border-b border-hairline text-left text-mute">
								<th className="p-md font-medium">
									{t("benchmark.results.case")}
								</th>
								{detail.agents.map((agent) => (
									<th className="p-md font-medium" key={agent.id}>
										{t(`agentNames.${agent.agentKind}`)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{detail.cases.map((benchmarkCase) => (
								<tr
									className="border-b border-hairline last:border-0"
									key={benchmarkCase.id}
								>
									<th className="p-md text-left font-medium text-ink">
										{benchmarkCase.name}
									</th>
									{detail.agents.map((agent) => {
										const execution = detail.executions.find(
											(item) =>
												item.taskCaseId === benchmarkCase.id &&
												item.taskAgentId === agent.id,
										);
										return (
											<td className="p-md" key={agent.id}>
												{execution ? (
													<button
														className={cn(
															"rounded-md px-sm py-xs text-caption-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
															resultClass(execution.result),
														)}
														onClick={() => setSelectedExecutionId(execution.id)}
														type="button"
													>
														{t(`benchmark.results.state.${execution.result}`, {
															defaultValue: execution.result,
														})}
													</button>
												) : (
													"—"
												)}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{selected ? (
					<article className="rounded-xl border border-hairline bg-surface-card p-lg">
						<h2 className="font-medium text-ink">
							{t("benchmark.results.executionDetail")}
						</h2>
						<pre className="mt-md whitespace-pre-wrap text-body-sm text-body">
							{selected.responseText ??
								selected.terminationReason ??
								selected.result}
						</pre>
					</article>
				) : null}
			</section>
		</main>
	);
};

export { BenchmarkTaskView };
