import { useState } from "react";
import { Funnel, Magnifier } from "@gravity-ui/icons";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/share/page-header";
import { ModalProvider } from "@/components/ui/modal-provider";
import { SearchBox } from "@/components/ui/search-box";
import { Select } from "@/components/ui/select";
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

const RESULT_FILTERS = [
	"passed",
	"failed",
	"queued",
	"preparing",
	"running",
	"waiting_permission",
	"collecting",
	"evaluating",
	"stopping",
	"timed_out",
	"agent_error",
	"evaluation_error",
	"interaction_required",
	"cancelled",
	"interrupted",
] as const;

const BenchmarkTaskView = ({ taskId }: BenchmarkTaskViewProps) => {
	const { t } = useTranslation();
	const query = useBenchmarkTask(taskId);
	const [caseId, setCaseId] = useState<string | null>(null);
	const [isDetailOpen, setIsDetailOpen] = useState(true);
	const [searchOpen, setSearchOpen] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const [result, setResult] = useState<(typeof RESULT_FILTERS)[number] | "all">(
		"all",
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
				<div className="flex min-w-0 items-center gap-sm">
					{search.trim() ? (
						<span
							className="max-w-48 truncate text-body-sm text-mute"
							id="benchmark-case-search-query"
						>
							{search.trim()}
						</span>
					) : null}
					<ModalProvider
						isOpen={searchOpen}
						onOpenChange={setSearchOpen}
						size="lg"
						title={t("benchmark.results.searchCases")}
					>
						<SearchBox
							className="rounded-md border border-hairline bg-canvas"
							onValueChange={(value) => {
								setSearch(value);
								setPage(0);
							}}
							placeholder={t("benchmark.results.searchCases")}
							value={search}
						/>
					</ModalProvider>
					<button
						aria-describedby={
							search.trim() ? "benchmark-case-search-query" : undefined
						}
						aria-label={t("benchmark.results.searchCases")}
						className="rounded-md p-1 text-mute hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
						onClick={() => setSearchOpen(true)}
						type="button"
					>
						<Magnifier aria-hidden="true" className="size-4" />
					</button>
					<ModalProvider
						isOpen={filterOpen}
						onOpenChange={setFilterOpen}
						size="sm"
						title={t("benchmark.results.statusFilter")}
					>
						<Select
							label={t("benchmark.results.statusFilter")}
							onChange={(value) => {
								if (value) {
									setResult(value);
									setPage(0);
								}
							}}
							options={[
								{ value: "all", label: t("benchmark.results.allStatuses") },
								...RESULT_FILTERS.map((value) => ({
									value,
									label: t(`benchmark.results.state.${value}`),
								})),
							]}
							placeholder={t("benchmark.results.allStatuses")}
							value={result}
						/>
					</ModalProvider>
					<button
						aria-label={t("benchmark.results.statusFilter")}
						className="rounded-md p-1 text-mute hover:text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
						onClick={() => setFilterOpen(true)}
						type="button"
					>
						<Funnel aria-hidden="true" className="size-4" />
					</button>
					<BenchmarkTaskActions detail={detail} />
				</div>
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
						onPageChange={setPage}
						onSelect={(nextCaseId) => {
							setCaseId(nextCaseId);
							setIsDetailOpen(true);
						}}
						page={page}
						result={result}
						search={search}
						selectedCaseId={selectedCaseId}
					/>
				</section>
			</TaskSplitLayout>
		</main>
	);
};

export { BenchmarkTaskView };
