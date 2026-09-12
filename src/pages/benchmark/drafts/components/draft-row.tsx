import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useBenchmarkDraft } from "@/queries/benchmark";
import { BenchmarkFeedback } from "../../components/feedback";

type DraftRowProps = {
	/** Lazily loaded draft ID. */
	id: string;
};
/**
 * Loads only visible draft metadata for the saved-editor list.
 *
 * @example
 * <DraftRow id="draft" />
 */
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
export { DraftRow };
