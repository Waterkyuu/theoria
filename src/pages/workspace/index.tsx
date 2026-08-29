import { useEffect, useState } from "react";
import { CircleCheckFill, CodeTrunk } from "@gravity-ui/icons";
import { useTranslation } from "react-i18next";
import { AgentEnvironmentDropdown } from "@/components/share/agent-environment-dropdown";
import { checkAgentProcesses, onAgentProcessStatesChanged } from "@/api/agent";
import { checkClaudeLogin } from "@/api/claude";
import { checkCodexLogin } from "@/api/codex";
import { checkOpenCodeLogin } from "@/api/opencode";
import { checkWorkBuddyConfig, checkWorkBuddyLogin } from "@/api/workbuddy";
import { Composer } from "@/pages/workspace/components/composer";
import type {
	AgentKind,
	AgentProcessStates,
	AgentRuntimeState,
	AgentRuntimeStatus,
} from "@/types/agent";

type WorkspacePageProps = {
	/** Workspace shown by the composer, or undefined for the unbound homepage. */
	workspaceName?: string;
};

type SubmittedTask = {
	/** Normalized task content displayed in the conversation. */
	task: string;
	/** Number of agents selected when the task was dispatched. */
	agentCount: number;
};

const AGENT_KINDS = ["codex", "claude", "opencode", "workbuddy"] as const;

const AGENT_LOGIN_CHECKS: Record<AgentKind, () => Promise<AgentRuntimeStatus>> =
	{
		claude: checkClaudeLogin,
		codex: checkCodexLogin,
		opencode: checkOpenCodeLogin,
		workbuddy: checkWorkBuddyLogin,
	};

const INITIAL_ENVIRONMENT_RUNTIMES = Object.fromEntries(
	AGENT_KINDS.map((agent) => [agent, { status: "checking" }]),
) as Record<AgentKind, AgentRuntimeState>;

const WorkspacePage = ({ workspaceName }: WorkspacePageProps) => {
	const { t } = useTranslation();
	const [submittedTask, setSubmittedTask] = useState<SubmittedTask | null>(
		null,
	);
	const [environmentRuntimes, setEnvironmentRuntimes] = useState(
		INITIAL_ENVIRONMENT_RUNTIMES,
	);
	const [agentProcesses, setAgentProcesses] =
		useState<AgentProcessStates | null>(null);

	useEffect(() => {
		let isActive = true;

		Promise.all(
			AGENT_KINDS.map(async (agent) => {
				try {
					const runtime = await AGENT_LOGIN_CHECKS[agent]();
					if (agent !== "workbuddy" || !runtime.loggedIn) {
						return [agent, { status: "resolved", value: runtime }] as const;
					}

					try {
						const config = await checkWorkBuddyConfig();
						return [
							agent,
							{ status: "resolved", value: { ...runtime, ...config } },
						] as const;
					} catch {
						return [agent, { status: "resolved", value: runtime }] as const;
					}
				} catch {
					return [agent, { status: "failed" }] as const;
				}
			}),
		).then((entries) => {
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

		/**
		 * Applies native process snapshots only while this Workspace remains mounted.
		 *
		 * @example
		 * applyProcessStates({ claude: false, codex: true, opencode: false, workbuddy: false });
		 */
		const applyProcessStates = (states: AgentProcessStates) => {
			if (isActive) {
				setAgentProcesses(states);
			}
		};

		const stopListening = onAgentProcessStatesChanged(applyProcessStates);
		stopListening
			.then(() => checkAgentProcesses())
			.then((states) => {
				if (isActive) {
					setAgentProcesses((current) => current ?? states);
				}
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

	/**
	 * Stores the dispatch summary outside the composer so the page can render its result.
	 *
	 * @example
	 * submitTask("Check the project", 1);
	 */
	const submitTask = (task: string, agentCount: number) => {
		setSubmittedTask({ task, agentCount });
	};

	return (
		<main className="relative flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			{workspaceName ? (
				<header className="flex h-[34px] shrink-0 items-center justify-between border-b border-hairline px-4 sm:px-xl">
					<p className="truncate text-body-sm font-medium text-charcoal">
						{t("workspace.breadcrumb")}
					</p>
					<div className="hidden items-center gap-sm text-caption-sm text-body sm:flex">
						<CodeTrunk aria-hidden="true" className="size-4" />
						<span>{t("workspace.workspacePath")}</span>
					</div>
				</header>
			) : null}

			<section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-48 pt-lg sm:px-xl sm:pt-xl">
				<div className="mx-auto flex w-full max-w-195 flex-1 flex-col justify-center">
					{submittedTask ? (
						<div className="space-y-lg">
							<div className="ml-auto max-w-[90%] rounded-lg bg-surface-dark px-lg py-md text-body-sm text-on-dark sm:max-w-[72%]">
								{submittedTask.task}
							</div>
							<div className="flex items-center gap-sm text-body-sm text-body">
								<CircleCheckFill
									aria-hidden="true"
									className="size-4 text-ink"
								/>
								{t("workspace.dispatched", {
									count: submittedTask.agentCount,
								})}
							</div>
						</div>
					) : null}
				</div>
			</section>

			<Composer
				agentKinds={AGENT_KINDS}
				agentProcesses={agentProcesses}
				environmentRuntimes={environmentRuntimes}
				onSubmit={submitTask}
				workspaceName={workspaceName}
			/>

			<AgentEnvironmentDropdown
				agentKinds={AGENT_KINDS}
				agentProcesses={agentProcesses}
				environmentRuntimes={environmentRuntimes}
			/>
		</main>
	);
};

export default WorkspacePage;
