import { useState } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ModalProvider } from "@/components/ui/modal-provider";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { saveBenchmarkDraft, publishBenchmark } from "@/api/benchmark";
import type { BenchmarkDraft, BenchmarkTag } from "@/types/benchmark";

type PublicBenchmarkModalProps = {
	/** Existing personal classifications; adding a public source does not create tags. */
	tags: BenchmarkTag[];
	/** Closes the catalog-controlled setup flow. */
	onClose: () => void;
};

/** Stores task references and a fixed upstream release without rewriting upstream instructions or tests.
 * @example <PublicBenchmarkModal tags={tags} onClose={close} />
 */
const PublicBenchmarkModal = ({ tags, onClose }: PublicBenchmarkModalProps) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const client = useQueryClient();
	const [dataset, setDataset] = useState<
		"terminal-bench" | "swebench-verified"
	>("terminal-bench");
	const [tagId, setTagId] = useState<string | null>(tags[0]?.id ?? null);
	const [taskNames, setTaskNames] = useState("");
	const [pending, setPending] = useState(false);
	const [draft, setDraft] = useState<BenchmarkDraft | null>(null);
	const names = taskNames
		.trim()
		.split(/[\s,]+/)
		.filter(Boolean);
	const version = dataset === "terminal-bench" ? "2.0" : "1.0";
	const valid =
		tagId &&
		names.length > 0 &&
		names.length <= 100 &&
		new Set(names).size === names.length &&
		names.every((name) => /^[a-zA-Z0-9_.-]{1,120}$/.test(name));

	/** Retains a saved draft after publication failure so retry updates the same definition. */
	const add = async () => {
		if (!valid || pending) return;
		setPending(true);
		try {
			const saved = await saveBenchmarkDraft(
				{
					schemaVersion: 1,
					name: `${dataset}@${version}`,
					description:
						"Pinned upstream tasks evaluated with their original environment and verifier.",
					tagId,
					source: "Harbor 0.26.0",
					runner: { kind: "harbor", dataset, version },
					cases: names.map((name) => ({
						name,
						prompt: name,
						timeoutMinutes: 30,
						inputFiles: [],
						checks: [],
					})),
				},
				draft?.id ?? null,
				draft?.revision ?? null,
			);
			setDraft(saved);
			const published = await publishBenchmark(saved.id, saved.revision);
			await client.invalidateQueries({ queryKey: ["benchmarks"] });
			Toast.toast.success(t("benchmark.public.added"));
			onClose();
			navigate(`/benchmark/${encodeURIComponent(published.summary.id)}`);
		} catch (error) {
			handleError(error, "Public benchmark creation failed", true);
		} finally {
			setPending(false);
		}
	};

	return (
		<ModalProvider
			isOpen
			title={t("benchmark.public.action")}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
			footer={
				<Button isDisabled={!valid} isPending={pending} onPress={add}>
					{t("benchmark.public.action")}
				</Button>
			}
		>
			<p className="text-body-sm text-charcoal">
				{t("benchmark.public.requirements")}
			</p>
			<Select
				label={t("benchmark.public.dataset")}
				placeholder={t("benchmark.public.dataset")}
				value={dataset}
				isDisabled={pending}
				onChange={(value) => {
					if (value) setDataset(value);
				}}
				options={[
					{ value: "terminal-bench", label: "Terminal-Bench 2.0" },
					{ value: "swebench-verified", label: "SWE-bench Verified 1.0" },
				]}
			/>
			<Select
				label={t("benchmark.tag")}
				placeholder={t("benchmark.chooseTag")}
				value={tagId}
				onChange={setTagId}
				isDisabled={pending}
				options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
			/>
			<label className="flex flex-col gap-xs text-body-sm text-charcoal">
				{t("benchmark.public.taskNames")}
				<textarea
					className="min-h-28 rounded-md border border-hairline bg-canvas px-md py-sm font-mono text-caption-sm"
					value={taskNames}
					disabled={pending}
					maxLength={13000}
					onChange={(event) => setTaskNames(event.target.value)}
				/>
			</label>
			<p className="text-caption-sm text-mute">
				{t("benchmark.public.taskHint")}
			</p>
		</ModalProvider>
	);
};

export { PublicBenchmarkModal };
