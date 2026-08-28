import { useState } from "react";
import { Puzzle } from "@gravity-ui/icons";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";

const SKILL_FILTERS = ["all", "mounted", "local", "github"] as const;

// Temporary mock skill library for the Figma prototype; remove when the skills API is connected.
const MOCK_SKILLS = [
	{ access: "read", id: "repositoryMap", mountedCount: 2, source: "local" },
	{ access: "execute", id: "testRunner", mountedCount: 1, source: "github" },
	{ access: "read", id: "uiAudit", mountedCount: 0, source: "local" },
	{
		access: "read",
		id: "benchmarkEvaluator",
		mountedCount: 1,
		source: "github",
	},
	{ access: "read", id: "releaseNotes", mountedCount: 0, source: "local" },
] as const;

const SkillsPage = () => {
	const { t } = useTranslation();
	const [activeFilter, setActiveFilter] =
		useState<(typeof SKILL_FILTERS)[number]>("all");
	const [searchValue, setSearchValue] = useState("");
	const searchTerm = searchValue.trim().toLocaleLowerCase();
	const localizedSkills = MOCK_SKILLS.map((skill) => ({
		...skill,
		accessLabel: t(`skills.access.${skill.access}`),
		description: t(`skills.mock.${skill.id}.description`),
		name: t(`skills.mock.${skill.id}.name`),
		sourceLabel: t(`skills.source.${skill.source}`),
	}));
	const visibleSkills = localizedSkills.filter((skill) => {
		const matchesFilter =
			activeFilter === "all" ||
			(activeFilter === "mounted" && skill.mountedCount > 0) ||
			skill.source === activeFilter;
		const searchableText = [
			skill.name,
			skill.description,
			skill.sourceLabel,
			skill.accessLabel,
		]
			.join(" ")
			.toLocaleLowerCase();

		return matchesFilter && searchableText.includes(searchTerm);
	});

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
			<header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-xl">
				<p className="text-body-sm font-medium text-charcoal">
					{t("skills.title")}
				</p>
				<p className="font-mono text-caption-sm text-mute">
					{t("skills.path")}
				</p>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-[40px] pb-[40px] pt-[28px]">
				<div className="flex items-start justify-between gap-xl">
					<div className="min-w-0">
						<h1 className="font-primary text-[28px] font-semibold leading-[34px] text-ink">
							{t("skills.title")}
						</h1>
						<p className="mt-sm text-[15px] leading-5 text-charcoal">
							{t("skills.description")}
						</p>
					</div>
					<button
						className="h-9 w-[136px] shrink-0 rounded-md bg-surface-dark text-body-sm font-medium text-on-dark outline-none hover:bg-ink-deep focus-visible:ring-2 focus-visible:ring-focus-ring"
						type="button"
					>
						{t("skills.addSkill")}
					</button>
				</div>

				<input
					aria-label={t("skills.searchPlaceholder")}
					className="mt-[18px] h-10 w-full max-w-[520px] rounded-md border border-hairline bg-surface-card px-[14px] text-body-sm text-ink outline-none placeholder:text-mute focus:border-hairline-strong focus-visible:ring-2 focus-visible:ring-focus-ring"
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

				<div className="mt-[22px] overflow-x-auto rounded-lg border border-hairline bg-surface-card pb-[20px]">
					<table
						aria-label={t("skills.libraryLabel")}
						className="w-full min-w-[780px] table-fixed border-collapse"
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
							{visibleSkills.length === 0 ? (
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
		</main>
	);
};

export default SkillsPage;
