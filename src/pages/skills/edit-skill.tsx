import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { Loading } from "@/components/ui/loading";
import { useSkillFiles } from "@/queries/skill";
import { SkillEditor } from "./components/skill-editor";

const EditSkillPage = () => {
	const { skillId = "" } = useParams();
	const query = useSkillFiles(skillId);
	const { t } = useTranslation();
	const navigate = useNavigate();
	if (query.isPending) return <Loading variant="section" />;
	if (query.isError)
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
		<SkillEditor key={skillId} skillId={skillId} initialDraft={query.data} />
	);
};

export default EditSkillPage;
