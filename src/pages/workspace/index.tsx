import { useEffect, useState } from "react";
import { CodeTrunk, LayoutColumns3 } from "@gravity-ui/icons";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentEnvironmentDropdown } from "@/components/share/agent-environment-dropdown";
import { handleError } from "@/utils/error";
import { promisePool } from "@/utils/promise-pool";
import { checkAgentProcesses, onAgentProcessStatesChanged } from "@/api/agent";
import { checkClaudeInitStatus } from "@/api/claude";
import { checkCodexInitStatus } from "@/api/codex";
import { checkOpenCodeInitStatus } from "@/api/opencode";
import { checkWorkBuddyInitStatus } from "@/api/workbuddy";
import { AGENT_KINDS } from "@/constants/agent";
import { AgentPanel } from "@/pages/workspace/components/agent-panel";
import {
	Composer,
	type ComposerSubmission,
} from "@/pages/workspace/components/composer";
import { FollowUpComposer } from "@/pages/workspace/components/follow-up-composer";
import { TaskResultSummary } from "@/pages/workspace/components/task-result-summary";
import { useSkills, useWorkspaceSkills } from "@/queries/skill";
import {
	useContinueTask,
	useCreateTask,
	useRunTask,
	useStopTaskAgent,
	useTask,
} from "@/queries/task";
import { useWorkspaces } from "@/queries/workspace";
import type {
	AgentKind,
	AgentProcessStates,
	AgentRuntimeState,
	AgentRuntimeStatus,
} from "@/types/agent";
import type { CreateTaskRequest, TaskDetail } from "@/types/task";

type WorkspacePageProps = {
	/** Workspace route identifier, or undefined for a normal Task. */
	workspaceId?: string;
	/** Existing Task restored into this surface, or undefined for a new Task draft. */
	taskId?: string;
};

const AGENT_INIT_CHECKS: Record<AgentKind, () => Promise<AgentRuntimeStatus>> =
	{
		claude: checkClaudeInitStatus,
		codex: checkCodexInitStatus,
		opencode: checkOpenCodeInitStatus,
		workbuddy: checkWorkBuddyInitStatus,
	};

const INITIAL_ENVIRONMENT_RUNTIMES = Object.fromEntries(
	AGENT_KINDS.map((agent) => [agent, { status: "checking" }]),
) as Record<AgentKind, AgentRuntimeState>;

const PANEL_GRID_CLASSES: Record<number, string> = {
	1: "grid-cols-1",
	2: "grid-cols-1 xl:grid-cols-2",
	3: "grid-cols-1 xl:grid-cols-3",
	4: "grid-cols-1 lg:grid-cols-2",
	5: "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3",
	6: "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3",
};

/** Derives a compact immutable Task title from the first meaningful prompt line. */
const taskTitleFromPrompt = (prompt: string) =>
	prompt
		.split("\n")
		.find((line) => line.trim().length > 0)
		?.trim()
		.slice(0, 80) ?? prompt.slice(0, 80);

/** Moves the BrowserRouter to the stable Task URL only after native creation returns an id. */
const openCreatedTask = (task: TaskDetail) => {
	const path = task.task.workspaceId
		? `/workspaces/${encodeURIComponent(task.task.workspaceId)}/task/${encodeURIComponent(task.task.id)}`
		: `/task/${encodeURIComponent(task.task.id)}`;
	window.history.pushState({}, "", path);
	window.dispatchEvent(new PopStateEvent("popstate"));
};

const WorkspacePage = ({ workspaceId, taskId }: WorkspacePageProps) => {
	const { t } = useTranslation();
	const [createdTask, setCreatedTask] = useState<TaskDetail | null>(null);
	const [isResultSummaryOpen, setIsResultSummaryOpen] = useState(false);
	const [environmentRuntimes, setEnvironmentRuntimes] = useState(
		INITIAL_ENVIRONMENT_RUNTIMES,
	);
	const [agentProcesses, setAgentProcesses] =
		useState<AgentProcessStates | null>(null);
	const taskQuery = useTask(taskId ?? null);
	const workspacesQuery = useWorkspaces();
	const skillLibraryQuery = useSkills();
	const workspaceSkillsQuery = useWorkspaceSkills(workspaceId ?? null);
	const createTaskMutation = useCreateTask();
	const continueTaskMutation = useContinueTask();
	const runTaskMutation = useRunTask();
	const stopTaskAgentMutation = useStopTaskAgent();
	const task = taskQuery.data ?? createdTask;
	const workspace = workspacesQuery.data?.find(
		(item) => item.id === workspaceId,
	);
	const workspaceName = workspace?.name ?? workspaceId;
	const availableSkills = workspaceId
		? (workspaceSkillsQuery.data ?? [])
		: (skillLibraryQuery.data ?? []);

	useEffect(() => {
		let isActive = true;

		promisePool(AGENT_KINDS, async (agent) => {
			try {
				const runtime = await AGENT_INIT_CHECKS[agent]();
				return [agent, { status: "resolved", value: runtime }] as const;
			} catch {
				return [agent, { status: "failed" }] as const;
			}
		}).then((entries) => {
			if (isActive) {
				setEnvironmentRuntimes(
					Object.fromEntries(entries) as Record<AgentKind, AgentRuntimeState>,
				);
			}
		});

		return () => {
			isActive = false;
		};
	}, []);

	useEffect(() => {
		let isActive = true;

		/** Applies native process snapshots only while this Workspace remains mounted. */
		const applyProcessStates = (states: AgentProcessStates) => {
			if (isActive) setAgentProcesses(states);
		};

		const stopListening = onAgentProcessStatesChanged(applyProcessStates);
		stopListening
			.then(() => checkAgentProcesses())
			.then((states) => {
				if (isActive) setAgentProcesses((current) => current ?? states);
			})
			.catch(() => {
				// A later native event can still supply a valid process snapshot.
			});

		return () => {
			isActive = false;
			stopListening.then(
				(stop) => stop(),
				() => {},
			);
		};
	}, []);

	/** Creates the Task once, opens its stable route, and starts sibling Executions concurrently. */
	const submitTask = async (submission: ComposerSubmission) => {
		const request: CreateTaskRequest = {
			workspaceId: workspaceId ?? null,
			title: taskTitleFromPrompt(submission.prompt),
			prompt: submission.prompt,
			agents: submission.agents,
			fileAccess: "allow_edits",
			commandExecution: "allow",
			skillIds: submission.skillIds,
		};
		try {
			const detail = await createTaskMutation.mutateAsync(request);
			setCreatedTask(detail);
			openCreatedTask(detail);
			runTaskMutation.mutate(detail.task.id);
		} catch (error) {
			handleError(error, "Task creation failed");
		}
	};

	/** Continues the restored Task without changing any frozen configuration. */
	const continueExistingTask = async (
		prompt: string,
		taskAgentIds: string[],
	) => {
		if (!task) return;
		try {
			await continueTaskMutation.mutateAsync({
				taskId: task.task.id,
				prompt,
				taskAgentIds,
			});
		} catch (error) {
			handleError(error, "Task continuation failed");
		}
	};

	return (
		<main className="relative flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			{workspaceId || task ? (
				<header className="flex h-[34px] shrink-0 items-center justify-between border-b border-hairline px-4 sm:px-xl">
					<p className="truncate text-body-sm font-medium text-charcoal">
						{task
							? task.task.title
							: t("workspace.breadcrumb", { workspace: workspaceName })}
					</p>
					<div className="flex shrink-0 items-center gap-md">
						{workspaceId ? (
							<div className="hidden items-center gap-sm text-caption-sm text-body sm:flex">
								<CodeTrunk aria-hidden="true" className="size-4" />
								<span className="max-w-64 truncate">
									{t("workspace.workspacePath", {
										workspace: workspace?.sourcePath ?? workspaceName,
									})}
								</span>
							</div>
						) : null}
						{task ? (
							<button
								aria-pressed={isResultSummaryOpen}
								className="flex h-7 items-center gap-xs rounded-md border border-hairline bg-surface-card px-sm text-caption-sm font-medium text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
								onClick={() => setIsResultSummaryOpen((open) => !open)}
								type="button"
							>
								<LayoutColumns3 aria-hidden="true" className="size-4" />
								{t("taskSummary.open")}
							</button>
						) : null}
					</div>
				</header>
			) : null}

			<div className="flex min-h-0 flex-1">
				<section
					className={cn(
						"min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pt-lg sm:px-xl sm:pt-xl",
						task ? "pb-44" : "pb-48",
					)}
				>
					{taskQuery.isLoading && taskId ? (
						<div
							aria-label={t("taskPanel.loading")}
							className="grid gap-lg"
							role="status"
						>
							<div className="h-40 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />
						</div>
					) : null}
					{task ? (
						<div
							className={cn(
								"mx-auto grid w-full max-w-330 gap-lg",
								PANEL_GRID_CLASSES[task.agents.length] ?? "grid-cols-1",
							)}
						>
							{task.agents.map((agent) => (
								<AgentPanel
									agent={agent}
									key={agent.id}
									onStop={(taskAgentId) =>
										stopTaskAgentMutation.mutate(taskAgentId)
									}
									prompt={task.task.prompt}
									result={task.results.find(
										(result) => result.taskAgentId === agent.id,
									)}
									stopPending={stopTaskAgentMutation.isPending}
									turns={task.turns.filter(
										(turn) => turn.taskAgentId === agent.id,
									)}
								/>
							))}
						</div>
					) : null}
					{createTaskMutation.error ? (
						<p
							className="mx-auto max-w-180 rounded-lg border border-terminal-red/30 bg-terminal-red/5 px-lg py-md text-body-sm text-charcoal"
							role="alert"
						>
							{t("taskPanel.createFailed")}
						</p>
					) : null}
				</section>
				{task && isResultSummaryOpen ? (
					<TaskResultSummary
						onClose={() => setIsResultSummaryOpen(false)}
						task={task}
					/>
				) : null}
			</div>

			{!task && !taskId ? (
				<Composer
					agentKinds={AGENT_KINDS}
					agentProcesses={agentProcesses}
					availableSkills={availableSkills}
					environmentRuntimes={environmentRuntimes}
					isSubmitting={createTaskMutation.isPending}
					onSubmit={submitTask}
					workspaceName={workspaceName}
					workspaceSkillsLocked={Boolean(workspaceId)}
				/>
			) : null}

			{task ? (
				<FollowUpComposer
					agents={task.agents}
					isSubmitting={continueTaskMutation.isPending}
					onSubmit={continueExistingTask}
				/>
			) : null}

			<AgentEnvironmentDropdown
				agentKinds={AGENT_KINDS}
				agentProcesses={agentProcesses}
				environmentRuntimes={environmentRuntimes}
			/>
		</main>
	);
};

export default WorkspacePage;
