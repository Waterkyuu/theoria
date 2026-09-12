import { useRef, useState } from "react";
import { Button, Toast } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { CheckBox } from "@/components/ui/check-box";
import { ModalProvider } from "@/components/ui/modal-provider";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { AGENT_KINDS } from "@/constants/agent";
import { BenchmarkFeedback } from "@/pages/benchmark/components/feedback";
import {
	useBenchmarkTask,
	useCancelBenchmarkTask,
	useRerunBenchmarkTask,
} from "@/queries/benchmark";
import type { BenchmarkTaskDetail } from "@/types/benchmark";

type BenchmarkTaskViewProps = {
	taskId: string;
};

const resultClass = (result: string) => {
	if (result === "passed") return "bg-terminal-green/10 text-terminal-green";
	if (result === "failed") return "bg-terminal-red/10 text-terminal-red";
	return "bg-surface-soft text-body";
};

const terminalStatuses = new Set(["completed", "failed", "stopped"]);

const errorCode = (error: unknown) =>
	typeof error === "object" && error !== null && "code" in error
		? String(error.code)
		: null;

/** Owns Task lifecycle actions separately from the read-only result matrix. */
const BenchmarkTaskActions = ({ detail }: { detail: BenchmarkTaskDetail }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const cancelMutation = useCancelBenchmarkTask();
	const rerunMutation = useRerunBenchmarkTask();
	const idempotencyKey = useRef<string | null>(null);
	const [agents, setAgents] = useState(
		detail.agents.map((agent) => agent.agentKind),
	);
	const [fileAccess, setFileAccess] = useState(detail.fileAccess);
	const [commands, setCommands] = useState(detail.commandExecution);
	const [restoreConfirmation, setRestoreConfirmation] = useState(false);
	const active =
		detail.task.status === "preparing" || detail.task.status === "running";
	const terminal = terminalStatuses.has(detail.task.status);

	const cancel = () => {
		if (cancelMutation.isPending || detail.cancelRequested) return;
		cancelMutation.mutate(detail.task.id, {
			onError: (error) =>
				handleError(error, "Benchmark cancellation failed", true),
			onSuccess: () => Toast.toast.success(t("benchmark.cancelRequested")),
		});
	};

	const rerun = async (restoreMount: boolean) => {
		if (rerunMutation.isPending || !agents.length) return;
		idempotencyKey.current ??= crypto.randomUUID();
		try {
			const next = await rerunMutation.mutateAsync({
				sourceTaskId: detail.task.id,
				agentKinds: agents,
				fileAccess,
				commandExecution: commands,
				restoreMount,
				idempotencyKey: idempotencyKey.current,
			});
			Toast.toast.success(t("benchmark.rerunStarted"));
			const route = next.task.workspaceId
				? `/workspaces/${encodeURIComponent(next.task.workspaceId)}/task/${encodeURIComponent(next.task.id)}`
				: `/task/${encodeURIComponent(next.task.id)}`;
			navigate(route);
		} catch (error) {
			if (errorCode(error) === "BENCHMARK_MOUNT_REQUIRED") {
				setRestoreConfirmation(true);
				return;
			}
			handleError(error, "Benchmark rerun failed", true);
		}
	};

	return (
		<div className="flex shrink-0 items-center gap-sm">
			{active ? (
				<Button
					isDisabled={detail.cancelRequested}
					isPending={cancelMutation.isPending}
					onPress={cancel}
					variant="danger"
				>
					{detail.cancelRequested
						? t("benchmark.cancelling")
						: t("benchmark.cancelRun")}
				</Button>
			) : null}
			{terminal ? (
				<ModalProvider
					title={t("benchmark.rerun")}
					description={t("benchmark.rerunDescription")}
					trigger={<Button>{t("benchmark.rerun")}</Button>}
					footer={
						<Button
							isDisabled={!agents.length}
							isPending={rerunMutation.isPending}
							onPress={() => rerun(false)}
						>
							{t("benchmark.startRerun")}
						</Button>
					}
				>
					<fieldset
						className="flex flex-col gap-sm"
						disabled={rerunMutation.isPending}
					>
						<legend className="mb-xs text-body-sm font-medium">
							{t("benchmark.agents")}
						</legend>
						{AGENT_KINDS.map((kind) => (
							<CheckBox
								isSelected={agents.includes(kind)}
								key={kind}
								label={t(`agentNames.${kind}`)}
								onChange={(selected) => {
									setAgents(
										selected
											? [...agents, kind]
											: agents.filter((agent) => agent !== kind),
									);
									idempotencyKey.current = null;
								}}
							/>
						))}
					</fieldset>
					<Select
						label={t("benchmark.fileAccess")}
						onChange={(value) => {
							if (value) setFileAccess(value);
							idempotencyKey.current = null;
						}}
						options={(["read_only", "allow_edits"] as const).map((value) => ({
							label: t(`benchmark.${value}`),
							value,
						}))}
						placeholder={t("benchmark.fileAccess")}
						value={fileAccess}
					/>
					<Select
						label={t("benchmark.commandExecution")}
						onChange={(value) => {
							if (value) setCommands(value);
							idempotencyKey.current = null;
						}}
						options={(["deny", "ask", "allow"] as const).map((value) => ({
							label: t(`benchmark.${value}`),
							value,
						}))}
						placeholder={t("benchmark.commandExecution")}
						value={commands}
					/>
				</ModalProvider>
			) : null}
			<AlertDialog
				confirmText={t("benchmark.restoreAndRerun")}
				description={t("benchmark.restoreMountDescription")}
				isOpen={restoreConfirmation}
				onConfirm={() => rerun(true)}
				onOpenChange={setRestoreConfirmation}
				status="warning"
				title={t("benchmark.restoreMountTitle")}
			/>
		</div>
	);
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
	const selectedCase = selected
		? detail.cases.find((item) => item.id === selected.taskCaseId)
		: null;
	const selectedAgent = selected
		? detail.agents.find((item) => item.id === selected.taskAgentId)
		: null;
	const selectedDuration =
		selected?.startedAtMs !== null &&
		selected?.startedAtMs !== undefined &&
		selected.finishedAtMs !== null
			? Math.max(0, selected.finishedAtMs - selected.startedAtMs)
			: null;

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
						<div className="flex flex-wrap items-start justify-between gap-md">
							<div>
								<h2 className="font-medium text-ink">
									{t("benchmark.results.executionDetail")}
								</h2>
								<p className="mt-xs text-caption-sm text-mute">
									{selectedCase?.name ?? "—"} ·{" "}
									{selectedAgent
										? t(`agentNames.${selectedAgent.agentKind}`)
										: "—"}
								</p>
							</div>
							<span
								className={cn(
									"rounded-md px-sm py-xs text-caption-sm",
									resultClass(selected.result),
								)}
							>
								{t(`benchmark.results.state.${selected.result}`, {
									defaultValue: selected.result,
								})}
							</span>
						</div>
						<div className="mt-lg grid gap-lg lg:grid-cols-2">
							<section>
								<h3 className="text-caption-sm font-medium text-mute">
									{t("benchmark.results.requirements")}
								</h3>
								<pre className="mt-sm whitespace-pre-wrap text-body-sm text-body">
									{selectedCase?.prompt ?? "—"}
								</pre>
							</section>
							<section>
								<h3 className="text-caption-sm font-medium text-mute">
									{t("benchmark.results.response")}
								</h3>
								<pre className="mt-sm whitespace-pre-wrap text-body-sm text-body">
									{selected.responseText ??
										selected.terminationReason ??
										t("benchmark.results.noResponse")}
								</pre>
							</section>
						</div>
						{selectedDuration !== null ? (
							<p className="mt-lg text-caption-sm text-mute">
								{t("benchmark.results.duration")}: {selectedDuration} ms
							</p>
						) : null}
						{selected.report ? (
							<section className="mt-lg">
								<h3 className="text-caption-sm font-medium text-mute">
									{t("benchmark.results.checks")}
								</h3>
								<ul className="mt-sm space-y-sm">
									{selected.report.checks.map((check, index) => (
										<li
											className="rounded-md border border-hairline p-sm text-body-sm"
											key={`${check.kind}-${check.path ?? "none"}-${index}`}
										>
											<span
												className={
													check.passed
														? "text-terminal-green"
														: "text-terminal-red"
												}
											>
												{check.passed
													? t("benchmark.results.passed")
													: t("benchmark.results.failed")}
											</span>{" "}
											{check.message}
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
					</article>
				) : null}
			</section>
		</main>
	);
};

export { BenchmarkTaskView };
