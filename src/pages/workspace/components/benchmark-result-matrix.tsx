import { Table } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import type { BenchmarkTaskDetail } from "@/types/benchmark";

type BenchmarkResultMatrixProps = {
	detail: BenchmarkTaskDetail;
	/** Changes the visible result page after pagination actions. */
	onPageChange: (page: number) => void;
	onSelect: (caseId: string) => void;
	/** Zero-based page selected by the parent view. */
	page: number;
	/** Execution result selected by the page-level filter. */
	result: string;
	/** Case-name query entered through the page Header. */
	search: string;
	selectedCaseId: string | null;
};

const PAGE_SIZE = 20;

const BenchmarkResultMatrix = ({
	detail,
	onPageChange,
	onSelect,
	page,
	result,
	search,
	selectedCaseId,
}: BenchmarkResultMatrixProps) => {
	const { t } = useTranslation();
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
							onClick={() => onPageChange(currentPage - 1)}
							type="button"
						>
							{t("benchmark.results.previous")}
						</button>
						<span>
							{currentPage + 1}/{pageCount}
						</span>
						<button
							disabled={currentPage + 1 === pageCount}
							onClick={() => onPageChange(currentPage + 1)}
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
