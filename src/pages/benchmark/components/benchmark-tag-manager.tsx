import { useState } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { ModalProvider } from "@/components/ui/modal-provider";
import { handleError } from "@/utils/error";
import { createBenchmarkTag, getBenchmarkTagUsage } from "@/api/benchmark";
import {
	useBenchmarkTags,
	useDeleteBenchmarkTag,
	useUpdateBenchmarkTag,
} from "@/queries/benchmark";
import type { BenchmarkTag } from "@/types/benchmark";
import { BENCHMARK_ICONS, TagIcon } from "./tag-icon";

type TagEditor = Pick<BenchmarkTag, "name" | "icon"> & {
	/** Existing Tag identity, or null while creating a new Tag. */
	id: string | null;
};

/** Supplies the allowlisted default icon for a new Tag editor. */
const emptyEditor = (): TagEditor => ({ id: null, name: "", icon: "Tag" });

/** Provides catalog-level Tag creation, editing, and safe fallback deletion. */
const BenchmarkTagManager = () => {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const tagsQuery = useBenchmarkTags();
	const updateMutation = useUpdateBenchmarkTag();
	const deleteMutation = useDeleteBenchmarkTag();
	const [editor, setEditor] = useState<TagEditor | null>(null);
	const [creating, setCreating] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<BenchmarkTag | null>(null);
	const [usage, setUsage] = useState<number | null>(null);
	const [loadingUsage, setLoadingUsage] = useState(false);
	const saving = creating || updateMutation.isPending;

	/** Uses one editor state for create and update while preserving stable Tag ids. */
	const save = async () => {
		if (!editor || saving || !editor.name.trim()) return;
		try {
			if (editor.id) {
				await updateMutation.mutateAsync({
					id: editor.id,
					name: editor.name,
					icon: editor.icon,
				});
			} else {
				setCreating(true);
				await createBenchmarkTag(editor.name, editor.icon);
				await queryClient.invalidateQueries({ queryKey: ["benchmarks"] });
			}
			setEditor(null);
			Toast.toast.success(t("benchmark.tagSaved"));
		} catch (error) {
			handleError(error, "Benchmark tag save failed", true);
		} finally {
			setCreating(false);
		}
	};

	/** Loads the reassignment count before exposing the destructive confirmation.
	 * @example inspectDeletion(tag)
	 */
	const inspectDeletion = async (tag: BenchmarkTag) => {
		if (loadingUsage) return;
		setLoadingUsage(true);
		try {
			const result = await getBenchmarkTagUsage(tag.id);
			setUsage(result.benchmarkCount);
			setDeleteTarget(tag);
		} catch (error) {
			handleError(error, "Benchmark tag usage failed", true);
		} finally {
			setLoadingUsage(false);
		}
	};

	/** Deletes only the Tag currently covered by the visible usage confirmation. */
	const deleteTag = async () => {
		if (!deleteTarget || deleteMutation.isPending) return;
		try {
			await deleteMutation.mutateAsync(deleteTarget.id);
			Toast.toast.success(t("benchmark.tagDeleted"));
			setDeleteTarget(null);
			setUsage(null);
		} catch (error) {
			handleError(error, "Benchmark tag deletion failed", true);
		}
	};

	return (
		<>
			<ModalProvider
				size="lg"
				title={t("benchmark.manageTags")}
				trigger={
					<Button variant="secondary">{t("benchmark.manageTags")}</Button>
				}
			>
				<div className="flex justify-end">
					<Button size="sm" onPress={() => setEditor(emptyEditor())}>
						{t("benchmark.newTag")}
					</Button>
				</div>
				{editor ? (
					<section className="space-y-md rounded-lg border border-hairline p-md">
						<label className="flex flex-col gap-xs text-body-sm font-medium">
							{t("benchmark.tagName")}
							<input
								className="rounded-md border border-hairline bg-canvas px-md py-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
								maxLength={40}
								onChange={(event) =>
									setEditor({ ...editor, name: event.currentTarget.value })
								}
								required
								value={editor.name}
							/>
						</label>
						<div
							aria-label={t("benchmark.icon")}
							className="grid max-h-32 grid-cols-8 gap-xs overflow-y-auto"
						>
							{Object.keys(BENCHMARK_ICONS).map((name) => (
								<Button
									aria-label={name}
									aria-pressed={editor.icon === name}
									isIconOnly
									key={name}
									onPress={() => setEditor({ ...editor, icon: name })}
									size="sm"
									variant={editor.icon === name ? "primary" : "tertiary"}
								>
									<TagIcon name={name} />
								</Button>
							))}
						</div>
						<div className="flex justify-end gap-sm">
							<Button variant="tertiary" onPress={() => setEditor(null)}>
								{t("common.cancel")}
							</Button>
							<Button
								isDisabled={!editor.name.trim()}
								isPending={saving}
								onPress={save}
							>
								{editor.id
									? t("benchmark.saveTagChanges")
									: t("benchmark.createTag")}
							</Button>
						</div>
					</section>
				) : null}
				<div className="divide-y divide-hairline rounded-lg border border-hairline">
					{(tagsQuery.data ?? []).map((tag) => (
						<div className="flex items-center gap-md p-md" key={tag.id}>
							<TagIcon name={tag.icon} />
							<span className="min-w-0 flex-1 truncate text-body-sm">
								{tag.id === "uncategorized"
									? t("benchmark.uncategorized")
									: tag.name}
							</span>
							{tag.isSystem ? (
								<span className="text-caption-sm text-mute">
									{t("benchmark.systemTag")}
								</span>
							) : (
								<>
									<Button
										aria-label={t("benchmark.editTag", { name: tag.name })}
										onPress={() => setEditor(tag)}
										size="sm"
										variant="tertiary"
									>
										{t("benchmark.edit")}
									</Button>
									<Button
										aria-label={t("benchmark.deleteTagNamed", {
											name: tag.name,
										})}
										isPending={loadingUsage}
										onPress={() => inspectDeletion(tag)}
										size="sm"
										variant="tertiary"
									>
										{t("benchmark.deleteTag")}
									</Button>
								</>
							)}
						</div>
					))}
				</div>
			</ModalProvider>
			<AlertDialog
				confirmText={t("benchmark.deleteTag")}
				description={t("benchmark.deleteTagDescription", {
					count: usage ?? 0,
				})}
				isConfirmDisabled={deleteMutation.isPending}
				isOpen={deleteTarget !== null}
				onConfirm={deleteTag}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				title={t("benchmark.deleteTagTitle")}
			/>
		</>
	);
};

export { BenchmarkTagManager };
