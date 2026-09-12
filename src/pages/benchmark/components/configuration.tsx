import { useState } from "react";
import { Button, Toast } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { CheckBox } from "@/components/ui/check-box";
import { ModalProvider } from "@/components/ui/modal-provider";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { previewBenchmarkTask } from "@/api/benchmark";
import type {
	BenchmarkMount,
	BenchmarkPreview,
	BenchmarkPreviewInput,
} from "@/types/benchmark";
type ConfigurationProps = {
	/** Fixed workspace version used for every check. */ mount: BenchmarkMount;
};
const AGENTS = {
	codex: "Codex",
	claude: "Claude Code",
	opencode: "OpenCode",
	workbuddy: "WorkBuddy",
} as const;
/** Explicit permissions and local product choices never include a model override. @example <BenchmarkConfiguration mount={mount} /> */
const BenchmarkConfiguration = ({ mount }: ConfigurationProps) => {
	const { t } = useTranslation();
	const [agents, setAgents] = useState<BenchmarkPreviewInput["agentKinds"]>([]);
	const [fileAccess, setFileAccess] =
		useState<BenchmarkPreviewInput["fileAccess"]>("allow_edits");
	const [commands, setCommands] =
		useState<BenchmarkPreviewInput["commandExecution"]>("allow");
	const [preview, setPreview] = useState<BenchmarkPreview | null>(null);
	const [pending, setPending] = useState(false);
	/** Shows the exact checked configuration and does not pretend that execution has started. */
	const check = async () => {
		if (!agents.length || pending) return;
		setPending(true);
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
				}),
			);
			Toast.toast.success(t("benchmark.checked"));
		} catch (error) {
			handleError(error, "Benchmark preflight failed", true);
		} finally {
			setPending(false);
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
							setAgents(
								selected
									? [...agents, kind]
									: agents.filter((agent) => agent !== kind),
							);
							setPreview(null);
						}}
					/>
				))}
			</fieldset>
			<Select
				isDisabled={pending}
				label={t("benchmark.fileAccess")}
				placeholder={t("benchmark.fileAccess")}
				value={fileAccess}
				onChange={(value) => {
					if (value) setFileAccess(value);
					setPreview(null);
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
					setPreview(null);
				}}
				options={(["deny", "ask", "allow"] as const).map((value) => ({
					value,
					label: t(`benchmark.${value}`),
				}))}
			/>
			<Button isPending={pending} isDisabled={!agents.length} onPress={check}>
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
			<p className="text-body-sm text-body">
				{t("benchmark.executionPending")}
			</p>
		</ModalProvider>
	);
};
export { BenchmarkConfiguration };
