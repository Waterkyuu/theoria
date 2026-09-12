import { useState } from "react";
import { Check, PersonMagnifier, Tag, Timeline } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { Popover } from "@/components/ui/popover";
import type { BenchmarkFilters, BenchmarkTag } from "@/types/benchmark";
import { TagIcon } from "./tag-icon";

type FiltersProps = {
	/** Query values reset catalog pagination when changed. */
	value: BenchmarkFilters;
	/** Available local tags. */
	tags: BenchmarkTag[];
	/** Replaces the selected filters. */
	onChange: (filters: BenchmarkFilters) => void;
};

/**
 * Matches the Figma pills while keeping filtering on the full database.
 *
 * @example
 * <BenchmarkFiltersBar value={filters} tags={tags} onChange={setFilters} />
 */
const BenchmarkFiltersBar = ({ value, tags, onChange }: FiltersProps) => {
	const { t } = useTranslation();
	const [tagSearch, setTagSearch] = useState("");
	const [sortOpen, setSortOpen] = useState(false);
	const [authorOpen, setAuthorOpen] = useState(false);
	return (
		<div className="flex flex-wrap items-center gap-sm">
			<Button
				size="sm"
				className="rounded-full"
				variant={
					!value.tagIds.length && !value.author && !value.search
						? "primary"
						: "secondary"
				}
				onPress={() =>
					onChange({ search: "", tagIds: [], author: null, sort: "newest" })
				}
			>
				{t("benchmark.all")}
			</Button>
			<Popover
				title={t("benchmark.tags")}
				className="w-90 border border-hairline rounded-xl bg-canvas p-2 shadow-lg [&_section]:p-0 [&_h2]:sr-only"
				placement="bottom start"
				trigger={
					<Button
						size="sm"
						className="min-h-8 min-w-25 rounded-full border border-hairline bg-canvas px-2.5 py-1.75 text-body-sm shadow-none"
						variant="secondary"
					>
						<Tag className="size-4" />
						{t("benchmark.tags")}
						{value.tagIds.length ? ` (${value.tagIds.length})` : ""}
					</Button>
				}
			>
				<div className="flex flex-wrap items-center gap-1.5 rounded-md border border-hairline p-2">
					{tags
						.filter((tag) => value.tagIds.includes(tag.id))
						.map((tag) => (
							<span
								key={tag.id}
								className="rounded-full border border-hairline px-2.5 py-1.75 text-caption-sm text-charcoal"
							>
								{tag.name}
							</span>
						))}
					<input
						aria-label={t("benchmark.searchTags")}
						placeholder={t("benchmark.searchTags")}
						value={tagSearch}
						onChange={(event) => setTagSearch(event.target.value)}
						className="min-w-24 flex-1 bg-transparent text-body-sm outline-none"
					/>
				</div>
				<div
					className="mt-sm max-h-80 overflow-y-auto"
					role="group"
					aria-label={t("benchmark.tags")}
				>
					{tags
						.filter((tag) =>
							tag.name.toLowerCase().includes(tagSearch.toLowerCase()),
						)
						.map((tag) => (
							<button
								type="button"
								key={tag.id}
								role="checkbox"
								aria-checked={value.tagIds.includes(tag.id)}

								className="flex min-h-9 w-full items-center justify-start gap-sm rounded-md px-2.5 py-2 text-body-sm hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
								onClick={() =>
									onChange({
										...value,
										tagIds: value.tagIds.includes(tag.id)
											? value.tagIds.filter((id) => id !== tag.id)
											: [...value.tagIds, tag.id],
									})
								}
							>
								<Check
									className={cn(
										"size-4",
										!value.tagIds.includes(tag.id) && "invisible",
									)}
								/>
								<TagIcon name={tag.icon} />
								{tag.name}
							</button>
						))}
				</div>
			</Popover>
			<Popover
				isOpen={sortOpen}
				onOpenChange={setSortOpen}
				title={t("benchmark.sortBy")}
				className="w-55 rounded-xl border border-hairline bg-canvas p-2 shadow-lg [&_section]:p-0 [&_h2]:px-2.5 [&_h2]:py-1.5 [&_h2]:text-caption-sm [&_h2]:text-mute"
				placement="bottom start"
				trigger={
					<Button
						size="sm"
						className="min-h-8 min-w-25 rounded-full border border-hairline bg-canvas px-2.5 py-1.75 text-body-sm shadow-none"
						variant="secondary"
					>
						<Timeline className="size-4" />
						{t(`benchmark.sort.${value.sort}`)}
					</Button>
				}
			>
				<div className="flex flex-col gap-xs">
					{(["newest", "updated", "oldest", "alphabetical"] as const).map(
						(sort) => (
							<Button
								key={sort}
								aria-pressed={value.sort === sort}
								className="min-h-9 w-full justify-start gap-2.5 rounded-md bg-transparent px-2.5 text-body-sm font-normal shadow-none aria-pressed:bg-surface-soft aria-pressed:font-medium"
								variant="tertiary"
								onPress={() => {
									onChange({ ...value, sort });
									setSortOpen(false);
								}}
							>
								<Check
									className={cn("size-4", value.sort !== sort && "invisible")}
								/>
								{t(`benchmark.sort.${sort}`)}
							</Button>
						),
					)}
				</div>
			</Popover>
			<Popover
				isOpen={authorOpen}
				onOpenChange={setAuthorOpen}
				title={t("benchmark.filterAuthor")}
				className="w-60 rounded-xl border border-hairline bg-canvas p-2 shadow-lg [&_section]:p-0 [&_h2]:px-2.5 [&_h2]:py-1.5 [&_h2]:text-caption-sm [&_h2]:text-mute"
				placement="bottom start"
				trigger={
					<Button
						size="sm"
						className="min-h-8 min-w-25 rounded-full border border-hairline bg-canvas px-2.5 py-1.75 text-body-sm shadow-none"
						variant="secondary"
					>
						<PersonMagnifier className="size-4" />
						{value.author
							? t(`benchmark.authors.${value.author}`)
							: t("benchmark.author")}
					</Button>
				}
			>
				<div className="flex flex-col gap-xs">
					{([null, "platform", "myself"] as const).map((author) => (
						<Button
							key={author ?? "all"}
							aria-pressed={value.author === author}
							className="min-h-9 w-full justify-start gap-2.5 rounded-md bg-transparent px-2.5 text-body-sm font-normal shadow-none aria-pressed:bg-surface-soft aria-pressed:font-medium"
							variant="tertiary"
							onPress={() => {
								onChange({ ...value, author });
								setAuthorOpen(false);
							}}
						>
							<Check
								className={cn("size-4", value.author !== author && "invisible")}
							/>
							{author
								? t(`benchmark.authors.${author}`)
								: t("benchmark.allAuthors")}
						</Button>
					))}
				</div>
			</Popover>
		</div>
	);
};

export { BenchmarkFiltersBar };
