import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { Select } from "@/components/ui/select";
import { handleError } from "@/utils/error";
import { saveBenchmarkDraft, publishBenchmark } from "@/api/benchmark";
import { useBenchmarkTags } from "@/queries/benchmark";
import {
	BenchmarkValidationErrorSchema,
	type BenchmarkDocument,
	type BenchmarkDraft,
	type BenchmarkValidationIssue,
} from "@/types/benchmark";
import { BenchmarkFeedback } from "../../components/feedback";
import { BenchmarkCaseEditor } from "./benchmark-case-editor";
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
	const [validationIssues, setValidationIssues] = useState<
		BenchmarkValidationIssue[]
	>([]);

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
		setValidationIssues([]);
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
			const validation = BenchmarkValidationErrorSchema.safeParse(error);
			if (validation.success) {
				setValidationIssues(validation.data.details.issues);
			}
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
					{validationIssues.length > 0 && (
						<div
							role="alert"
							className="rounded-md border border-terminal-red p-md text-body-sm"
						>
							<p className="font-medium">{t("benchmark.validation.title")}</p>
							<ul className="mt-sm list-inside list-disc space-y-xs">
								{validationIssues.map((issue, index) => (
									<li key={`${issue.field}-${issue.code}-${index}`}>
										<code>{issue.field}</code>:{" "}
										{t(`benchmark.validation.${issue.code}`)}
									</li>
								))}
							</ul>
						</div>
					)}
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
							options={(tags.data ?? []).map((tag) => ({
								label: tag.name,
								value: tag.id,
							}))}
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
							<BenchmarkCaseEditor
								index={index}
								item={item}
								key={index}
								onChange={(next) =>
									setDocument({
										...document,
										cases: document.cases.map((value, position) =>
											position === index ? next : value,
										),
									})
								}
								onRemove={() =>
									setDocument({
										...document,
										cases: document.cases.filter(
											(_, position) => position !== index,
										),
									})
								}
							/>
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
