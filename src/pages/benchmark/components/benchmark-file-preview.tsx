import { useState } from "react";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { CodePreview } from "@/components/share/code-preview";
import { ModalProvider } from "@/components/ui/modal-provider";
import { handleError } from "@/utils/error";
import { previewBenchmarkAsset, saveBenchmarkTextAsset } from "@/api/benchmark";
import type { BenchmarkAssetPreview, BenchmarkFile } from "@/types/benchmark";

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
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [preview, setPreview] = useState<BenchmarkAssetPreview | null>(null);
	const [text, setText] = useState("");

	/** Defers managed-file reads until the user explicitly opens the preview. */
	const openPreview = async () => {
		if (pending) return;
		setIsOpen(true);
		setPending(true);
		try {
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
				title={file.path}
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
							<label className="flex flex-col gap-sm text-body-sm">
								{t("benchmark.file.contents")}
								<textarea
									className="min-h-80 rounded-md border border-hairline bg-canvas p-md font-mono text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
									onChange={(event) => setText(event.currentTarget.value)}
									value={text}
								/>
							</label>
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
