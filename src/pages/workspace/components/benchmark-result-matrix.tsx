import { useState } from "react";
import { ChevronDown } from "@gravity-ui/icons";
import { Table } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { SearchBox } from "@/components/ui/search-box";
import type { BenchmarkTaskDetail } from "@/types/benchmark";

type BenchmarkResultMatrixProps = {
	detail: BenchmarkTaskDetail;
	onSelect: (caseId: string) => void;
	selectedCaseId: string | null;
};

const PAGE_SIZE = 20;
const RESULTS = [
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

const BenchmarkResultMatrix = ({
	detail,
	onSelect,
	selectedCaseId,
}: BenchmarkResultMatrixProps) => {
	const { t } = useTranslation();
	const [search, setSearch] = useState("");
	const [result, setResult] = useState("all");
	const [page, setPage] = useState(0);
	const query = search.trim().toLowerCase();
	const filteredCases = detail.cases.filter(
		(benchmarkCase) =>
			benchmarkCase.name.toLowerCase().includes(query) &&
			(result === "all" ||
				detail.executions.some(
					(execution) =>
						execution.taskCaseId === benchmarkCase.id &&
						execution.result === result,
				)),
	);
	const pageCount = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount - 1);
	const visibleCases = filteredCases.slice(
		currentPage * PAGE_SIZE,
		(currentPage + 1) * PAGE_SIZE,
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-surface-card">
			<div className="grid gap-sm border-b border-hairline p-md sm:grid-cols-[minmax(0,1fr)_10rem]">
				<SearchBox
					className="h-9 rounded-md border border-hairline bg-surface-card shadow-none"
					onValueChange={(value) => {
						setSearch(value);
						setPage(0);
					}}
					placeholder={t("benchmark.results.searchCases")}
					value={search}
				/>
				<label className="relative min-w-0">
					<span className="sr-only">{t("benchmark.results.statusFilter")}</span>
					<select
						aria-label={t("benchmark.results.statusFilter")}
						className="h-9 w-full appearance-none rounded-md border border-hairline bg-surface-card pl-md pr-xl text-body-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onChange={(event) => {
							setResult(event.target.value);
							setPage(0);
						}}
						value={result}
					>
						<option value="all">{t("benchmark.results.allStatuses")}</option>
						{RESULTS.map((value) => (
							<option key={value} value={value}>
								{t(`benchmark.results.state.${value}`)}
							</option>
						))}
					</select>
					<ChevronDown
						aria-hidden="true"
						className="pointer-events-none absolute right-sm top-1/2 size-4 -translate-y-1/2 text-mute"
					/>
				</label>
			</div>

			<div className="min-h-0 flex-1 overflow-auto">
				<Table variant="secondary">
					<Table.ScrollContainer>
						<Table.Content
							aria-label={t("benchmark.results.case")}
							className="table-fixed"
							onRowAction={(key) => onSelect(String(key))}
						>
							<Table.Header className="[--radius-2xl:0px]">
								<Table.Column isRowHeader>
									{t("benchmark.results.case")}
								</Table.Column>
								<Table.Column className="w-40">
									{t("benchmark.results.result")}
								</Table.Column>
							</Table.Header>
							<Table.Body>
								{visibleCases.map((benchmarkCase) => {
									const executions = detail.executions.filter(
										(execution) => execution.taskCaseId === benchmarkCase.id,
									);
									const passed = executions.filter(
										(execution) => execution.verdict === "passed",
									).length;
									const counts = new Map<string, number>();
									for (const execution of executions) {
										counts.set(
											execution.result,
											(counts.get(execution.result) ?? 0) + 1,
										);
									}

									return (
										<Table.Row
											className={cn(
												"hover:bg-surface-soft",
												benchmarkCase.id === selectedCaseId &&
													"bg-surface-soft shadow-[inset_3px_0_0_0_var(--color-ink)]",
											)}
											id={benchmarkCase.id}
											key={benchmarkCase.id}
										>
											<Table.Cell className="py-md font-medium text-ink">
												{benchmarkCase.name}
											</Table.Cell>
											<Table.Cell>
												<p className="tabular-nums text-charcoal">
													{t("benchmark.results.casePassSummary", {
														passed,
														total: detail.agents.length,
													})}
												</p>
												<p className="mt-xs text-caption-sm text-mute">
													{[...counts]
														.map(
															([value, count]) =>
																`${count} ${t(`benchmark.results.state.${value}`, { defaultValue: value })}`,
														)
														.join(" · ") || "—"}
												</p>
											</Table.Cell>
										</Table.Row>
									);
								})}
								{visibleCases.length === 0 ? (
									<Table.Row id="empty">
										<Table.Cell className="text-center text-mute" colSpan={2}>
											{t("benchmark.results.noCases")}
										</Table.Cell>
									</Table.Row>
								) : null}
							</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			</div>

			{pageCount > 1 ? (
				<div className="flex items-center justify-end border-t border-hairline px-lg py-sm text-caption-sm text-mute">
					<div className="flex items-center gap-sm">
						<button
							disabled={currentPage === 0}
							onClick={() => setPage(currentPage - 1)}
							type="button"
						>
							{t("benchmark.results.previous")}
						</button>
						<span>
							{currentPage + 1}/{pageCount}
						</span>
						<button
							disabled={currentPage + 1 === pageCount}
							onClick={() => setPage(currentPage + 1)}
							type="button"
						>
							{t("benchmark.results.next")}
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
};

export { BenchmarkResultMatrix };
