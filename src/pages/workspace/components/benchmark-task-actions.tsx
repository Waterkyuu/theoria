import { useRef, useState } from "react";
import { ArrowsRotateRight, Stop } from "@gravity-ui/icons";
import { Button, Toast } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { CheckBox } from "@/components/ui/check-box";
import { ModalProvider } from "@/components/ui/modal-provider";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { AGENT_KINDS } from "@/constants/agent";
import {
	useCancelBenchmarkTask,
	useRerunBenchmarkTask,
} from "@/queries/benchmark";
import type { BenchmarkTaskDetail } from "@/types/benchmark";

type BenchmarkTaskActionsProps = {
	/** Persisted Task state that controls available lifecycle actions. */
	detail: BenchmarkTaskDetail;
};

const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "stopped"]);

/** Reads the stable IPC code without introducing a broad response type guard.
 * @example benchmarkErrorCode(error)
 */
const benchmarkErrorCode = (error: unknown) =>
	typeof error === "object" && error !== null && "code" in error
		? String(error.code)
		: null;

/** Keeps cancellation and exact-version Rerun state outside the result presentation.
 * @example <BenchmarkTaskActions detail={detail} />
 */
const BenchmarkTaskActions = ({ detail }: BenchmarkTaskActionsProps) => {
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
	const [rerunOpen, setRerunOpen] = useState(false);
	const [restoreConfirmation, setRestoreConfirmation] = useState(false);
	const active =
		detail.task.status === "preparing" || detail.task.status === "running";
	const terminal = TERMINAL_TASK_STATUSES.has(detail.task.status);

	/** Requests cooperative cancellation only while this Task is still active. */
	const cancel = () => {
		if (cancelMutation.isPending || detail.cancelRequested) return;
		cancelMutation.mutate(detail.task.id, {
			onError: (error) =>
				handleError(error, "Benchmark cancellation failed", true),
			onSuccess: () => Toast.toast.success(t("benchmark.cancelRequested")),
		});
	};

	/** Reuses the historical version and requires explicit mount restoration consent.
	 * @example rerun(false)
	 */
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
			if (benchmarkErrorCode(error) === "BENCHMARK_MOUNT_REQUIRED") {
				setRestoreConfirmation(true);
				return;
			}
			handleError(error, "Benchmark rerun failed", true);
		}
	};

	return (
		<div className="flex shrink-0 items-center gap-sm">
			{active ? (
				<button
					aria-label={
						detail.cancelRequested
							? t("benchmark.cancelling")
							: t("benchmark.cancelRun")
					}
					disabled={detail.cancelRequested || cancelMutation.isPending}
					onClick={cancel}
					type="button"
				>
					<Stop aria-hidden="true" className="size-4 text-danger" />
				</button>
			) : null}
			{terminal ? (
				<>
					<button
						aria-label={t("benchmark.rerun")}
						onClick={() => setRerunOpen(true)}
						type="button"
					>
						<ArrowsRotateRight aria-hidden="true" className="size-4" />
					</button>
					<ModalProvider
						title={t("benchmark.rerun")}
						description={t("benchmark.rerunDescription")}
						isOpen={rerunOpen}
						onOpenChange={setRerunOpen}
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
				</>
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

export { BenchmarkTaskActions };
