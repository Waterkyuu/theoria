import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { useBenchmarkDraft, useBenchmarkDrafts } from "@/queries/benchmark";
import { BenchmarkFeedback } from "./components/feedback";
type DraftRowProps = { /** Lazily loaded draft ID. */ id: string };
/** Loads only visible draft metadata for the saved-editor list. @example <DraftRow id="draft" /> */
const DraftRow = ({ id }: DraftRowProps) => {
	const { t } = useTranslation();
	const query = useBenchmarkDraft(id);
	return (
		<div className="rounded-lg border border-hairline p-lg">
			<BenchmarkFeedback
				loading={query.isLoading}
				failed={query.isError}
				retry={() => query.refetch()}
			/>
			{query.data && (
				<Link
					className="break-words font-medium hover:underline"
					to={`/benchmark/drafts/${encodeURIComponent(id)}`}
				>
					{query.data.document.name || t("benchmark.draftUntitled")}
				</Link>
			)}
		</div>
	);
};
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
