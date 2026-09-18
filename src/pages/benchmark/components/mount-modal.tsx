import { useState } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ModalProvider } from "@/components/ui/modal-provider";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { mountBenchmark } from "@/api/benchmark";
import { useWorkspaces } from "@/queries/workspace";
import type { BenchmarkSummary } from "@/types/benchmark";
import { BenchmarkFeedback } from "./feedback";

type MountProps = {
	/** Card whose displayed version is being mounted. */
	benchmark: BenchmarkSummary;
	/** Closes the externally selected card modal. */
	onClose: () => void;
};

/**
 * Pins the version shown on the card and opens the persisted mount, including an existing older one.
 *
 * @example
 * <BenchmarkMountModal benchmark={suite} onClose={close} />
 */
const BenchmarkMountModal = ({ benchmark, onClose }: MountProps) => {
	const { t } = useTranslation();
	const query = useWorkspaces();
	const client = useQueryClient();
	const navigate = useNavigate();
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	/** Uses the returned relationship so repeated Mount cannot silently change versions. */
	const mount = async () => {
		if (!workspaceId || pending) return;
		setPending(true);
		try {
			const result = await mountBenchmark(
				workspaceId,
				benchmark.id,
				benchmark.versionId,
			);
			await client.invalidateQueries({
				queryKey: ["benchmarks", "mounts", workspaceId],
			});
			Toast.toast.success(t("benchmark.mounted"));
			onClose();
			navigate(
				`/workspaces/${encodeURIComponent(workspaceId)}/benchmark/${encodeURIComponent(result.id)}`,
			);
		} catch (error) {
			handleError(error, "Benchmark mount failed", true);
		} finally {
			setPending(false);
		}
	};
	return (
		<ModalProvider
			isOpen
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
			title={t("benchmark.mountTitle", { name: benchmark.name })}
			footer={
				<Button
					isPending={pending}
					isDisabled={!workspaceId || query.isError}
					onPress={mount}
				>
					{t("benchmark.mount")}
				</Button>
			}
		>
			<BenchmarkFeedback
				loading={query.isLoading}
				failed={query.isError}
				retry={() => query.refetch()}
			/>
			{query.data?.length === 0 ? (
				<p>{t("benchmark.noWorkspaces")}</p>
			) : (
				<Select
					label={t("benchmark.workspace")}
					placeholder={t("benchmark.chooseWorkspace")}
					value={workspaceId}
					onChange={setWorkspaceId}
					options={(query.data ?? []).map((workspace) => ({
						value: workspace.id,
						label: workspace.name,
					}))}
				/>
			)}
		</ModalProvider>
	);
};

export { BenchmarkMountModal };
