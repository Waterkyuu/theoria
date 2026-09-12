import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Loading } from "@/components/ui/loading";
type FeedbackProps = {
	/** Loading precedes empty state. */ loading?: boolean;
	/** Whether the request failed. */ failed?: boolean;
	/** Reloads the affected request. */ retry?: () => void;
	/** Whether the successfully loaded list is empty. */ empty?: boolean;
};
/** Keeps read errors visible instead of disguising them as an empty library. @example <BenchmarkFeedback failed retry={reload} /> */
const BenchmarkFeedback = ({
	loading,
	failed,
	retry,
	empty,
}: FeedbackProps) => {
	const { t } = useTranslation();
	if (loading) return <Loading variant="section" />;
	if (failed)
		return (
			<div className="space-y-md py-xl" role="alert">
				<p>{t("benchmark.loadFailed")}</p>
				<Button onPress={retry} variant="secondary">
					{t("benchmark.retry")}
				</Button>
			</div>
		);
	if (empty)
		return (
			<div
				className="rounded-lg border border-dashed border-hairline p-xl text-body-sm text-body"
				role="status"
			>
				{t("benchmark.empty")}
			</div>
		);
	return null;
};
export { BenchmarkFeedback };
