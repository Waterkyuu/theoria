import { useState } from "react";
import { Puzzle } from "@gravity-ui/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { handleError } from "@/utils/error";
import {
	useImportSkill,
	useSkillMountCounts,
	useSkills,
} from "@/queries/skill";
import type { Skill } from "@/types/skill";
import { WorkspaceMountModal } from "./workspace-mount-modal";

const SKILL_FILTERS = ["all", "mounted", "local", "github"] as const;
type SkillFilter = (typeof SKILL_FILTERS)[number];

type LibrarySkill = Skill & {
	/** Existing UI source grouping derived from the persisted source type. */
	source: "local" | "github";
	/** Number of persisted Workspace mount relationships. */
	mountedCount: number;
};

/**
 * Adapts persisted Skill metadata to the existing Skill Library presentation.
 *
 * @example
 * toLibrarySkill(skill, 2);
 */
const toLibrarySkill = (skill: Skill, mountedCount: number): LibrarySkill => ({
	...skill,
	source: skill.sourceType === "git" ? "github" : "local",
	mountedCount,
});

const SkillsPage = () => {
	const { t } = useTranslation();
	const [activeFilter, setActiveFilter] = useState<SkillFilter>("all");
	const [searchValue, setSearchValue] = useState("");
	const [managedSkill, setManagedSkill] = useState<Skill | null>(null);
	const skillsQuery = useSkills();
	const mountCountsQuery = useSkillMountCounts();
	const importSkillMutation = useImportSkill();
	const isLoading = skillsQuery.isLoading || mountCountsQuery.isLoading;
	const loadError = skillsQuery.error ?? mountCountsQuery.error;
	const pageError = loadError ?? importSkillMutation.error;
	const searchTerm = searchValue.trim().toLocaleLowerCase();
	const localizedSkills = (skillsQuery.data ?? [])
		.map((skill) =>
			toLibrarySkill(skill, mountCountsQuery.data?.[skill.id] ?? 0),
		)
		.map((skill) => ({
			...skill,
			accessLabel: t("skills.access.read"),
			name: skill.folderName,
			sourceLabel: t(`skills.source.${skill.source}`),
		}));
	const visibleSkills = localizedSkills.filter((skill) => {
		const matchesFilter =
			activeFilter === "all" ||
			(activeFilter === "mounted" && skill.mountedCount > 0) ||
			skill.source === activeFilter;
		const searchableText = [
			skill.name,
			skill.displayName,
			skill.description,
			skill.sourceLabel,
			skill.accessLabel,
		]
			.join(" ")
			.toLocaleLowerCase();

		return matchesFilter && searchableText.includes(searchTerm);
	});

	/** Opens the native picker and delegates SKILL.md validation to native storage. */
	const importSkillFolder = async () => {
		if (importSkillMutation.isPending) return;
		try {
			const sourcePath = await open({
				directory: true,
				multiple: false,
				title: t("skills.chooseFolderTitle"),
			});
			if (sourcePath) await importSkillMutation.mutateAsync(sourcePath);
		} catch (error) {
			handleError(error, "Skill import failed");
		}
	};

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<header className="flex h-[34px] shrink-0 items-center justify-between border-b border-hairline px-4 sm:px-xl">
				<p className="text-body-sm font-medium text-charcoal">
					{t("skills.title")}
				</p>
				<p className="hidden font-mono text-caption-sm text-mute sm:block">
					{t("skills.path")}
				</p>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-10 sm:pb-10 sm:pt-7">
				<div className="flex flex-col items-start justify-between gap-lg sm:flex-row sm:gap-xl">
					<div className="min-w-0">
						<h1 className="font-primary text-[28px] font-semibold leading-[34px] text-ink">
							{t("skills.title")}
						</h1>
						<p className="mt-sm text-[15px] leading-5 text-charcoal">
							{t("skills.description")}
						</p>
					</div>
					<button
						className="h-9 w-full shrink-0 rounded-md bg-surface-dark px-lg text-body-sm font-medium text-on-dark outline-none hover:bg-ink-deep focus-visible:ring-2 focus-visible:ring-focus-ring sm:w-auto sm:min-w-34"
						disabled={importSkillMutation.isPending}
						onClick={() => importSkillFolder()}
						type="button"
					>
						{t("skills.addSkill")}
					</button>
				</div>

				<input
					aria-label={t("skills.searchPlaceholder")}
					className="mt-[18px] h-10 w-full max-w-130 rounded-md border border-hairline bg-surface-card px-[14px] text-body-sm text-ink outline-none placeholder:text-mute focus:border-hairline-strong focus-visible:ring-2 focus-visible:ring-focus-ring"
					onChange={(event) => setSearchValue(event.target.value)}
					placeholder={t("skills.searchPlaceholder")}
					type="search"
					value={searchValue}
				/>

				<div className="mt-[14px] flex flex-wrap gap-sm">
					{SKILL_FILTERS.map((filter) => (
						<button
							aria-pressed={activeFilter === filter}
							className={cn(
								"h-[30px] rounded-full bg-surface-soft px-md text-[13px] font-medium text-charcoal outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring",
								activeFilter === filter &&
									"bg-surface-dark text-on-dark hover:bg-ink-deep",
							)}
							key={filter}
							onClick={() => setActiveFilter(filter)}
							type="button"
						>
							{t(`skills.filters.${filter}`)}
						</button>
					))}
				</div>

				<div className="-mx-4 mt-[22px] overflow-x-auto border-y border-hairline bg-surface-card pb-5 sm:mx-0 sm:rounded-lg sm:border">
					<table
						aria-label={t("skills.libraryLabel")}
						className="w-full min-w-195 table-fixed border-collapse"
					>
						<colgroup>
							<col className="w-[48%]" />
							<col className="w-[16%]" />
							<col className="w-[13%]" />
							<col className="w-[10%]" />
							<col className="w-[13%]" />
						</colgroup>
						<thead>
							<tr className="h-12 border-b border-hairline text-left text-caption-sm font-medium text-mute">
								<th className="px-lg font-medium" scope="col">
									{t("skills.columns.skill")}
								</th>
								<th className="px-sm font-medium" scope="col">
									{t("skills.columns.source")}
								</th>
								<th className="px-sm font-medium" scope="col">
									{t("skills.columns.workspaces")}
								</th>
								<th className="px-sm font-medium" scope="col">
									{t("skills.columns.access")}
								</th>
								<th aria-label={t("skills.columns.actions")} scope="col" />
							</tr>
						</thead>
						<tbody>
							{visibleSkills.map((skill) => (
								<tr
									className="h-24 border-b border-hairline last:border-b-0"
									key={skill.id}
								>
									<td className="px-lg">
										<div className="flex items-start gap-[14px]">
											<Puzzle
												aria-hidden="true"
												className="mt-xs size-5 shrink-0"
											/>
											<div className="min-w-0">
												<p className="truncate text-body-md font-medium leading-5 text-ink">
													{skill.name}
												</p>
												<p className="mt-xs truncate text-[13px] leading-4 text-charcoal">
													{skill.description}
												</p>
											</div>
										</div>
									</td>
									<td className="px-sm text-body-sm text-charcoal">
										{skill.sourceLabel}
									</td>
									<td
										className={cn(
											"px-sm text-body-sm",
											skill.mountedCount === 0 ? "text-mute" : "text-ink",
										)}
									>
										{skill.mountedCount === 0
											? t("skills.notMounted")
											: t("skills.mountedCount", {
													count: skill.mountedCount,
												})}
									</td>
									<td className="px-sm text-body-sm text-charcoal">
										{skill.accessLabel}
									</td>
									<td className="px-sm text-right">
										<button
											className="h-9 w-[94px] rounded-md border border-hairline bg-surface-card text-body-sm font-medium text-ink outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
											onClick={() => setManagedSkill(skill)}
											type="button"
										>
											{t(
												skill.mountedCount > 0
													? "skills.manage"
													: "skills.mount",
											)}
										</button>
									</td>
								</tr>
							))}
							{isLoading || pageError ? (
								<tr>
									<td
										className="h-24 px-lg text-center text-body-sm text-mute"
										colSpan={5}
										role={pageError ? "alert" : "status"}
									>
										{t(
											pageError
												? importSkillMutation.error
													? "skills.importFailed"
													: "skills.loadFailed"
												: "skills.loading",
										)}
									</td>
								</tr>
							) : null}
							{!isLoading && !pageError && visibleSkills.length === 0 ? (
								<tr>
									<td
										className="h-24 px-lg text-center text-body-sm text-mute"
										colSpan={5}
									>
										{t("skills.noResults")}
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</div>
			{managedSkill ? (
				<WorkspaceMountModal
					isOpen
					onOpenChange={(isOpen) => {
						if (!isOpen) setManagedSkill(null);
					}}
					skill={managedSkill}
				/>
			) : null}
		</main>
	);
};

export default SkillsPage;
