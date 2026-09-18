import { useState } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ModalProvider } from "@/components/ui/modal-provider";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { importBenchmarkFolder, previewBenchmarkImport } from "@/api/benchmark";
import type { BenchmarkImportPreview, BenchmarkTag } from "@/types/benchmark";

type BenchmarkImportModalProps = {
	/** Whether the catalog import flow is visible. */
	isOpen: boolean;
	/** Closes the flow without importing the selected folder. */
	onClose: () => void;
	/** Local classifications available for the imported personal draft. */
	tags: BenchmarkTag[];
};

const BLOCKING_ISSUES = new Set(["too_many_files", "import_too_large"]);

/** Previews a portable template before copying it into managed storage.
 * @example <BenchmarkImportModal isOpen onClose={close} tags={tags} />
 */
const BenchmarkImportModal = ({
	isOpen,
	onClose,
	tags,
}: BenchmarkImportModalProps) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [sourcePath, setSourcePath] = useState<string | null>(null);
	const [preview, setPreview] = useState<BenchmarkImportPreview | null>(null);
	const [tagId, setTagId] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	const folderName = sourcePath?.split(/[\\/]/).filter(Boolean).pop();
	const hasBlockingIssue = preview?.issues.some((issue) =>
		BLOCKING_ISSUES.has(issue.code),
	);

	/** Clears picker state so reopening cannot accidentally import an earlier folder. */
	const close = () => {
		setSourcePath(null);
		setPreview(null);
		setTagId(null);
		setFailed(false);
		onClose();
	};

	/** Reads only the folder explicitly selected through the native picker. */
	const chooseFolder = async () => {
		if (pending) return;
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: t("benchmark.import.chooseFolderTitle"),
			});
			if (!selected) return;
			setPending(true);
			setFailed(false);
			setSourcePath(selected);
			setPreview(await previewBenchmarkImport(selected));
		} catch (error) {
			setPreview(null);
			setFailed(true);
			handleError(error, "Benchmark folder preview failed", true);
		} finally {
			setPending(false);
		}
	};

	/** Imports only a reviewed preview with a selected personal Tag. */
	const importDraft = async () => {
		if (!sourcePath || !tagId || !preview || pending || hasBlockingIssue)
			return;
		setPending(true);
		try {
			const draft = await importBenchmarkFolder(sourcePath, tagId);
			queryClient.setQueryData(["benchmarks", "draft", draft.id], draft);
			await queryClient.invalidateQueries({
				queryKey: ["benchmarks", "drafts"],
			});
			Toast.toast.success(t("benchmark.import.imported"));
			close();
			navigate(`/benchmark/drafts/${encodeURIComponent(draft.id)}`);
		} catch (error) {
			handleError(error, "Benchmark folder import failed", true);
		} finally {
			setPending(false);
		}
	};

	return (
		<ModalProvider
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open && !pending) close();
			}}
			size="lg"
			title={t("benchmark.import.title")}
			footer={
				<Button
					isDisabled={!preview || !tagId || Boolean(hasBlockingIssue)}
					isPending={pending}
					onPress={importDraft}
				>
					{t("benchmark.import.confirm")}
				</Button>
			}
		>
			<div className="flex items-center justify-between gap-md rounded-lg border border-hairline p-md">
				<div className="min-w-0">
					<p className="text-body-sm font-medium">
						{folderName ?? t("benchmark.import.noFolder")}
					</p>
					<p className="text-caption-sm text-mute">
						{t("benchmark.import.folderHelp")}
					</p>
				</div>
				<Button isPending={pending} onPress={chooseFolder} variant="secondary">
					{t("benchmark.import.chooseFolder")}
				</Button>
			</div>
			{failed ? (
				<p role="alert" className="text-body-sm text-terminal-red">
					{t("benchmark.import.previewFailed")}
				</p>
			) : null}
			{preview ? (
				<>
					<section className="rounded-lg border border-hairline p-md">
						<h3 className="font-semibold text-ink">{preview.name}</h3>
						<p className="mt-xs text-body-sm text-charcoal">
							{preview.description}
						</p>
						<p className="mt-sm text-caption-sm text-mute">
							{t("benchmark.import.summary", {
								cases: preview.cases.length,
								files: preview.fileCount,
							})}
						</p>
					</section>
					<div className="divide-y divide-hairline rounded-lg border border-hairline">
						{preview.cases.map((item, index) => (
							<div className="p-md" key={`${item.name}-${index}`}>
								<p className="text-body-sm font-medium text-ink">
									{item.name || t("benchmark.draftUntitled")}
								</p>
								<p className="mt-xs text-caption-sm text-mute">
									{item.checkKinds
										.map((kind) => t(`benchmark.checkKinds.${kind}`))
										.join(" · ")}
								</p>
							</div>
						))}
					</div>
					{preview.issues.length ? (
						<div
							role="alert"
							className="rounded-lg border border-terminal-red p-md"
						>
							<p className="text-body-sm font-medium">
								{t("benchmark.import.issues")}
							</p>
							<ul className="mt-xs list-inside list-disc text-caption-sm text-charcoal">
								{preview.issues.map((issue, index) => (
									<li key={`${issue.field}-${issue.code}-${index}`}>
										<code>{issue.field}</code>:{" "}
										{t(`benchmark.validation.${issue.code}`)}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<Select
						label={t("benchmark.tag")}
						onChange={setTagId}
						options={tags.map((tag) => ({ label: tag.name, value: tag.id }))}
						placeholder={t("benchmark.chooseTag")}
						value={tagId}
					/>
				</>
			) : null}
		</ModalProvider>
	);
};

export { BenchmarkImportModal };
