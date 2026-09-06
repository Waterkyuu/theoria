import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { SkillCreateForm } from "./components/skill-create-form";

const SimpleCreateSkillPage = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("skills.create.title")}
				</p>
				<p className="hidden font-mono text-caption-sm text-mute sm:block">
					/simple-create-skill
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

					<SkillCreateForm />
				</div>
			</div>
		</main>
	);
};

export { SimpleCreateSkillPage };
export default SimpleCreateSkillPage;
