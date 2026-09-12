import { useTranslation } from "react-i18next";
import { useBenchmark } from "@/queries/benchmark";
import type { BenchmarkMount } from "@/types/benchmark";
type BenchmarkMountRowProps = {
	/** Persisted relationship with a pinned version. */ mount: BenchmarkMount;
	/** Preserves the desktop navigation shell. */ onNavigate: (
		path: string,
	) => void;
};
/** Reads the pinned title instead of looking up the latest catalog card. @example <BenchmarkMountRow mount={mount} onNavigate={navigate} /> */
const BenchmarkMountRow = ({ mount, onNavigate }: BenchmarkMountRowProps) => {
	const { t } = useTranslation();
	const query = useBenchmark(mount.benchmarkId, mount.versionId);
	return (
		<button
			type="button"
			className="mt-xs flex w-full items-center gap-sm rounded-md py-sm pl-12 pr-sm text-left text-body-sm outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
			onClick={() =>
				onNavigate(
					`/workspaces/${encodeURIComponent(mount.workspaceId)}/benchmark/${encodeURIComponent(mount.id)}`,
				)
			}
		>
			<span className="min-w-0 truncate">
				{query.data?.document.name ??
					(query.isError ? t("benchmark.loadFailed") : t("loadingPage"))}
			</span>
		</button>
	);
};
export { BenchmarkMountRow };
