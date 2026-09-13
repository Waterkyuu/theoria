import { useState } from "react";
import { Button, Label, NumberField } from "@heroui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { importBenchmarkAsset } from "@/api/benchmark";
import type {
	BenchmarkCheck,
	BenchmarkDocument,
	BenchmarkFile,
} from "@/types/benchmark";
import { BenchmarkFilePreview } from "../../components/benchmark-file-preview";

const FIELD =
	"w-full rounded-md border border-hairline bg-canvas px-md py-sm text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

type BenchmarkCase = BenchmarkDocument["cases"][number];
type CheckKind = BenchmarkCheck["kind"];
type BenchmarkCaseEditorProps = {
	/** Case value rendered by the parent document editor. */
	item: BenchmarkCase;
	/** One-based display position and zero-based field path source. */
	index: number;
	/** Replaces this Case inside the parent document. */
	onChange: (item: BenchmarkCase) => void;
	/** Removes this Case after confirmation. */
	onRemove: () => void;
};

const newCheck = (kind: CheckKind): BenchmarkCheck => {
	switch (kind) {
		case "answer":
			return { kind, expected: "" };
		case "file_exists":
			return { kind, path: "" };
		case "file_text":
		case "file_json":
			return { kind, path: "", expected: "" };
		case "python":
			return { kind, script: { path: "", assetId: "" } };
	}
};

/** Edits one Case, including public files and every supported V1 check kind. */
const BenchmarkCaseEditor = ({
	item,
	index,
	onChange,
	onRemove,
}: BenchmarkCaseEditorProps) => {
	const { t } = useTranslation();
	const [checkKind, setCheckKind] = useState<CheckKind | null>(null);
	const [uploading, setUploading] = useState(false);
	const updateCheck = (position: number, check: BenchmarkCheck) =>
		onChange({
			...item,
			checks: item.checks.map((value, current) =>
				current === position ? check : value,
			),
		});

	const selectFile = async (path?: string): Promise<BenchmarkFile | null> => {
		if (uploading) return null;
		setUploading(true);
		try {
			const selected = await open({
				directory: false,
				multiple: false,
				title: t("benchmark.file.chooseTitle"),
			});
			if (!selected) return null;
			const filename = selected.split(/[\\/]/).filter(Boolean).pop();
			if (!path && !filename) return null;
			return await importBenchmarkAsset(selected, path ?? filename ?? "");
		} catch (error) {
			handleError(error, "Benchmark asset import failed", true);
			return null;
		} finally {
			setUploading(false);
		}
	};

	const addInputFile = async () => {
		const file = await selectFile();
		if (!file) return;
		onChange({
			...item,
			inputFiles: [
				...item.inputFiles.filter(
					(current) => current.path.toLowerCase() !== file.path.toLowerCase(),
				),
				file,
			],
		});
	};

	return (
		<section className="rounded-xl border border-hairline p-lg">
			<div className="flex items-center justify-between gap-md">
				<span className="text-body-sm font-semibold">
					{t("benchmark.cases")} {index + 1}
				</span>
				<AlertDialog
					confirmText={t("benchmark.removeCase")}
					onConfirm={onRemove}
					title={t("benchmark.removeCaseConfirm")}
					trigger={
						<Button
							className="border border-terminal-red bg-canvas text-terminal-red shadow-none"
							size="sm"
							variant="secondary"
						>
							{t("benchmark.removeCase")}
						</Button>
					}
				/>
			</div>
			<div className="mt-xl flex flex-col gap-xl">
				<label className="flex flex-col gap-sm text-body-sm">
					{t("benchmark.caseName")}
					<input
						className={FIELD}
						maxLength={120}
						onChange={(event) =>
							onChange({ ...item, name: event.currentTarget.value })
						}
						required
						value={item.name}
					/>
				</label>
				<label className="flex flex-col gap-sm text-body-sm">
					{t("benchmark.prompt")}
					<textarea
						className={FIELD}
						maxLength={16000}
						onChange={(event) =>
							onChange({ ...item, prompt: event.currentTarget.value })
						}
						required
						rows={4}
						value={item.prompt}
					/>
				</label>
				<NumberField
					className="max-w-60"
					fullWidth
					isRequired
					maxValue={60}
					minValue={1}
					onChange={(value) =>
						onChange({
							...item,
							timeoutMinutes: Number.isNaN(value) ? 1 : value,
						})
					}
					value={item.timeoutMinutes}
				>
					<Label>{t("benchmark.timeout")}</Label>
					<NumberField.Group>
						<NumberField.DecrementButton />
						<NumberField.Input
							className="bg-canvas"
							name={`cases.${index}.timeoutMinutes`}
						/>
						<NumberField.IncrementButton />
					</NumberField.Group>
				</NumberField>

				<div>
					<div className="flex items-center justify-between gap-md">
						<h3 className="text-body-sm font-semibold">
							{t("benchmark.files")}
						</h3>
						<Button
							isPending={uploading}
							onPress={addInputFile}
							size="sm"
							variant="secondary"
						>
							{t("benchmark.file.add")}
						</Button>
					</div>
					<div className="mt-sm space-y-xs">
						{item.inputFiles.map((file, position) => (
							<div
								className="flex items-center gap-sm rounded-md bg-surface-soft px-md py-sm"
								key={`${file.path}-${position}`}
							>
								<span className="min-w-0 flex-1 truncate font-mono text-body-sm">
									{file.path}
								</span>
								{file.assetId ? (
									<BenchmarkFilePreview
										editable
										file={file}
										onChange={(next) =>
											onChange({
												...item,
												inputFiles: item.inputFiles.map((value, current) =>
													current === position ? next : value,
												),
											})
										}
									/>
								) : null}
								<Button
									onPress={async () => {
										const next = await selectFile(file.path);
										if (next)
											onChange({
												...item,
												inputFiles: item.inputFiles.map((value, current) =>
													current === position ? next : value,
												),
											});
									}}
									size="sm"
									variant="tertiary"
								>
									{t("benchmark.file.replace")}
								</Button>
								<Button
									onPress={() =>
										onChange({
											...item,
											inputFiles: item.inputFiles.filter(
												(_, current) => current !== position,
											),
										})
									}
									size="sm"
									variant="tertiary"
								>
									{t("common.delete")}
								</Button>
							</div>
						))}
					</div>
				</div>

				<div>
					<h3 className="text-body-sm font-semibold">
						{t("benchmark.checks")}
					</h3>
					<div className="mt-sm space-y-sm">
						{item.checks.map((check, position) => (
							<div
								className="space-y-sm rounded-md bg-surface-soft p-md"
								key={`${check.kind}-${position}`}
							>
								<div className="flex items-center justify-between gap-md">
									<span className="text-body-sm font-medium">
										{t(`benchmark.checkKinds.${check.kind}`)}
									</span>
									<Button
										onPress={() =>
											onChange({
												...item,
												checks: item.checks.filter(
													(_, current) => current !== position,
												),
											})
										}
										size="sm"
										variant="tertiary"
									>
										{t("common.delete")}
									</Button>
								</div>
								{"path" in check ? (
									<label className="flex flex-col gap-xs text-caption-sm">
										{t("benchmark.file.outputPath")}
										<input
											className={FIELD}
											onChange={(event) =>
												updateCheck(position, {
													...check,
													path: event.currentTarget.value,
												})
											}
											value={check.path}
										/>
									</label>
								) : null}
								{"expected" in check ? (
									<label className="flex flex-col gap-xs text-caption-sm">
										{check.kind === "answer"
											? t("benchmark.expected")
											: t("benchmark.file.expectedContent")}
										<textarea
											className={FIELD}
											maxLength={65536}
											onChange={(event) =>
												updateCheck(position, {
													...check,
													expected: event.currentTarget.value,
												})
											}
											rows={check.kind === "file_json" ? 5 : 2}
											value={check.expected}
										/>
									</label>
								) : null}
								{check.kind === "python" ? (
									<div className="flex items-center gap-sm">
										<span className="min-w-0 flex-1 truncate font-mono text-body-sm">
											{check.script.path || t("benchmark.file.noValidator")}
										</span>
										{check.script.assetId ? (
											<BenchmarkFilePreview
												editable
												file={check.script}
												onChange={(script) =>
													updateCheck(position, { kind: "python", script })
												}
											/>
										) : null}
										<Button
											onPress={async () => {
												const script = await selectFile(
													check.script.path || undefined,
												);
												if (script)
													updateCheck(position, { kind: "python", script });
											}}
											size="sm"
											variant="tertiary"
										>
											{check.script.assetId
												? t("benchmark.file.replace")
												: t("benchmark.file.uploadValidator")}
										</Button>
									</div>
								) : null}
							</div>
						))}
					</div>
					<div className="mt-sm flex items-end gap-sm">
						<Select
							className="max-w-80"
							label={t("benchmark.file.checkKind")}
							onChange={setCheckKind}
							options={(
								[
									"answer",
									"file_exists",
									"file_text",
									"file_json",
									"python",
								] as const
							).map((kind) => ({
								label: t(`benchmark.checkKinds.${kind}`),
								value: kind,
							}))}
							placeholder={t("benchmark.file.chooseCheck")}
							value={checkKind}
						/>
						<Button
							isDisabled={!checkKind || item.checks.length >= 32}
							onPress={() => {
								if (!checkKind) return;
								onChange({
									...item,
									checks: [...item.checks, newCheck(checkKind)],
								});
								setCheckKind(null);
							}}
							variant="secondary"
						>
							{t("benchmark.file.addCheck")}
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
};

export { BenchmarkCaseEditor };
