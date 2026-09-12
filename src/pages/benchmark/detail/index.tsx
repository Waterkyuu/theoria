import { useParams } from "react-router";
import { BenchmarkDetailView } from "../components/benchmark-detail-view";

const BenchmarkDetailPage = () => {
	const { benchmarkId = "" } = useParams();
	return <BenchmarkDetailView benchmarkId={benchmarkId} />;
};

export { BenchmarkDetailPage };

export default BenchmarkDetailPage;
