import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Popover } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import {
	createBenchmarkTag,
	saveBenchmarkDraft,
	publishBenchmark,
} from "@/api/benchmark";
import { useBenchmarkDraft, useBenchmarkTags } from "@/queries/benchmark";
import type { BenchmarkDocument, BenchmarkDraft } from "@/types/benchmark";
import { BenchmarkFeedback } from "./components/feedback";
import { BENCHMARK_ICONS, TagIcon } from "./components/tag-icon";
const FIELD =
	"w-full rounded-md border border-hairline bg-canvas px-md py-sm text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
type EditorProps = {
	/** Latest saved document, absent for a blank draft. */
	initial?: BenchmarkDraft;
};
/**
 * Keeps the saved revision after a failed publish, so retries cannot overwrite another editor.
 *
 * @example
 * <BenchmarkEditor initial={draft} />
 */
const BenchmarkEditor = ({ initial }: EditorProps) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const client = useQueryClient();
	const tags = useBenchmarkTags();
	const [saved, setSaved] = useState(initial);
	const [document, setDocument] = useState<BenchmarkDocument>(
		initial?.document ?? {
			schemaVersion: 1,
			name: "",
			description: "",
			tagId: null,
			source: null,
			cases: [
				{
					name: "",
					prompt: "",
					timeoutMinutes: 10,
					inputFiles: [],
					checks: [{ kind: "answer", expected: "" }],
				},
			],
		},
	);
	const [pending, setPending] = useState(false);
	const [tagPending, setTagPending] = useState(false);
	const [icon, setIcon] = useState("Code");
	/**
	 * Saves before publication and retains recoverable editor content on failure.
	 *
	 * @example
	 * submit(event);
	 */
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending) return;
		const publish =
			(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
			"publish";
		setPending(true);
		try {
			const draft = await saveBenchmarkDraft(
				document,
				saved?.id ?? null,
				saved?.revision ?? null,
			);
			setSaved(draft);
			await client.invalidateQueries({ queryKey: ["benchmarks", "drafts"] });
			client.setQueryData(["benchmarks", "draft", draft.id], draft);
			if (publish) {
				const result = await publishBenchmark(draft.id, draft.revision);
				await client.invalidateQueries({ queryKey: ["benchmarks"] });
				Toast.toast.success(t("benchmark.published"));
				navigate(`/benchmark/${encodeURIComponent(result.summary.id)}`);
			} else {
				Toast.toast.success(t("benchmark.saved"));
				navigate(`/benchmark/drafts/${encodeURIComponent(draft.id)}`, {
					replace: true,
				});
			}
		} catch (error) {
			handleError(error, "Benchmark draft save or publication failed", true);
		} finally {
			setPending(false);
		}
	};
	/**
	 * Creates the selected icon/tag through the shared native catalog.
	 *
	 * @example
	 * addTag(event);
	 */
	const addTag = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (tagPending) return;
		const name = String(new FormData(event.currentTarget).get("tagName") ?? "");
		setTagPending(true);
		try {
			const tag = await createBenchmarkTag(name, icon);
			await client.invalidateQueries({ queryKey: ["benchmarks", "tags"] });
			setDocument((current) => ({ ...current, tagId: tag.id }));
			Toast.toast.success(t("benchmark.tagCreated"));
		} catch (error) {
			handleError(error, "Benchmark tag creation failed", true);
		} finally {
			setTagPending(false);
		}
	};
	return (
		<main className="flex h-full min-h-0 flex-col">
			<PageHeader>
				<Link className="text-body-sm" to="/benchmark">
					{t("benchmark.back")}
				</Link>
			</PageHeader>
			<div className="mx-auto w-full max-w-240 overflow-auto p-4 sm:p-xl lg:p-10">
				<h1 className="mb-xl text-heading-lg font-semibold">
					{saved
						? saved.document.name || t("benchmark.draftUntitled")
						: t("benchmark.newTitle")}
				</h1>
				<div className="mb-lg flex justify-end">
					<Popover
						title={t("benchmark.newTag")}
						trigger={
							<Button size="sm" variant="secondary">
								{t("benchmark.newTag")}
							</Button>
						}
					>
						<form
							onSubmit={addTag}
							className="flex max-w-72 flex-col gap-md pt-md"
						>
							<label className="text-body-sm">
								{t("benchmark.tagName")}
								<input
									name="tagName"
									required
									maxLength={40}
									className={FIELD}
								/>
							</label>
							<div
								className="grid grid-cols-4 gap-sm"
								aria-label={t("benchmark.icon")}
							>
								{Object.keys(BENCHMARK_ICONS).map((name) => (
									<Button
										key={name}
										isIconOnly
										aria-label={name}
										aria-pressed={icon === name}
										variant={icon === name ? "primary" : "tertiary"}
										onPress={() => setIcon(name)}
									>
										<TagIcon name={name} />
									</Button>
								))}
							</div>
							<Button type="submit" isPending={tagPending}>
								{t("benchmark.newTag")}
							</Button>
						</form>
					</Popover>
				</div>
				<form onSubmit={submit} className="flex flex-col gap-xl">
					<fieldset disabled={pending} className="contents">
						<label className="flex flex-col gap-sm text-body-sm">
							{t("benchmark.name")}
							<input
								required
								maxLength={80}
								className={FIELD}
								value={document.name}
								onChange={(event) =>
									setDocument({ ...document, name: event.target.value })
								}
							/>
						</label>
						<label className="flex flex-col gap-sm text-body-sm">
							{t("benchmark.descriptionLabel")}
							<textarea
								required
								maxLength={1000}
								rows={3}
								className={FIELD}
								value={document.description}
								onChange={(event) =>
									setDocument({ ...document, description: event.target.value })
								}
							/>
						</label>
						<Select
							label={t("benchmark.tag")}
							placeholder={t("benchmark.chooseTag")}
							value={document.tagId}
							onChange={(tagId) => setDocument({ ...document, tagId })}
							options={(tags.data ?? [])
								.filter((tag) => !tag.isSystem)
								.map((tag) => ({ label: tag.name, value: tag.id }))}
						/>
						<BenchmarkFeedback
							failed={tags.isError}
							retry={() => tags.refetch()}
						/>
						<div>
							<h2 className="text-heading-sm font-semibold">
								{t("benchmark.cases")}
							</h2>
							<p className="mt-sm text-body-sm text-body">
								{t("benchmark.answerHelp")}
							</p>
						</div>
						{document.cases.map((item, index) => (
							<section
								key={index}
								className="space-y-lg rounded-xl border border-hairline p-lg"
							>
								<div className="flex items-center justify-between gap-md">
									<span className="text-body-sm font-semibold">
										{t("benchmark.cases")} {index + 1}
									</span>
									<AlertDialog
										title={t("benchmark.removeCaseConfirm")}
										confirmText={t("benchmark.removeCase")}
										onConfirm={() =>
											setDocument({
												...document,
												cases: document.cases.filter(
													(_, position) => position !== index,
												),
											})
										}
										trigger={
											<Button variant="tertiary" size="sm">
												{t("benchmark.removeCase")}
											</Button>
										}
									/>
								</div>
								<label className="flex flex-col gap-sm text-body-sm">
									{t("benchmark.caseName")}
									<input
										required
										maxLength={120}
										className={FIELD}
										value={item.name}
										onChange={(event) =>
											setDocument({
												...document,
												cases: document.cases.map((value, position) =>
													position === index
														? { ...value, name: event.target.value }
														: value,
												),
											})
										}
									/>
								</label>
								<label className="flex flex-col gap-sm text-body-sm">
									{t("benchmark.prompt")}
									<textarea
										required
										rows={4}
										maxLength={16000}
										className={FIELD}
										value={item.prompt}
										onChange={(event) =>
											setDocument({
												...document,
												cases: document.cases.map((value, position) =>
													position === index
														? { ...value, prompt: event.target.value }
														: value,
												),
											})
										}
									/>
								</label>
								{item.checks.length === 1 &&
								item.checks[0].kind === "answer" ? (
									<label className="flex flex-col gap-sm text-body-sm">
										{t("benchmark.expected")}
										<textarea
											required
											rows={2}
											maxLength={65536}
											className={FIELD}
											value={item.checks[0].expected}
											onChange={(event) =>
												setDocument({
													...document,
													cases: document.cases.map((value, position) =>
														position === index
															? {
																	...value,
																	checks: [
																		{
																			kind: "answer",
																			expected: event.target.value,
																		},
																	],
																}
															: value,
													),
												})
											}
										/>
									</label>
								) : (
									<p className="text-body-sm text-body">
										{t("benchmark.structuredCase")}
									</p>
								)}
								<label className="flex max-w-60 flex-col gap-sm text-body-sm">
									{t("benchmark.timeout")}
									<input
										required
										type="number"
										min={1}
										max={60}
										className={FIELD}
										value={item.timeoutMinutes}
										onChange={(event) =>
											setDocument({
												...document,
												cases: document.cases.map((value, position) =>
													position === index
														? {
																...value,
																timeoutMinutes: Number(event.target.value),
															}
														: value,
												),
											})
										}
									/>
								</label>
							</section>
						))}
						<Button
							variant="secondary"
							className="self-start"
							isDisabled={document.cases.length >= 100}
							onPress={() =>
								setDocument({
									...document,
									cases: [
										...document.cases,
										{
											name: "",
											prompt: "",
											timeoutMinutes: 10,
											inputFiles: [],
											checks: [{ kind: "answer", expected: "" }],
										},
									],
								})
							}
						>
							{t("benchmark.addCase")}
						</Button>
					</fieldset>
					<div className="sticky bottom-0 flex flex-wrap justify-end gap-sm border-t border-hairline bg-canvas py-lg">
						<Button
							formNoValidate
							type="submit"
							value="save"
							isPending={pending}
							variant="secondary"
						>
							{t("benchmark.save")}
						</Button>
						<Button
							type="submit"
							value="publish"
							isPending={pending}
							isDisabled={!document.tagId || !document.cases.length}
						>
							{t("benchmark.publish")}
						</Button>
					</div>
				</form>
			</div>
		</main>
	);
};
const BenchmarkEditorPage = () => {
	const { draftId = "" } = useParams();
	const query = useBenchmarkDraft(draftId);
	if (draftId && !query.data)
		return (
			<BenchmarkFeedback
				loading={query.isLoading}
				failed={query.isError}
				retry={() => query.refetch()}
			/>
		);
	return <BenchmarkEditor key={draftId || "new"} initial={query.data} />;
};
export default BenchmarkEditorPage;
