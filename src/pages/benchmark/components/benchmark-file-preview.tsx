import { useState } from "react";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
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

/** Loads bounded content only when the user asks to inspect one managed Benchmark file. */
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
							<pre className="max-h-120 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-soft p-md text-body-sm">
								{preview.text}
							</pre>
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
