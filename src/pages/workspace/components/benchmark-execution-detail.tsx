import { useState } from "react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { BenchmarkFeedback } from "@/pages/benchmark/components/feedback";
import {
	useBenchmarkExecutionArtifactPreview,
	useBenchmarkExecutionArtifacts,
} from "@/queries/benchmark";
import type { BenchmarkTaskDetail } from "@/types/benchmark";
import { benchmarkResultClass } from "./benchmark-result";

type BenchmarkExecutionDetailProps = {
	/** Complete Task snapshot used to resolve the execution's Case and Agent. */
	detail: BenchmarkTaskDetail;
	/** Execution selected from the result matrix. */
	executionId: string;
};

/** Displays one persisted execution, its checks, and generated artifacts.
 * @example <BenchmarkExecutionDetail detail={detail} executionId="execution-1" />
 */
const BenchmarkExecutionDetail = ({
	detail,
	executionId,
}: BenchmarkExecutionDetailProps) => {
	const { t } = useTranslation();
	const [artifactPath, setArtifactPath] = useState<string | null>(null);
	const artifacts = useBenchmarkExecutionArtifacts(detail.task.id, executionId);
	const artifactPreview = useBenchmarkExecutionArtifactPreview(
		detail.task.id,
		executionId,
		artifactPath,
	);
	const execution = detail.executions.find((item) => item.id === executionId);
	if (!execution) return null;

	const benchmarkCase = detail.cases.find(
		(item) => item.id === execution.taskCaseId,
	);
	const agent = detail.agents.find((item) => item.id === execution.taskAgentId);
	const duration =
		execution.startedAtMs !== null && execution.finishedAtMs !== null
			? Math.max(0, execution.finishedAtMs - execution.startedAtMs)
			: null;

	return (
		<article className="rounded-xl border border-hairline bg-surface-card p-lg">
			<div className="flex flex-wrap items-start justify-between gap-md">
				<div>
					<h2 className="font-medium text-ink">
						{t("benchmark.results.executionDetail")}
					</h2>
					<p className="mt-xs text-caption-sm text-mute">
						{benchmarkCase?.name ?? "—"} ·{" "}
						{agent ? t(`agentNames.${agent.agentKind}`) : "—"}
					</p>
				</div>
				<span
					className={cn(
						"rounded-md px-sm py-xs text-caption-sm",
						benchmarkResultClass(execution.result),
					)}
				>
					{t(`benchmark.results.state.${execution.result}`, {
						defaultValue: execution.result,
					})}
				</span>
			</div>
			<div className="mt-lg grid gap-lg lg:grid-cols-2">
				<section>
					<h3 className="text-caption-sm font-medium text-mute">
						{t("benchmark.results.requirements")}
					</h3>
					<pre className="mt-sm whitespace-pre-wrap text-body-sm text-body">
						{benchmarkCase?.prompt ?? "—"}
					</pre>
				</section>
				<section>
					<h3 className="text-caption-sm font-medium text-mute">
						{t("benchmark.results.response")}
					</h3>
					<pre className="mt-sm whitespace-pre-wrap text-body-sm text-body">
						{execution.responseText ??
							execution.terminationReason ??
							t("benchmark.results.noResponse")}
					</pre>
				</section>
			</div>
			{duration !== null ? (
				<p className="mt-lg text-caption-sm text-mute">
					{t("benchmark.results.duration")}:{" "}
					{t("benchmark.results.durationValue", { value: duration })}
				</p>
			) : null}
			{execution.report ? (
				<section className="mt-lg">
					<h3 className="text-caption-sm font-medium text-mute">
						{t("benchmark.results.checks")}
					</h3>
					<ul className="mt-sm space-y-sm">
						{execution.report.checks.map((check, index) => (
							<li
								className="rounded-md border border-hairline p-sm text-body-sm"
								key={`${check.kind}-${check.path ?? "none"}-${index}`}
							>
								<span
									className={
										check.passed ? "text-terminal-green" : "text-terminal-red"
									}
								>
									{check.passed
										? t("benchmark.results.passed")
										: t("benchmark.results.failed")}
								</span>{" "}
								{t(`benchmark.results.checkMessage.${check.message}`, {
									defaultValue: check.message,
								})}
								{check.path ? (
									<code className="ml-sm text-caption-sm text-mute">
										{check.path}
									</code>
								) : null}
							</li>
						))}
					</ul>
				</section>
			) : null}
			<section className="mt-lg">
				<h3 className="text-caption-sm font-medium text-mute">
					{t("benchmark.results.artifacts")}
				</h3>
				<BenchmarkFeedback
					failed={artifacts.isError}
					loading={artifacts.isLoading}
					retry={() => artifacts.refetch()}
				/>
				{artifacts.data?.length === 0 ? (
					<p className="mt-sm text-body-sm text-mute">
						{t("benchmark.results.noArtifacts")}
					</p>
				) : null}
				<div className="mt-sm flex flex-wrap gap-sm">
					{artifacts.data?.map((artifact) => (
						<button
							className="rounded-md border border-hairline px-sm py-xs text-left text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
							disabled={artifact.change === "deleted"}
							key={artifact.path}
							onClick={() => setArtifactPath(artifact.path)}
							type="button"
						>
							{artifact.path}{" "}
							<span className="text-caption-sm text-mute">
								{t(`benchmark.results.change.${artifact.change}`)} ·{" "}
								{t("benchmark.file.size", { count: artifact.sizeBytes })}
							</span>
						</button>
					))}
				</div>
				{artifactPath ? (
					<div className="mt-md rounded-md bg-surface-soft p-md">
						<BenchmarkFeedback
							failed={artifactPreview.isError}
							loading={artifactPreview.isLoading}
							retry={() => artifactPreview.refetch()}
						/>
						{artifactPreview.data ? (
							<pre className="max-h-96 overflow-auto whitespace-pre-wrap text-body-sm text-body">
								{artifactPreview.data.text ?? t("benchmark.file.binary")}
							</pre>
						) : null}
					</div>
				) : null}
			</section>
		</article>
	);
};

export { BenchmarkExecutionDetail };
