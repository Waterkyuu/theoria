import { useState } from "react";
import { ChevronDown, Magnifier } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import type { BenchmarkTaskDetail } from "@/types/benchmark";
import { benchmarkResultClass } from "./benchmark-result";

type BenchmarkResultMatrixProps = {
	/** Persisted rows, columns, and execution cells rendered by the matrix. */
	detail: BenchmarkTaskDetail;
	/** Opens one selected execution in the detail panel. */
	onSelect: (executionId: string) => void;
	/** Execution currently expanded below the matrix. */
	selectedExecutionId: string | null;
};

const MATRIX_PAGE_SIZE = 20;
const MATRIX_RESULTS = [
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

/** Owns result filtering and pagination without expanding the Task data hook.
 * @example <BenchmarkResultMatrix detail={detail} onSelect={setExecutionId} />
 */
const BenchmarkResultMatrix = ({
	detail,
	onSelect,
	selectedExecutionId,
}: BenchmarkResultMatrixProps) => {
	const { t } = useTranslation();
	const [caseSearch, setCaseSearch] = useState("");
	const [matrixAgent, setMatrixAgent] = useState("all");
	const [matrixResult, setMatrixResult] = useState("all");
	const [matrixPage, setMatrixPage] = useState(0);
	const visibleAgents = detail.agents.filter(
		(agent) => matrixAgent === "all" || agent.agentKind === matrixAgent,
	);
	const visibleAgentIds = new Set(visibleAgents.map((agent) => agent.id));
	const filteredCases = detail.cases.filter((benchmarkCase) => {
		if (!benchmarkCase.name.toLowerCase().includes(caseSearch.toLowerCase())) {
			return false;
		}
		return (
			matrixResult === "all" ||
			detail.executions.some(
				(execution) =>
					execution.taskCaseId === benchmarkCase.id &&
					visibleAgentIds.has(execution.taskAgentId) &&
					execution.result === matrixResult,
			)
		);
	});
	const matrixPageCount = Math.max(
		1,
		Math.ceil(filteredCases.length / MATRIX_PAGE_SIZE),
	);
	const currentMatrixPage = Math.min(matrixPage, matrixPageCount - 1);
	const visibleCases = filteredCases.slice(
		currentMatrixPage * MATRIX_PAGE_SIZE,
		(currentMatrixPage + 1) * MATRIX_PAGE_SIZE,
	);

	return (
		<div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
			<div className="flex flex-wrap items-center gap-sm border-b border-hairline px-md py-sm">
				<label className="relative min-w-56 flex-1">
					<span className="sr-only">{t("benchmark.results.searchCases")}</span>
					<Magnifier
						aria-hidden="true"
						className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-mute"
					/>
					<input
						aria-label={t("benchmark.results.searchCases")}
						className="h-9 w-full rounded-lg bg-surface-soft pl-8 pr-sm text-body-sm text-ink outline-none placeholder:text-mute focus-visible:ring-2 focus-visible:ring-focus-ring"
						onChange={(event) => {
							setCaseSearch(event.target.value);
							setMatrixPage(0);
						}}
						type="search"
						value={caseSearch}
						placeholder={t("benchmark.results.searchCases")}
					/>
				</label>
				<label className="relative min-w-36">
					<span className="sr-only">{t("benchmark.results.agentFilter")}</span>
					<select
						aria-label={t("benchmark.results.agentFilter")}
						className="h-9 w-full appearance-none rounded-lg bg-surface-soft pl-md pr-xl text-body-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onChange={(event) => {
							setMatrixAgent(event.target.value);
							setMatrixPage(0);
						}}
						value={matrixAgent}
					>
						<option value="all">{t("benchmark.results.allAgents")}</option>
						{detail.agents.map((agent) => (
							<option key={agent.id} value={agent.agentKind}>
								{t(`agentNames.${agent.agentKind}`)}
							</option>
						))}
					</select>
					<ChevronDown
						aria-hidden="true"
						className="pointer-events-none absolute right-sm top-1/2 size-4 -translate-y-1/2 text-mute"
					/>
				</label>
				<label className="relative min-w-36">
					<span className="sr-only">{t("benchmark.results.statusFilter")}</span>
					<select
						aria-label={t("benchmark.results.statusFilter")}
						className="h-9 w-full appearance-none rounded-lg bg-surface-soft pl-md pr-xl text-body-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onChange={(event) => {
							setMatrixResult(event.target.value);
							setMatrixPage(0);
						}}
						value={matrixResult}
					>
						<option value="all">{t("benchmark.results.allStatuses")}</option>
						{MATRIX_RESULTS.map((result) => (
							<option key={result} value={result}>
								{t(`benchmark.results.state.${result}`)}
							</option>
						))}
					</select>
					<ChevronDown
						aria-hidden="true"
						className="pointer-events-none absolute right-sm top-1/2 size-4 -translate-y-1/2 text-mute"
					/>
				</label>
				<span className="ml-auto whitespace-nowrap text-caption-sm tabular-nums text-mute">
					{t("benchmark.results.filteredCases", {
						count: filteredCases.length,
						total: detail.cases.length,
					})}
				</span>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-180 border-collapse text-body-sm">
					<thead>
						<tr className="border-b border-hairline bg-surface-soft text-left text-mute">
							<th className="w-[40%] px-lg py-sm font-medium">
								{t("benchmark.results.case")}
							</th>
							{visibleAgents.map((agent) => (
								<th className="px-md py-sm font-medium" key={agent.id}>
									{t(`agentNames.${agent.agentKind}`)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{visibleCases.map((benchmarkCase) => (
							<tr
								className="border-b border-hairline transition-colors last:border-0 hover:bg-surface-soft/60"
								key={benchmarkCase.id}
							>
								<th className="px-lg py-md text-left font-medium text-ink">
									{benchmarkCase.name}
								</th>
								{visibleAgents.map((agent) => {
									const execution = detail.executions.find(
										(item) =>
											item.taskCaseId === benchmarkCase.id &&
											item.taskAgentId === agent.id,
									);
									return (
										<td className="px-md py-md" key={agent.id}>
											{execution ? (
												<button
													className={cn(
														"rounded-full px-sm py-xs text-caption-sm font-medium outline-none ring-offset-2 ring-offset-surface-card transition-shadow focus-visible:ring-2 focus-visible:ring-focus-ring",
														benchmarkResultClass(execution.result),
														execution.id === selectedExecutionId &&
															"ring-2 ring-ink/20",
													)}
													onClick={() => onSelect(execution.id)}
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
						{visibleCases.length === 0 ? (
							<tr>
								<td
									className="p-lg text-center text-body-sm text-mute"
									colSpan={visibleAgents.length + 1}
								>
									{t("benchmark.results.noCases")}
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>
			{matrixPageCount > 1 ? (
				<div className="flex items-center justify-end gap-sm border-t border-hairline p-md">
					<Button
						isDisabled={currentMatrixPage === 0}
						onPress={() => setMatrixPage(currentMatrixPage - 1)}
						size="sm"
						variant="secondary"
					>
						{t("benchmark.results.previous")}
					</Button>
					<span className="text-caption-sm text-mute">
						{currentMatrixPage + 1}/{matrixPageCount}
					</span>
					<Button
						isDisabled={currentMatrixPage + 1 === matrixPageCount}
						onPress={() => setMatrixPage(currentMatrixPage + 1)}
						size="sm"
						variant="secondary"
					>
						{t("benchmark.results.next")}
					</Button>
				</div>
			) : null}
		</div>
	);
};

export { BenchmarkResultMatrix };
