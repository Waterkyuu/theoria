import { useState } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { handleError } from "@/utils/error";
import { saveBenchmarkDraft, unmountBenchmark } from "@/api/benchmark";
import {
	useArchiveBenchmark,
	useBenchmark,
	useUpdateBenchmarkMount,
} from "@/queries/benchmark";
import type { BenchmarkMount } from "@/types/benchmark";
import { BenchmarkConfiguration } from "./configuration";
import { BenchmarkFeedback } from "./feedback";
import { BenchmarkMountModal } from "./mount-modal";

type DetailProps = {
	/** Definition selected by catalog or workspace mount. */
	benchmarkId: string;
	/** Workspace context pins the content and enables configuration. */
	mount?: BenchmarkMount;
};

/**
 * Shares catalog and workspace details while preserving the mounted version.
 *
 * @example
 * <BenchmarkDetailView benchmarkId="suite" mount={mount} />
 */
const BenchmarkDetailView = ({ benchmarkId, mount }: DetailProps) => {
	const { t } = useTranslation();
	const query = useBenchmark(benchmarkId, mount?.versionId ?? null);
	const [mountOpen, setMountOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const archiveMutation = useArchiveBenchmark();
	const updateMountMutation = useUpdateBenchmarkMount();
	const navigate = useNavigate();
	const client = useQueryClient();

	/** Opens immutable content as either a linked personal edit or an independent copy. */
	const createDraft = async (definitionId: string | null) => {
		if (!query.data || pending) return;
		setPending(true);
		try {
			const draft = await saveBenchmarkDraft(
				query.data.document,
				null,
				null,
				definitionId,
			);
			await client.invalidateQueries({ queryKey: ["benchmarks", "drafts"] });
			Toast.toast.success(t("benchmark.copied"));
			navigate(`/benchmark/drafts/${encodeURIComponent(draft.id)}`);
		} catch (error) {
			handleError(error, "Benchmark duplication failed", true);
		} finally {
			setPending(false);
		}
	};

	/** Removes only this mount; published versions and results remain intact. */
	const unmount = async () => {
		if (!mount || pending) return;
		setPending(true);
		try {
			await unmountBenchmark(mount.workspaceId, mount.id);
			await client.invalidateQueries({
				queryKey: ["benchmarks", "mounts", mount.workspaceId],
			});
			Toast.toast.success(t("benchmark.unmounted"));
			navigate(`/workspaces/${encodeURIComponent(mount.workspaceId)}`);
		} catch (error) {
			handleError(error, "Benchmark unmount failed", true);
		} finally {
			setPending(false);
		}
	};
	const detail = query.data;
	const archive = async () => {
		if (!detail || archiveMutation.isPending) return;
		try {
			await archiveMutation.mutateAsync(detail.summary.id);
			Toast.toast.success(t("benchmark.archived"));
		} catch (error) {
			handleError(error, "Benchmark archive failed", true);
		}
	};
	const updateMount = async () => {
		if (!detail || !mount || updateMountMutation.isPending) return;
		try {
			await updateMountMutation.mutateAsync({
				workspaceId: mount.workspaceId,
				mountId: mount.id,
				versionId: detail.summary.versionId,
			});
			Toast.toast.success(t("benchmark.mountUpdated"));
		} catch (error) {
			handleError(error, "Benchmark mount update failed", true);
		}
	};
	return (
		<main className="flex h-full min-h-0 flex-col">
			<PageHeader>
				<Link to="/benchmark" className="text-body-sm">
					{t("benchmark.back")}
				</Link>
			</PageHeader>
			<div className="mx-auto w-full max-w-300 overflow-auto p-4 sm:p-xl lg:p-10">
				<BenchmarkFeedback
					loading={query.isLoading}
					failed={query.isError}
					retry={() => query.refetch()}
				/>
				{detail && (
					<>
						<div className="flex flex-wrap justify-between gap-lg">
							<div className="min-w-0">
								<h1 className="break-words text-heading-lg font-semibold">
									{detail.document.name}
								</h1>
								<p className="mt-sm text-body-sm text-body">
									{t("benchmark.version", { number: detail.versionNumber })} ·{" "}
									{t(`benchmark.authors.${detail.summary.author}`)}
								</p>
							</div>
							<div className="flex flex-wrap gap-sm">
								{!mount && (
									<>
										<Button
											variant="secondary"
											isDisabled={detail.summary.archived}
											isPending={pending}
											onPress={() =>
												createDraft(
													detail.summary.author === "myself"
														? detail.summary.id
														: null,
												)
											}
										>
											{t(
												detail.summary.author === "myself"
													? "benchmark.edit"
													: "benchmark.duplicate",
											)}
										</Button>
										{detail.summary.author === "myself" &&
										!detail.summary.archived ? (
											<AlertDialog
												confirmText={t("benchmark.archiveConfirm")}
												description={t("benchmark.archiveDescription")}
												isConfirmDisabled={archiveMutation.isPending}
												onConfirm={archive}
												title={t("benchmark.archiveTitle")}
												trigger={
													<Button variant="tertiary">
														{t("benchmark.archive")}
													</Button>
												}
											/>
										) : null}
									</>
								)}
								{mount ? (
									<>
										{mount.versionId !== detail.summary.versionId ? (
											<AlertDialog
												confirmText={t("benchmark.updateMountConfirm")}
												description={t("benchmark.updateMountDescription", {
													current: detail.versionNumber,
													latest: detail.summary.versionNumber,
												})}
												isConfirmDisabled={updateMountMutation.isPending}
												onConfirm={updateMount}
												status="warning"
												title={t("benchmark.updateMountTitle")}
												trigger={
													<Button variant="secondary">
														{t("benchmark.updateMount", {
															number: detail.summary.versionNumber,
														})}
													</Button>
												}
											/>
										) : null}
										<BenchmarkConfiguration mount={mount} />
										<AlertDialog
											title={t("benchmark.unmountConfirm")}
											confirmText={t("benchmark.unmount")}
											onConfirm={unmount}
											isConfirmDisabled={pending}
											trigger={
												<Button variant="tertiary" isDisabled={pending}>
													{t("benchmark.unmount")}
												</Button>
											}
										/>
									</>
								) : (
									<Button
										isDisabled={detail.summary.archived}
										onPress={() => setMountOpen(true)}
									>
										{t("benchmark.mount")}
									</Button>
								)}
							</div>
						</div>
						<p className="my-xl whitespace-pre-wrap break-words text-body-sm text-charcoal">
							{detail.document.description}
						</p>
						<h2 className="mb-lg text-heading-sm font-semibold">
							{t("benchmark.caseCount", {
								count: detail.document.cases.length,
							})}
						</h2>
						<div className="space-y-md">
							{detail.document.cases.map((item, index) => (
								<details
									key={index}
									className="rounded-xl border border-hairline p-lg"
									open={index === 0}
								>
									<summary className="cursor-pointer break-words font-medium">
										{index + 1}. {item.name}
									</summary>
									<div className="mt-lg grid gap-xl text-body-sm xl:grid-cols-2">
										<div>
											<h3 className="font-medium">
												{t("benchmark.requirements")}
											</h3>
											<p className="mt-sm whitespace-pre-wrap break-words text-charcoal">
												{item.prompt}
											</p>
										</div>
										<div>
											<h3 className="font-medium">{t("benchmark.checks")}</h3>
											<ul className="mt-sm space-y-sm">
												{item.checks.map((check, position) => (
													<li
														key={position}
														className="whitespace-pre-wrap break-words rounded-md bg-surface-soft p-md"
													>
														<span className="font-medium">
															{t(`benchmark.checkKinds.${check.kind}`)}
														</span>
														{"path" in check && (
															<p className="font-mono">{check.path}</p>
														)}
														{"expected" in check && <p>{check.expected}</p>}
														{check.kind === "python" && (
															<p className="font-mono">{check.script.path}</p>
														)}
													</li>
												))}
											</ul>
											<h3 className="mt-lg font-medium">
												{t("benchmark.files")}
											</h3>
											{item.inputFiles.length ? (
												<ul className="mt-sm font-mono">
													{item.inputFiles.map((file) => (
														<li key={file.path} className="break-all">
															{file.path}
														</li>
													))}
												</ul>
											) : (
												<p className="mt-sm text-body">
													{t("benchmark.noFiles")}
												</p>
											)}
										</div>
									</div>
								</details>
							))}
						</div>
						{mountOpen && (
							<BenchmarkMountModal
								benchmark={{
									...detail.summary,
									versionId: detail.versionId,
									versionNumber: detail.versionNumber,
								}}
								onClose={() => setMountOpen(false)}
							/>
						)}
					</>
				)}
			</div>
		</main>
	);
};

export { BenchmarkDetailView };
