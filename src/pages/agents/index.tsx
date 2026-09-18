import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/share/page-header";

/** Renders the reserved Agent access page surface. */
const AgentsPage = () => {
	const { t } = useTranslation();

	return (
		<main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>{t("navigation.agentAccess")}</PageHeader>
		</main>
	);
};

export default AgentsPage;
