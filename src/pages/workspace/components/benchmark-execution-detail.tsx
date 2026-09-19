import type { ReactNode } from "react";
import { useState } from "react";
import {
	ChevronRight,
	ChevronsCollapseUpRight,
	ChevronsExpandUpRight,
	Xmark,
} from "@gravity-ui/icons";
import type { Selection } from "@heroui/react";
import { Button, Table } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import { MarkdownContent } from "@/components/share/markdown-content";
import { Select } from "@/components/ui/select";
import { formatDuration, formatToolPayload } from "@/utils/common";
import { BenchmarkFeedback } from "@/pages/benchmark/components/feedback";
import {
	useBenchmarkExecutionArtifactPreview,
	useBenchmarkExecutionArtifacts,
} from "@/queries/benchmark";
import type { BenchmarkTaskDetail } from "@/types/benchmark";
import { benchmarkResultClass } from "./benchmark-result";

type BenchmarkExecutionDetailProps = {
	caseId: string;
	detail: BenchmarkTaskDetail;
	onClose: () => void;
};

type DetailTab = "artifacts" | "checks" | "response" | "tools";
type CaseExecution = {
	agent: BenchmarkTaskDetail["agents"][number];
	execution: BenchmarkTaskDetail["executions"][number] | undefined;
};
type ComparisonRow = {
	key: string;
	label: string;
	value: (item: CaseExecution) => ReactNode;
	children?: ComparisonRow[];
};

const BenchmarkExecutionDetail = ({
	caseId,
	detail,
	onClose,
}: BenchmarkExecutionDetailProps) => {
	const { i18n, t } = useTranslation();
	const benchmarkCase = detail.cases.find((item) => item.id === caseId);
	const caseExecutions = detail.agents.map((agent) => ({
		agent,
		execution: detail.executions.find(
			(item) => item.taskCaseId === caseId && item.taskAgentId === agent.id,
		),
	}));
	const [agentId, setAgentId] = useState(caseExecutions[0]?.agent.id ?? "");
	const [activeTab, setActiveTab] = useState<DetailTab>("tools");
	const [artifactPath, setArtifactPath] = useState<string | null>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [expandedKeys, setExpandedKeys] = useState<Selection>(() => new Set());
	const selected =
		caseExecutions.find(({ agent }) => agent.id === agentId) ??
		caseExecutions[0];
	const execution = selected?.execution;
	const artifacts = useBenchmarkExecutionArtifacts(
		detail.task.id,
		execution?.id ?? null,
	);
	const artifactPreview = useBenchmarkExecutionArtifactPreview(
		detail.task.id,
		execution?.id ?? null,
		artifactPath,
	);
	const maxToolCalls = Math.max(
		0,
		...caseExecutions.map(
			({ execution: item }) => item?.metrics?.toolCalls.length ?? 0,
		),
	);
	const tabs: Array<{ id: DetailTab; label: string }> = [
		{ id: "tools", label: t("benchmark.results.toolDetails") },
		{ id: "response", label: t("benchmark.results.response") },
		{ id: "checks", label: t("benchmark.results.checks") },
		{ id: "artifacts", label: t("benchmark.results.artifacts") },
	];
	const tokenRows: ComparisonRow[] = [
		{
			key: "input-tokens",
			label: t("benchmark.results.inputTokens"),
			value: ({ execution: item }) =>
				item?.metrics?.tokenUsage?.inputTokens.toLocaleString(i18n.language) ??
				"—",
		},
		{
			key: "output-tokens",
			label: t("benchmark.results.outputTokens"),
			value: ({ execution: item }) =>
				item?.metrics?.tokenUsage?.outputTokens.toLocaleString(i18n.language) ??
				"—",
		},
		{
			key: "cached-tokens",
			label: t("benchmark.results.cachedTokens"),
			value: ({ execution: item }) =>
				item?.metrics?.tokenUsage?.cachedInputTokens.toLocaleString(
					i18n.language,
				) ?? "—",
		},
	];
	const toolRows: ComparisonRow[] = Array.from(
		{ length: maxToolCalls },
		(_, index) => ({
			key: `tool-${index + 1}`,
			label: t("benchmark.results.toolCall", { count: index + 1 }),
			value: ({ execution: item }) => {
				const call = item?.metrics?.toolCalls[index];
				return call
					? `${call.name} · ${formatDuration(call.durationMs)}`
					: t("benchmark.results.noData");
			},
		}),
	);
	const comparisonRows: ComparisonRow[] = [
		{
			key: "status",
			label: t("benchmark.results.status"),
			value: ({ execution: item }) =>
				item ? (
					<span
						className={cn(
							"rounded-md px-sm py-xs text-caption-sm font-medium",
							benchmarkResultClass(item.result),
						)}
					>
						{t(`benchmark.results.state.${item.result}`, {
							defaultValue: item.result,
						})}
					</span>
				) : (
					"—"
				),
		},
		{
			key: "duration",
			label: t("benchmark.results.totalDuration"),
			value: ({ execution: item }) =>
				formatDuration(item?.metrics?.totalDurationMs ?? null),
		},
		{
			key: "first-token",
			label: t("benchmark.results.firstToken"),
			value: ({ execution: item }) =>
				formatDuration(item?.metrics?.timeToFirstTokenMs ?? null),
		},
		{
			key: "tokens",
			label: t("benchmark.results.tokens"),
			children: tokenRows,
			value: ({ execution: item }) =>
				item?.metrics?.tokenUsage?.totalTokens.toLocaleString(i18n.language) ??
				"—",
		},
		{
			key: "tool-calls",
			label: t("benchmark.results.toolCalls"),
			children: toolRows,
			value: ({ execution: item }) =>
				item?.metrics?.toolCallCount.toLocaleString(i18n.language) ?? "—",
		},
	];
	const renderComparisonRow = (row: ComparisonRow) => (
		<Table.Row id={row.key} textValue={row.label}>
			<Table.Cell
				className="sticky left-0 z-10 bg-surface-card font-medium text-charcoal"
				textValue={row.label}
			>
				{({ hasChildItems, isDisabled, isExpanded, isTreeColumn }) => (
					<span className="flex items-center gap-xs">
						{hasChildItems && isTreeColumn ? (
							<Button
								aria-label={row.label}
								className="min-w-0 rounded-md p-xs text-mute shadow-none"
								isDisabled={isDisabled}
								isIconOnly
								size="sm"
								slot="chevron"
								variant="ghost"
							>
								<ChevronRight
									aria-hidden="true"
									className={cn(
										"size-3 transition-transform duration-150 motion-reduce:transition-none",
										isExpanded && "rotate-90",
									)}
								/>
							</Button>
						) : null}
						<span>{row.label}</span>
					</span>
				)}
			</Table.Cell>
			{caseExecutions.map((item) => (
				<Table.Cell
					className="font-mono text-caption-sm tabular-nums text-ink"
					key={item.agent.id}
				>
					{row.value(item)}
				</Table.Cell>
			))}
			<Table.Collection items={row.children ?? []}>
				{renderComparisonRow}
			</Table.Collection>
		</Table.Row>
	);

	return (
		<aside
			aria-label={t("benchmark.results.caseComparison")}
			className={cn(
				"flex min-h-0 w-full min-w-0 flex-col bg-surface-card",
				isFullscreen
					? "fixed inset-x-0 bottom-0 top-11 z-40"
					: "border-l border-hairline",
			)}
		>
			<header className="flex h-20 shrink-0 items-center justify-between border-b border-hairline px-lg">
				<div className="min-w-0">
					<h2 className="text-body-md font-semibold text-ink">
						{t("benchmark.results.caseComparison")}
					</h2>
					<p className="truncate text-body-sm text-mute">
						{benchmarkCase?.name ?? "—"}
					</p>
				</div>
				<div className="flex items-center gap-xs">
					<button
						aria-label={t(
							isFullscreen
								? "taskSummary.exitFullscreen"
								: "taskSummary.enterFullscreen",
						)}
						className="grid size-8 place-items-center rounded-md text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => setIsFullscreen((value) => !value)}
						type="button"
					>
						{isFullscreen ? (
							<ChevronsCollapseUpRight aria-hidden="true" className="size-4" />
						) : (
							<ChevronsExpandUpRight aria-hidden="true" className="size-4" />
						)}
					</button>
					<button
						aria-label={t("taskSummary.close")}
						className="grid size-8 place-items-center rounded-md text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={onClose}
						type="button"
					>
						<Xmark aria-hidden="true" className="size-4" />
					</button>
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-auto">
				<div className="p-lg">
					<Table className="rounded-lg">
						<Table.ScrollContainer>
							<Table.Content
								aria-label={t("benchmark.results.caseComparison")}
								className="min-w-max"
								expandedKeys={expandedKeys}
								onExpandedChange={setExpandedKeys}
								treeColumn="metric"
							>
								<Table.Header>
									<Table.Column
										className="sticky left-0 z-10 min-w-28 bg-surface-secondary"
										id="metric"
										isRowHeader
									>
										{t("benchmark.results.metric")}
									</Table.Column>
									{caseExecutions.map(({ agent }) => (
										<Table.Column
											className="min-w-36 text-ink"
											id={agent.id}
											key={agent.id}
										>
											<span className="flex items-center gap-sm">
												<AgentIcon
													height={16}
													name={agent.agentKind}
													width={16}
												/>
												<span>{t(`agentNames.${agent.agentKind}`)}</span>
												<span aria-hidden="true" className="text-mute">
													·
												</span>
												<span className="font-mono text-caption-sm font-normal text-mute">
													{t("unknownModel")}
												</span>
											</span>
										</Table.Column>
									))}
								</Table.Header>
								<Table.Body items={comparisonRows}>
									{renderComparisonRow}
								</Table.Body>
							</Table.Content>
						</Table.ScrollContainer>
					</Table>
				</div>

				<div className="border-b border-hairline px-lg py-md">
					<Select
						className="w-fit flex-row items-center gap-md text-body-sm [&_[data-slot=label]]:text-mute [&_[data-slot=select-trigger]]:min-w-36"
						fullWidth={false}
						label={t("benchmark.results.agentDetail")}
						onChange={(value) => {
							if (value) setAgentId(value);
							setArtifactPath(null);
						}}
						options={caseExecutions.map(({ agent }) => ({
							value: agent.id,
							label: t(`agentNames.${agent.agentKind}`),
						}))}
						placeholder={t("benchmark.results.agentDetail")}
						value={selected?.agent.id ?? null}
					/>
					<div className="mt-md flex gap-lg" role="tablist">
						{tabs.map((tab) => (
							<button
								aria-selected={activeTab === tab.id}
								className={cn(
									"border-b-2 border-transparent pb-sm text-body-sm text-mute",
									activeTab === tab.id && "border-ink font-medium text-ink",
								)}
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								role="tab"
								type="button"
							>
								{tab.label}
								{tab.id === "tools"
									? ` (${execution?.metrics?.toolCallCount ?? 0})`
									: ""}
							</button>
						))}
					</div>
				</div>

				<div className="p-lg">
					{activeTab === "tools" ? (
						<Table className="rounded-lg">
							<Table.ScrollContainer>
								<Table.Content
									aria-label={t("benchmark.results.toolDetails")}
									className="min-w-180 table-fixed"
								>
									<Table.Header>
										<Table.Column className="w-10">#</Table.Column>
										<Table.Column className="w-48" isRowHeader>
											{t("benchmark.results.tool")}
										</Table.Column>
										<Table.Column>
											{t("benchmark.results.arguments")}
										</Table.Column>
										<Table.Column>{t("benchmark.results.result")}</Table.Column>
										<Table.Column className="w-24">
											{t("benchmark.results.status")}
										</Table.Column>
										<Table.Column className="w-24">
											{t("benchmark.results.duration")}
										</Table.Column>
									</Table.Header>
									<Table.Body>
										{execution?.metrics?.toolCalls.map((call, index) => (
											<Table.Row
												id={`${call.name}-${index}`}
												key={`${call.name}-${index}`}
											>
												<Table.Cell className="align-middle tabular-nums">
													{index + 1}
												</Table.Cell>
												<Table.Cell className="break-all align-middle font-mono">
													{call.name}
												</Table.Cell>
												<Table.Cell className="align-middle">
													<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all bg-surface-soft p-sm font-mono text-caption-sm">
														{formatToolPayload(call.arguments)}
													</pre>
												</Table.Cell>
												<Table.Cell className="align-middle">
													<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all bg-surface-soft p-sm font-mono text-caption-sm">
														{formatToolPayload(call.result)}
													</pre>
												</Table.Cell>
												<Table.Cell className="align-middle">
													<span
														className={cn(
															"rounded-md px-sm py-xs text-caption-sm",
															call.status === "failed"
																? "bg-terminal-red/10 text-terminal-red"
																: "bg-surface-soft text-charcoal",
														)}
													>
														{call.status
															? t(`benchmark.results.toolStatus.${call.status}`)
															: "—"}
													</span>
												</Table.Cell>
												<Table.Cell className="align-middle tabular-nums">
													{formatDuration(call.durationMs)}
												</Table.Cell>
											</Table.Row>
										))}
										{!execution?.metrics?.toolCalls.length ? (
											<Table.Row id="empty">
												<Table.Cell className="text-mute" colSpan={6}>
													{t("benchmark.results.noToolCalls")}
												</Table.Cell>
											</Table.Row>
										) : null}
									</Table.Body>
								</Table.Content>
							</Table.ScrollContainer>
						</Table>
					) : null}
					{activeTab === "response" ? (
						<div className="break-words text-body-sm leading-relaxed text-body [&_code]:rounded-sm [&_code]:bg-surface-soft [&_code]:px-1 [&_pre]:my-md [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-soft [&_pre]:p-md">
							<MarkdownContent>
								{execution?.responseText ??
									execution?.terminationReason ??
									t("benchmark.results.noResponse")}
							</MarkdownContent>
						</div>
					) : null}
					{activeTab === "checks" ? (
						<div className="divide-y divide-hairline border-y border-hairline">
							{execution?.report?.checks.map((check, index) => (
								<p
									className="py-sm text-body-sm"
									key={`${check.kind}-${index}`}
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
									·{" "}
									<span>
										{t(`benchmark.results.checkMessage.${check.message}`, {
											defaultValue: check.message,
										})}
									</span>
								</p>
							))}
							{!execution?.report?.checks.length ? (
								<p className="py-sm text-mute">
									{t("benchmark.results.noData")}
								</p>
							) : null}
						</div>
					) : null}
					{activeTab === "artifacts" ? (
						<div>
							<BenchmarkFeedback
								failed={artifacts.isError}
								loading={artifacts.isLoading}
								retry={() => artifacts.refetch()}
							/>
							<div className="divide-y divide-hairline border-y border-hairline">
								{artifacts.data?.map((artifact) => (
									<button
										className="block w-full py-sm text-left text-body-sm disabled:text-mute"
										disabled={artifact.change === "deleted"}
										key={artifact.path}
										onClick={() => setArtifactPath(artifact.path)}
										type="button"
									>
										{artifact.path}{" "}
										<span className="text-mute">
											· {t(`benchmark.results.change.${artifact.change}`)}
										</span>
									</button>
								))}
							</div>
							{artifactPath ? (
								<div className="mt-md">
									<BenchmarkFeedback
										failed={artifactPreview.isError}
										loading={artifactPreview.isLoading}
										retry={() => artifactPreview.refetch()}
									/>
									{artifactPreview.data ? (
										<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-surface-soft p-md text-body-sm">
											{artifactPreview.data.text ?? t("benchmark.file.binary")}
										</pre>
									) : null}
								</div>
							) : null}
						</div>
					) : null}
				</div>

				<section className="border-t border-hairline px-lg py-md">
					<h3 className="text-body-sm font-semibold text-ink">
						{t("benchmark.results.requirements")}
					</h3>
					<p className="mt-sm whitespace-pre-wrap text-body-sm leading-relaxed text-body">
						{benchmarkCase?.prompt ?? "—"}
					</p>
				</section>
			</div>
		</aside>
	);
};

export { BenchmarkExecutionDetail };
