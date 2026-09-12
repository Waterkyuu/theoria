import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { useBenchmarkDrafts } from "@/queries/benchmark";
import { BenchmarkFeedback } from "../components/feedback";
import { DraftRow } from "./components/draft-row";
const BenchmarkDraftsPage = () => {
	const { t } = useTranslation();
	const query = useBenchmarkDrafts();
	const ids = query.data?.pages.flat() ?? [];
	return (
		<main className="flex h-full min-h-0 flex-col">
			<PageHeader>
				<Link to="/benchmark">{t("benchmark.back")}</Link>
			</PageHeader>
			<div className="mx-auto w-full max-w-240 space-y-lg overflow-auto p-xl">
				<h1 className="text-heading-lg font-semibold">
					{t("benchmark.drafts")}
				</h1>
				<BenchmarkFeedback
					loading={query.isLoading}
					failed={query.isError}
					retry={() => query.refetch()}
				/>
				{!query.isLoading && !query.isError && !ids.length && (
					<p>{t("benchmark.noDrafts")}</p>
				)}
				{ids.map((id) => (
					<DraftRow id={id} key={id} />
				))}
				{query.hasNextPage && (
					<Button
						onPress={() => query.fetchNextPage()}
						isPending={query.isFetchingNextPage}
					>
						{t("benchmark.more")}
					</Button>
				)}
			</div>
		</main>
	);
};
export default BenchmarkDraftsPage;
