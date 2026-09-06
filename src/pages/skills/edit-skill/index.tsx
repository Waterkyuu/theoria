import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { Loading } from "@/components/ui/loading";
import { useSkillFiles } from "@/queries/skill";
import { SkillEditor } from "./components/skill-editor";

const EditSkillPage = () => {
	const [params] = useSearchParams();
	const skillId = params.get("skillId") || undefined;
	const query = useSkillFiles(skillId);
	const { t } = useTranslation();
	const navigate = useNavigate();

	if (skillId && query.isPending) return <Loading variant="section" />;
	if (skillId && query.isError)
		return (
			<main className="flex flex-col items-center gap-4 p-8">
				<p role="alert">{t("skills.editor.loadFailed")}</p>
				<div className="flex gap-2">
					<Button variant="secondary" onPress={() => navigate("/skills")}>
						{t("skills.create.back")}
					</Button>
					<Button
						onPress={() => {
							query.refetch();
						}}
					>
						{t("skills.editor.retry")}
					</Button>
				</div>
			</main>
		);
	return (
		<SkillEditor
			key={skillId ?? "new"}
			skillId={skillId}
			initialDraft={skillId ? query.data : undefined}
		/>
	);
};

export { EditSkillPage };
export default EditSkillPage;
