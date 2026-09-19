import { useState } from "react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "@/components/share/markdown-content";
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
		<article className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
			<div className="flex flex-wrap items-start justify-between gap-md border-b border-hairline px-lg py-md">
				<div>
					<h2 className="text-body-sm font-semibold text-ink">
						{t("benchmark.results.executionDetail")}
					</h2>
					<p className="mt-xs text-caption-sm text-mute">
						{benchmarkCase?.name ?? "—"} ·{" "}
						{agent ? t(`agentNames.${agent.agentKind}`) : "—"}
					</p>
					{duration !== null ? (
						<p className="mt-xs text-caption-sm tabular-nums text-mute">
							{t("benchmark.results.duration")}:{" "}
							{t("benchmark.results.durationValue", { value: duration })}
						</p>
					) : null}
				</div>
				<span
					className={cn(
						"rounded-full px-sm py-xs text-caption-sm font-medium",
						benchmarkResultClass(execution.result),
					)}
				>
					{t(`benchmark.results.state.${execution.result}`, {
						defaultValue: execution.result,
					})}
				</span>
			</div>
			<div className="grid gap-md p-lg xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
				<section className="min-w-0 rounded-lg bg-surface-soft p-md">
					<h3 className="text-caption-sm font-medium text-mute">
						{t("benchmark.results.requirements")}
					</h3>
					<p className="mt-sm max-h-80 overflow-auto whitespace-pre-wrap break-words text-body-sm leading-relaxed text-body">
						{benchmarkCase?.prompt ?? "—"}
					</p>
				</section>
				<section className="min-w-0 rounded-lg border border-hairline p-md">
					<h3 className="text-caption-sm font-medium text-mute">
						{t("benchmark.results.response")}
					</h3>
					<div className="mt-sm max-h-[32rem] overflow-auto break-words text-body-sm leading-relaxed text-body [&_a]:font-medium [&_a]:text-link [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-hairline-strong [&_blockquote]:pl-md [&_code]:rounded-sm [&_code]:bg-surface-soft [&_code]:px-1 [&_li]:my-xs [&_ol]:list-decimal [&_ol]:pl-lg [&_p+p]:mt-md [&_pre]:my-md [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-soft [&_pre]:p-md [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-lg">
						<MarkdownContent>
							{execution.responseText ??
								execution.terminationReason ??
								t("benchmark.results.noResponse")}
						</MarkdownContent>
					</div>
				</section>
			</div>
			{execution.report ? (
				<section className="border-t border-hairline px-lg py-md">
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
			<section className="border-t border-hairline px-lg py-md">
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
							className="rounded-lg border border-hairline bg-surface-soft px-sm py-xs text-left text-body-sm outline-none transition-colors hover:border-hairline-strong focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
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
					<div className="mt-md rounded-lg bg-surface-soft p-md">
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
