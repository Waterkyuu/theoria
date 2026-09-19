import { useState } from "react";
import { Button } from "@heroui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { CodeEditor } from "@/components/share/code-editor";
import { CodePreview } from "@/components/share/code-preview";
import { FileTypeIcon } from "@/components/share/file-type-icon";
import { ModalProvider } from "@/components/ui/modal-provider";
import { handleError } from "@/utils/error";
import {
	openBenchmarkAsset,
	previewBenchmarkAsset,
	saveBenchmarkTextAsset,
} from "@/api/benchmark";
import type { BenchmarkAssetPreview, BenchmarkFile } from "@/types/benchmark";

const EXTERNAL_PREVIEW_EXTENSIONS = new Set([
	"doc",
	"docx",
	"key",
	"numbers",
	"odp",
	"ods",
	"odt",
	"pages",
	"pdf",
	"ppt",
	"pptx",
	"rtf",
	"xls",
	"xlsx",
]);

/** Keeps document formats out of the bounded text and binary preview path.
 * @example requiresExternalApplication("report.pdf")
 */
const requiresExternalApplication = (path: string) => {
	const extension = path.split(".").pop()?.toLowerCase();
	return extension ? EXTERNAL_PREVIEW_EXTENSIONS.has(extension) : false;
};

type BenchmarkFilePreviewProps = {
	/** Whether the managed text can be saved as a new immutable asset. */
	editable?: boolean;
	/** Opaque managed file reference selected by the user. */
	file: BenchmarkFile;
	/** Replaces the draft reference after a successful text edit. */
	onChange?: (file: BenchmarkFile) => void;
};

/** Loads bounded content only when the user asks to inspect one managed Benchmark file.
 * @example <BenchmarkFilePreview file={file} />
 */
const BenchmarkFilePreview = ({
	editable = false,
	file,
	onChange,
}: BenchmarkFilePreviewProps) => {
	"use no memo";
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [preview, setPreview] = useState<BenchmarkAssetPreview | null>(null);
	const [text, setText] = useState("");

	/** Defers managed-file reads until the user explicitly opens the preview. */
	const openPreview = async () => {
		if (pending) return;
		setPending(true);
		try {
			if (requiresExternalApplication(file.path)) {
				const applicationPath = await open({
					directory: false,
					multiple: false,
					title: t("benchmark.file.chooseApplication"),
				});
				if (applicationPath)
					await openBenchmarkAsset(file.assetId, applicationPath);
				return;
			}
			setIsOpen(true);
			const next = await previewBenchmarkAsset(file.assetId);
			setPreview(next);
			setText(next.text ?? "");
		} catch (error) {
			handleError(error, "Benchmark asset preview failed", true);
		} finally {
			setPending(false);
		}
	};

	/** Replaces the draft reference instead of mutating an immutable managed asset. */
	const save = async () => {
		if (!preview || preview.text === null || pending) return;
		setPending(true);
		try {
			const saved = await saveBenchmarkTextAsset(file.path, text);
			onChange?.(saved);
			setPreview({
				assetId: saved.assetId,
				sizeBytes: new TextEncoder().encode(text).byteLength,
				text,
				truncated: false,
			});
			setIsOpen(false);
		} catch (error) {
			handleError(error, "Benchmark asset text save failed", true);
		} finally {
			setPending(false);
		}
	};

	return (
		<>
			<Button
				isPending={pending}
				onPress={openPreview}
				size="sm"
				variant="tertiary"
			>
				{t("benchmark.file.preview")}
			</Button>
			<ModalProvider
				isOpen={isOpen}
				onOpenChange={(open) => {
					if (!pending) setIsOpen(open);
				}}
				size="lg"
				title={
					<span className="inline-flex max-w-full items-center gap-sm">
						<FileTypeIcon path={file.path} />
						<span className="min-w-0 truncate">{file.path}</span>
					</span>
				}
				footer={
					editable && preview?.text !== null ? (
						<Button isPending={pending} onPress={save}>
							{t("benchmark.file.save")}
						</Button>
					) : undefined
				}
			>
				{preview ? (
					<>
						<p className="text-caption-sm text-mute">
							{t("benchmark.file.size", { count: preview.sizeBytes })}
							{preview.truncated ? ` · ${t("benchmark.file.truncated")}` : ""}
						</p>
						{preview.text === null ? (
							<p className="text-body-sm">{t("benchmark.file.binary")}</p>
						) : editable ? (
							<div className="flex flex-col gap-sm text-body-sm">
								<p>{t("benchmark.file.contents")}</p>
								<div className="h-80 overflow-hidden rounded-md border border-hairline">
									<CodeEditor
										onChange={setText}
										path={file.path}
										value={text}
									/>
								</div>
							</div>
						) : (
							<CodePreview path={file.path} value={preview.text} />
						)}
					</>
				) : (
					<p className="text-body-sm text-mute">{t("common.loading")}</p>
				)}
			</ModalProvider>
		</>
	);
};

export { BenchmarkFilePreview };
