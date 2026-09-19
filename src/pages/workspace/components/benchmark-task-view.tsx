import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/share/page-header";
import { BenchmarkFeedback } from "@/pages/benchmark/components/feedback";
import { useBenchmarkTask } from "@/queries/benchmark";
import { BenchmarkExecutionDetail } from "./benchmark-execution-detail";
import { BenchmarkResultMatrix } from "./benchmark-result-matrix";
import { BenchmarkTaskActions } from "./benchmark-task-actions";
import { TaskSplitLayout } from "./task-split-layout";

type BenchmarkTaskViewProps = {
	/** Persisted Benchmark Task identifier read from the route. */
	taskId: string;
};

const BenchmarkTaskView = ({ taskId }: BenchmarkTaskViewProps) => {
	const { t } = useTranslation();
	const query = useBenchmarkTask(taskId);
	const [caseId, setCaseId] = useState<string | null>(null);
	const [isDetailOpen, setIsDetailOpen] = useState(true);
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
	const selectedCaseId = caseId ?? detail.cases[0]?.id ?? null;

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

			<TaskSplitLayout
				contentDefaultSize="33%"
				resizerLabel={t("benchmark.results.resize")}
				summaryDefaultSize="67%"
				summaryResizeBehavior="preserve-relative-size"
				summary={
					selectedCaseId && isDetailOpen ? (
						<BenchmarkExecutionDetail
							caseId={selectedCaseId}
							detail={detail}
							key={selectedCaseId}
							onClose={() => setIsDetailOpen(false)}
						/>
					) : null
				}
			>
				<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card">
					<div className="flex flex-wrap items-center gap-sm border-b border-hairline px-lg py-md text-body-sm text-charcoal">
						<strong className="font-semibold tabular-nums text-ink">
							{detail.progress.finished}/{detail.progress.total}
						</strong>
						<span>{t("benchmark.results.completed")}</span>
						<span aria-hidden="true" className="text-mute">
							·
						</span>
						<span className="tabular-nums">
							{detail.progress.passed} {t("benchmark.results.passed")}
						</span>
						<span aria-hidden="true" className="text-mute">
							·
						</span>
						<span className="tabular-nums text-terminal-red">
							{detail.progress.failed} {t("benchmark.results.failed")}
						</span>
						<span aria-hidden="true" className="text-mute">
							·
						</span>
						<span className="tabular-nums text-terminal-red">
							{detail.progress.errors} {t("benchmark.results.errors")}
						</span>
					</div>
					<BenchmarkResultMatrix
						detail={detail}
						onSelect={(nextCaseId) => {
							setCaseId(nextCaseId);
							setIsDetailOpen(true);
						}}
						selectedCaseId={selectedCaseId}
					/>
				</section>
			</TaskSplitLayout>
		</main>
	);
};

export { BenchmarkTaskView };
