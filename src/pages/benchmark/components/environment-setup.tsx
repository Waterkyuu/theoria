import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { Loading } from "@/components/ui/loading";
import { ModalProvider } from "@/components/ui/modal-provider";
import { handleError } from "@/utils/error";
import {
	inspectBenchmarkEnvironment,
	repairBenchmarkEnvironment,
} from "@/api/benchmark";

type BenchmarkEnvironmentSetupProps = {
	/**
	 * Invalidates any preflight performed before the environment changed.
	 */
	onChange?: () => void;
};

/**
 * Probes only on opening, and keeps installation behind explicit user actions.
 *
 * @example
 * <BenchmarkEnvironmentSetup onChange={invalidatePreview} />
 */
const BenchmarkEnvironmentSetup = ({
	onChange,
}: BenchmarkEnvironmentSetupProps) => {
	const { t } = useTranslation();
	const client = useQueryClient();
	const [open, setOpen] = useState(false);
	const [watchUntil, setWatchUntil] = useState(0);
	const query = useQuery({
		queryKey: ["benchmark-environment"],
		queryFn: inspectBenchmarkEnvironment,
		enabled: open,
		retry: false,
		refetchInterval: (current) =>
			open && Date.now() < watchUntil && current.state.data?.docker !== "ready"
				? 3000
				: false,
	});
	const repair = useMutation({
		mutationFn: repairBenchmarkEnvironment,
		onSuccess: (state, action) => {
			client.setQueryData(["benchmark-environment"], state);
			onChange?.();
			if (action === "startDocker") setWatchUntil(Date.now() + 120000);
			toast.success(
				t(
					action === "startDocker"
						? "benchmark.environment.starting"
						: "benchmark.environment.completed",
				),
			);
		},
		onError: (error) =>
			handleError(
				error,
				"Environment preparation failed",
				true,
				t("benchmark.environment.failed"),
			),
	});
	const state = query.data;
	const pending = repair.isPending || query.isFetching;

	/**
	 * Keeps installer permission prompts in Docker's official setup flow.
	 */
	const installDocker = async () => {
		if (!state) return;
		try {
			await openUrl(state.dockerInstallUrl);
			setWatchUntil(Date.now() + 300000);
			toast.success(t("benchmark.environment.opened"));
		} catch (error) {
			handleError(error, "Docker installer could not be opened", true);
		}
	};

	/**
	 * A manual recheck also expires any earlier benchmark prerequisite result.
	 */
	const recheck = async () => {
		const result = await query.refetch();
		onChange?.();
		if (result.error)
			handleError(result.error, "Environment check failed", true);
		else toast.success(t("benchmark.environment.completed"));
	};

	return (
		<ModalProvider
			title={t("benchmark.environment.title")}
			trigger={
				<Button variant="secondary">{t("benchmark.environment.action")}</Button>
			}
			onOpenChange={setOpen}
		>
			<p className="text-body-sm text-charcoal">
				{t("benchmark.environment.description")}
			</p>
			{query.isLoading ? <Loading variant="section" /> : null}
			{query.isError ? (
				<p role="alert" className="text-body-sm text-terminal-red">
					{t("benchmark.environment.retry")}
				</p>
			) : null}
			{state ? (
				<>
					<dl className="divide-y divide-hairline rounded-md border border-hairline px-md">
						{(["harbor", "docker", "verifierImage"] as const).map(
							(dependency) => (
								<div
									key={dependency}
									className="flex flex-wrap items-center justify-between gap-sm py-md text-body-sm"
								>
									<dt className="font-medium text-ink">
										{t(`benchmark.environment.${dependency}`)}
									</dt>
									<dd className="text-charcoal">
										{t(`benchmark.environment.state.${state[dependency]}`)}
									</dd>
								</div>
							),
						)}
					</dl>
					<div className="flex flex-wrap gap-sm">
						{state.harbor !== "ready" ? (
							<Button
								isDisabled={pending}
								onPress={() => repair.mutate("installHarbor")}
							>
								{t("benchmark.environment.installHarbor")}
							</Button>
						) : null}
						{state.docker === "missing" ? (
							<Button isDisabled={pending} onPress={installDocker}>
								{t("benchmark.environment.installDocker")}
							</Button>
						) : null}
						{state.docker === "unavailable" ? (
							<Button
								isDisabled={pending}
								onPress={() => repair.mutate("startDocker")}
							>
								{t("benchmark.environment.startDocker")}
							</Button>
						) : null}
						{state.docker === "ready" && state.verifierImage !== "ready" ? (
							<Button
								isDisabled={pending}
								onPress={() => repair.mutate("prepareVerifier")}
							>
								{t("benchmark.environment.prepareVerifier")}
							</Button>
						) : null}
						<Button
							variant="ghost"
							isDisabled={pending}
							onPress={installDocker}
						>
							{t("benchmark.environment.help")}
						</Button>
					</div>
					<p className="text-caption-sm text-mute">
						{t("benchmark.environment.harborHint")}
					</p>
					<p className="text-caption-sm text-mute">
						{t("benchmark.environment.dockerHint")}
					</p>
					<p className="text-caption-sm text-mute">
						{t("benchmark.environment.imageHint")}
					</p>
				</>
			) : null}
			{repair.isPending ? (
				<p role="status" className="text-body-sm text-charcoal">
					{t("benchmark.environment.busy")}
				</p>
			) : null}
			<Button
				variant="secondary"
				isPending={query.isFetching}
				isDisabled={repair.isPending}
				onPress={recheck}
			>
				{t("benchmark.environment.check")}
			</Button>
		</ModalProvider>
	);
};

export { BenchmarkEnvironmentSetup };
