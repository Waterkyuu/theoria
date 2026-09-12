import { useEffect } from "react";
import { useParams } from "react-router";
import { useWorkspaceBenchmarks } from "@/queries/benchmark";
import { BenchmarkDetailView } from "../components/benchmark-detail-view";
import { BenchmarkFeedback } from "../components/feedback";

const WorkspaceBenchmarkPage = () => {
	const { workspaceId = "", mountId = "" } = useParams();
	const query = useWorkspaceBenchmarks(workspaceId);
	const mount = query.data?.pages.flat().find((item) => item.id === mountId);
	const { hasNextPage, isFetching, isError, fetchNextPage } = query;
	useEffect(() => {
		if (!mount && hasNextPage && !isFetching && !isError) fetchNextPage();
	}, [mount, hasNextPage, isFetching, isError, fetchNextPage]);
	if (!mount)
		return (
			<BenchmarkFeedback
				loading={query.isLoading || query.isFetching || query.hasNextPage}
				failed={query.isError || (!query.isLoading && !query.hasNextPage)}
				retry={() => query.refetch()}
			/>
		);
	return (
		<BenchmarkDetailView
			key={mount.id}
			benchmarkId={mount.benchmarkId}
			mount={mount}
		/>
	);
};
export { WorkspaceBenchmarkPage };
export default WorkspaceBenchmarkPage;
