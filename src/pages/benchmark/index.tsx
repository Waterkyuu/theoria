import { useState } from "react";
import { ListCheck, Plus } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { SearchBox } from "@/components/ui/search-box";
import { useBenchmarks, useBenchmarkTags } from "@/queries/benchmark";
import type { BenchmarkFilters, BenchmarkSummary } from "@/types/benchmark";
import { BenchmarkFeedback } from "./components/feedback";
import { BenchmarkFiltersBar } from "./components/filters";
import { BenchmarkMountModal } from "./components/mount-modal";
import { TagIcon } from "./components/tag-icon";

const BenchmarkPage = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [filters, setFilters] = useState<BenchmarkFilters>({
		search: "",
		tagIds: [],
		author: null,
		sort: "newest",
	});
	const [mounting, setMounting] = useState<BenchmarkSummary | null>(null);
	const query = useBenchmarks(filters);
	const tags = useBenchmarkTags();
	const cards = query.data?.pages.flat() ?? [];
	return (
		<main className="flex h-full min-h-0 flex-col">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("benchmark.title")}
				</p>
			</PageHeader>
			<div className="w-full overflow-y-auto px-10 py-7.5">
				<div className="mb-xl flex flex-wrap items-center justify-between gap-lg">
					<div>
						<h1 className="text-[28px] leading-[1.45] font-semibold text-ink">
							{t("benchmark.title")}
						</h1>
						<p className="mt-1.5 text-[15px] text-charcoal">
							{t("benchmark.description")}
						</p>
					</div>
					<DropdownMenu
						items={[
							{ id: "new", labelKey: "benchmark.newTitle" },
							{ id: "drafts", labelKey: "benchmark.drafts" },
						]}
						onAction={(action) => navigate(`/benchmark/${action}`)}
						trigger={
							<Button className="min-h-9 rounded-md px-2.5 py-2 text-body-sm">
								<Plus className="size-4" />
								{t("benchmark.add")}
							</Button>
						}
					/>
				</div>
				<div className="mb-xl max-w-160">
					<SearchBox
						className="h-10 rounded-md border border-hairline bg-canvas shadow-none"
						value={filters.search}
						onValueChange={(search) => setFilters({ ...filters, search })}
						placeholder={t("benchmark.search")}
					/>
				</div>
				<BenchmarkFiltersBar
					value={filters}
					onChange={setFilters}
					tags={tags.data ?? []}
				/>
				<BenchmarkFeedback failed={tags.isError} retry={() => tags.refetch()} />
				<div className="mt-xl">
					<BenchmarkFeedback
						loading={query.isLoading}
						failed={query.isError}
						retry={() => query.refetch()}
						empty={!query.isLoading && !query.isError && !cards.length}
					/>
				</div>
				<div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
					{cards.map((card) => {
						const tag = tags.data?.find((item) => item.id === card.tagId);
						return (
							<article
								key={card.id}
								className="relative flex min-w-0 flex-col gap-lg rounded-xl border border-hairline bg-surface-card p-xl"
							>
								<div className="flex items-center justify-between gap-md">
									<ListCheck className="size-5" />
									{tag && (
										<span className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1.75 text-caption-sm text-charcoal">
											<TagIcon name={tag.icon} />
											{tag.name}
										</span>
									)}
								</div>
								<Link
									className="break-words text-[18px] after:absolute after:inset-0 font-semibold text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring"
									to={`/benchmark/${encodeURIComponent(card.id)}`}
								>
									{card.name}
								</Link>
								<p className="line-clamp-2 min-h-10 text-body-sm text-charcoal">
									{card.description}
								</p>
								<p className="text-caption-sm text-charcoal">
									{t("benchmark.caseCount", { count: card.caseCount })} ·{" "}
									{t("benchmark.automaticChecks")}
								</p>
								<Button
									className="relative z-10 min-h-9 min-w-28 self-start rounded-md px-3 py-2 text-body-sm border border-hairline bg-canvas shadow-none"
									size="sm"
									variant="secondary"
									onPress={() => setMounting(card)}
								>
									<Plus className="size-4" />
									{t("benchmark.mount")}
								</Button>
							</article>
						);
					})}
				</div>
				{query.hasNextPage && (
					<Button
						className="mt-xl"
						variant="secondary"
						isPending={query.isFetchingNextPage}
						onPress={() => query.fetchNextPage()}
					>
						{t("benchmark.more")}
					</Button>
				)}
			</div>
			{mounting && (
				<BenchmarkMountModal
					benchmark={mounting}
					onClose={() => setMounting(null)}
				/>
			)}
		</main>
	);
};

export default BenchmarkPage;
