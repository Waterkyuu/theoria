import { useParams } from "react-router";
import { useBenchmarkDraft } from "@/queries/benchmark";
import { BenchmarkFeedback } from "../components/feedback";
import { BenchmarkEditor } from "./components/benchmark-editor";

const BenchmarkEditorPage = () => {
	const { draftId = "" } = useParams();
	const query = useBenchmarkDraft(draftId);
	if (draftId && !query.data)
		return (
			<BenchmarkFeedback
				loading={query.isLoading}
				failed={query.isError}
				retry={() => query.refetch()}
			/>
		);
	return <BenchmarkEditor key={draftId || "new"} initial={query.data} />;
};

export { BenchmarkEditorPage };

export default BenchmarkEditorPage;
