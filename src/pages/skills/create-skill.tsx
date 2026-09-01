import { type FormEvent, useState } from "react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { handleError } from "@/utils/error";
import { useCreatePlatformSkill } from "@/queries/skill";

/** Minimal MVP form for authoring a managed SKILL.md inside Theoria. */
const CreateSkillPage = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const createSkillMutation = useCreatePlatformSkill();
	const [displayName, setDisplayName] = useState("");
	const [description, setDescription] = useState("");
	const [content, setContent] = useState("");
	const trimmedDisplayName = displayName.trim();
	const isDisplayNameValid = /^(?=.*[A-Za-z])[A-Za-z0-9 _-]+$/.test(
		trimmedDisplayName,
	);
	const canCreate = Boolean(
		isDisplayNameValid && description.trim() && content.trim(),
	);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canCreate || createSkillMutation.isPending) return;
		try {
			await createSkillMutation.mutateAsync({
				displayName: trimmedDisplayName,
				description: description.trim(),
				content: content.trim(),
			});
			navigate("/skills");
		} catch (error) {
			handleError(error, "Platform Skill creation failed");
		}
	};

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("skills.create.title")}
				</p>
				<p className="hidden font-mono text-caption-sm text-mute sm:block">
					/skills/create-skill
				</p>
			</PageHeader>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
				<div className="mx-auto max-w-190">
					<button
						className="text-body-sm font-medium text-charcoal outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => navigate("/skills")}
						type="button"
					>
						{t("skills.create.back")}
					</button>
					<h1 className="mt-lg font-primary text-[28px] font-semibold leading-[34px] text-ink">
						{t("skills.create.title")}
					</h1>
					<p className="mt-sm text-[15px] leading-5 text-charcoal">
						{t("skills.create.description")}
					</p>

					<form
						className="mt-xl flex flex-col gap-lg rounded-lg border border-hairline bg-surface-card p-lg sm:p-xl"
						onSubmit={submit}
					>
						<TextField className="flex flex-col gap-xs text-body-sm font-medium text-ink">
							<Label>{t("skills.create.nameLabel")}</Label>
							<Input
								className="rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
								maxLength={120}
								onChange={(event) => setDisplayName(event.target.value)}
								value={displayName}
							/>
							{trimmedDisplayName && !isDisplayNameValid ? (
								<p className="text-caption-sm font-normal text-terminal-red">
									{t("skills.create.nameInvalid")}
								</p>
							) : null}
						</TextField>
						<TextField className="flex flex-col gap-xs text-body-sm font-medium text-ink">
							<Label>{t("skills.create.descriptionLabel")}</Label>
							<TextArea
								className="min-h-24 resize-y rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
								onChange={(event) => setDescription(event.target.value)}
								value={description}
							/>
						</TextField>
						<TextField className="flex flex-col gap-xs text-body-sm font-medium text-ink">
							<Label>{t("skills.create.contentLabel")}</Label>
							<TextArea
								className="min-h-72 resize-y rounded-md border border-hairline bg-canvas px-md py-sm font-mono text-body-sm font-normal leading-6 outline-none focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
								onChange={(event) => setContent(event.target.value)}
								value={content}
							/>
						</TextField>
						{createSkillMutation.error ? (
							<p className="text-body-sm text-terminal-red" role="alert">
								{t("skills.create.failed")}
							</p>
						) : null}
						<div className="flex justify-end gap-sm border-t border-hairline pt-lg">
							<Button onPress={() => navigate("/skills")} variant="tertiary">
								{t("common.cancel")}
							</Button>
							<Button
								isDisabled={!canCreate || createSkillMutation.isPending}
								type="submit"
								variant="primary"
							>
								{t("skills.create.submit")}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</main>
	);
};

export { CreateSkillPage };
export default CreateSkillPage;
