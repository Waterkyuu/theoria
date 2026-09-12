import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Label, NumberField, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { saveBenchmarkDraft, publishBenchmark } from "@/api/benchmark";
import { useBenchmarkTags } from "@/queries/benchmark";
import type { BenchmarkDocument, BenchmarkDraft } from "@/types/benchmark";
import { BenchmarkFeedback } from "../../components/feedback";
import { BenchmarkTagCreatePopover } from "./benchmark-tag-create-popover";

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
					<BenchmarkTagCreatePopover
						onCreated={(tag) =>
							setDocument((current) => ({ ...current, tagId: tag.id }))
						}
					/>
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
							className="w-full max-w-96"
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
								className="rounded-xl border border-hairline p-lg"
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
											<Button
												variant="secondary"
												size="sm"
												className="border border-terminal-red bg-canvas text-terminal-red shadow-none"
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
									<NumberField
										className="max-w-60"
										fullWidth
										isRequired
										minValue={1}
										maxValue={60}
										value={item.timeoutMinutes}
										onChange={(nextValue) =>
											setDocument({
												...document,
												cases: document.cases.map((value, position) =>
													position === index
														? {
																...value,
																timeoutMinutes: Number.isNaN(nextValue)
																	? 1
																	: nextValue,
															}
														: value,
												),
											})
										}
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
								</div>
							</section>
						))}
						<Button
							variant="secondary"
							className="self-start border border-hairline bg-canvas shadow-none"
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
							className="border border-hairline bg-canvas shadow-none"
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

export { BenchmarkEditor };
