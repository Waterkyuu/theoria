import { useRef, useState } from "react";
import { Button, Toast } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { CheckBox } from "@/components/ui/check-box";
import { ModalProvider } from "@/components/ui/modal-provider";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { previewBenchmarkTask } from "@/api/benchmark";
import { useStartBenchmarkTask } from "@/queries/benchmark";
import type {
	BenchmarkRunOptions,
	BenchmarkRunner,
	BenchmarkMount,
	BenchmarkPreview,
	BenchmarkPreviewInput,
} from "@/types/benchmark";

type ConfigurationProps = {
	/** Fixed workspace version used for every check. */
	mount: BenchmarkMount;
	/** Published runner; native remains the default for historical definitions. */
	runner?: BenchmarkRunner;
};

const AGENTS = {
	codex: "Codex",
	claude: "Claude Code",
	opencode: "OpenCode",
	workbuddy: "WorkBuddy",
} as const;

/**
 * Freezes explicit experiment choices before preflight and launch.
 *
 * @example
 * <BenchmarkConfiguration mount={mount} />
 */
const BenchmarkConfiguration = ({
	mount,
	runner = { kind: "native" },
}: ConfigurationProps) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const startMutation = useStartBenchmarkTask();
	const idempotencyKey = useRef<string | null>(null);
	const [agents, setAgents] = useState<BenchmarkPreviewInput["agentKinds"]>([]);
	const [fileAccess, setFileAccess] =
		useState<BenchmarkPreviewInput["fileAccess"]>("allow_edits");
	const [commands, setCommands] =
		useState<BenchmarkPreviewInput["commandExecution"]>("allow");
	const [preview, setPreview] = useState<BenchmarkPreview | null>(null);
	const [checking, setChecking] = useState(false);
	const [profiles, setProfiles] = useState<BenchmarkRunOptions["profiles"]>([]);
	const [repetitions, setRepetitions] = useState(1);
	const [caseNumbers, setCaseNumbers] = useState("");
	const validCases =
		!caseNumbers.trim() || /^\d+(\s*,\s*\d+)*$/.test(caseNumbers.trim());
	const runOptions: BenchmarkRunOptions = {
		casePositions: caseNumbers.trim()
			? caseNumbers.split(",").map((value) => Number(value.trim()) - 1)
			: null,
		repetitions,
		profiles,
		runner,
	};
	const validOptions =
		validCases &&
		Number.isInteger(repetitions) &&
		repetitions >= 1 &&
		repetitions <= 10;
	const pending = checking || startMutation.isPending;

	/** Invalidates both the preflight result and its retry identity when inputs change. */
	const invalidatePreview = () => {
		setPreview(null);
		idempotencyKey.current = null;
	};

	/** Shows the exact checked configuration and does not pretend that execution has started. */
	const check = async () => {
		if (!agents.length || pending || !validOptions) return;
		setChecking(true);
		setPreview(null);
		try {
			setPreview(
				await previewBenchmarkTask({
					workspaceId: mount.workspaceId,
					mountId: mount.id,
					expectedVersionId: mount.versionId,
					agentKinds: agents,
					fileAccess,
					commandExecution: commands,
					runOptions,
				}),
			);
			Toast.toast.success(t("benchmark.checked"));
		} catch (error) {
			handleError(error, "Benchmark preflight failed", true);
		} finally {
			setChecking(false);
		}
	};

	/** Creates one Task for the checked request and opens its persisted result route. */
	const start = async () => {
		if (!preview || preview.issues.length || pending) return;
		idempotencyKey.current ??= crypto.randomUUID();
		try {
			const detail = await startMutation.mutateAsync({
				workspaceId: mount.workspaceId,
				mountId: mount.id,
				expectedVersionId: mount.versionId,
				agentKinds: agents,
				fileAccess,
				runOptions,
				commandExecution: commands,
				idempotencyKey: idempotencyKey.current,
			});
			Toast.toast.success(t("benchmark.started"));
			navigate(
				`/workspaces/${encodeURIComponent(mount.workspaceId)}/task/${encodeURIComponent(detail.task.id)}`,
			);
		} catch (error) {
			handleError(error, "Benchmark start failed", true);
		}
	};
	return (
		<ModalProvider
			title={t("benchmark.configure")}
			trigger={<Button>{t("benchmark.configure")}</Button>}
		>
			<p className="text-body-sm text-body">{t("benchmark.modelHint")}</p>
			<fieldset className="flex flex-col gap-md" disabled={pending}>
				<legend className="mb-sm text-body-sm font-medium">
					{t("benchmark.agents")}
				</legend>
				{(Object.keys(AGENTS) as Array<keyof typeof AGENTS>).map((kind) => (
					<CheckBox
						key={kind}
						label={AGENTS[kind]}
						isDisabled={pending}
						isSelected={agents.includes(kind)}
						onChange={(selected) => {
							setProfiles((current) =>
								selected
									? [
											...current,
											{
												agentKind: kind,
												label: AGENTS[kind],
												model: null,
												mode: null,
												version: null,
											},
										]
									: current.filter((profile) => profile.agentKind !== kind),
							);
							setAgents(
								selected
									? [...agents, kind]
									: agents.filter((agent) => agent !== kind),
							);
							invalidatePreview();
						}}
					/>
				))}
			</fieldset>
			<fieldset className="flex flex-col gap-md" disabled={pending}>
				<label className="flex flex-col gap-xs text-body-sm text-charcoal">
					{t("benchmark.experiment.repetitions")}
					<input
						className="rounded-md border border-hairline bg-canvas px-md py-sm"
						type="number"
						min={1}
						max={10}
						value={Number.isNaN(repetitions) ? "" : repetitions}
						onChange={(event) => {
							setRepetitions(event.target.valueAsNumber);
							invalidatePreview();
						}}
					/>
				</label>
				<label className="flex flex-col gap-xs text-body-sm text-charcoal">
					{t("benchmark.experiment.caseNumbers")}
					<input
						className="rounded-md border border-hairline bg-canvas px-md py-sm"
						value={caseNumbers}
						aria-label={t("benchmark.experiment.caseNumbers")}
						aria-invalid={!validCases}
						onChange={(event) => {
							setCaseNumbers(event.target.value);
							invalidatePreview();
						}}
					/>
					<span className="text-caption-sm text-mute">
						{t("benchmark.experiment.caseHint")}
					</span>
				</label>
				{profiles.map((profile, index) => (
					<div
						className="space-y-sm rounded-md border border-hairline p-md"
						key={index}
					>
						<p className="text-body-sm font-medium text-ink">{profile.label}</p>
						{(
							[
								"model",
								"mode",
								...(runner.kind === "harbor" ? (["version"] as const) : []),
							] as const
						).map((field) => (
							<label
								className="flex flex-col gap-xs text-body-sm text-charcoal"
								key={field}
							>
								{t(`benchmark.experiment.${field}`, { number: index + 1 })}
								<input
									className="rounded-md border border-hairline bg-canvas px-md py-sm"
									value={profile[field] ?? ""}
									maxLength={200}
									onChange={(event) => {
										setProfiles(
											profiles.map((item, position) =>
												position === index
													? { ...item, [field]: event.target.value || null }
													: item,
											),
										);
										invalidatePreview();
									}}
								/>
							</label>
						))}
						<div className="flex flex-wrap gap-sm">
							<Button
								size="sm"
								variant="secondary"
								isDisabled={profiles.length >= 8}
								onPress={() => {
									setProfiles([
										...profiles,
										{
											...profile,
											label: t("benchmark.experiment.configuration", {
												number: profiles.length + 1,
											}),
										},
									]);
									invalidatePreview();
								}}
							>
								{t("benchmark.experiment.duplicate")}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								isDisabled={profiles.length === 1}
								onPress={() => {
									setProfiles(
										profiles.filter((_, position) => position !== index),
									);
									invalidatePreview();
								}}
							>
								{t("benchmark.experiment.remove")}
							</Button>
						</div>
					</div>
				))}
			</fieldset>
			<Select
				isDisabled={pending}
				label={t("benchmark.fileAccess")}
				placeholder={t("benchmark.fileAccess")}
				value={fileAccess}
				onChange={(value) => {
					if (value) setFileAccess(value);
					invalidatePreview();
				}}
				options={(["read_only", "allow_edits"] as const).map((value) => ({
					value,
					label: t(`benchmark.${value}`),
				}))}
			/>
			<Select
				isDisabled={pending}
				label={t("benchmark.commandExecution")}
				placeholder={t("benchmark.commandExecution")}
				value={commands}
				onChange={(value) => {
					if (value) setCommands(value);
					invalidatePreview();
				}}
				options={(["deny", "ask", "allow"] as const).map((value) => ({
					value,
					label: t(`benchmark.${value}`),
				}))}
			/>
			<Button
				isPending={checking}
				isDisabled={!agents.length || !validOptions || startMutation.isPending}
				onPress={check}
			>
				{t("benchmark.preflight")}
			</Button>
			{preview && (
				<div
					className="space-y-sm rounded-md border border-hairline p-md"
					aria-live="polite"
				>
					<p>
						{t("benchmark.planned", {
							cases: preview.cases.length,
							agents: preview.agentKinds.length,
							count: preview.executionCount,
						})}
					</p>
					{!preview.issues.length ? (
						<p>{t("benchmark.checkPassed")}</p>
					) : (
						<ul className="list-inside list-disc text-body-sm">
							{preview.issues.map((issue, index) => (
								<li key={index}>
									{issue.agentKind
										? `${AGENTS[issue.agentKind]}: `
										: issue.casePosition !== null
											? `${preview.cases[issue.casePosition]?.name}: `
											: ""}
									{t(`benchmark.issues.${issue.code}`)}
								</li>
							))}
						</ul>
					)}
				</div>
			)}
			{preview && !preview.issues.length && (
				<Button isPending={startMutation.isPending} onPress={start}>
					{t("benchmark.start")}
				</Button>
			)}
		</ModalProvider>
	);
};

export { BenchmarkConfiguration };
