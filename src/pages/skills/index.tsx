import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/share/page-header";
import { ModalProvider } from "@/components/ui/modal-provider";
import { handleError } from "@/utils/error";
import { selectSkillFolder } from "@/api/skill";
import {
	useImportGitSkill,
	useImportSkill,
	useSkillMountCounts,
	useSkills,
	useUpdateGitSkill,
} from "@/queries/skill";
import type { Skill } from "@/types/skill";
import type { SkillAddAction, SkillFilter } from "./components/skill-dropdowns";
import {
	SKILL_FILTERS,
	SkillAddDropdown,
	SkillFilterDropdown,
} from "./components/skill-dropdowns";
import { SkillLibraryTable } from "./components/skill-library-table";
import { WorkspaceMountModal } from "./components/workspace-mount-modal";

type LibrarySkill = Skill & {
	/** Number of persisted Workspace mount relationships. */
	mountedCount: number;
};

/**
 * Adds persisted mount usage to the Skill record without collapsing its exact source type.
 *
 * @example
 * toLibrarySkill(skill, 2);
 */
const toLibrarySkill = (skill: Skill, mountedCount: number): LibrarySkill => ({
	...skill,
	mountedCount,
});

const SkillsPage = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [activeFilter, setActiveFilter] = useState<SkillFilter>("all");
	const [searchValue, setSearchValue] = useState("");
	const [managedSkill, setManagedSkill] = useState<Skill | null>(null);
	const [isGitImportOpen, setIsGitImportOpen] = useState(false);
	const [gitUrl, setGitUrl] = useState("");
	const skillsQuery = useSkills();
	const mountCountsQuery = useSkillMountCounts();
	const importSkillMutation = useImportSkill();
	const importGitSkillMutation = useImportGitSkill();
	const updateGitSkillMutation = useUpdateGitSkill();
	const isLoading = skillsQuery.isLoading || mountCountsQuery.isLoading;
	const loadError = skillsQuery.error ?? mountCountsQuery.error;
	const pageError =
		loadError ??
		importSkillMutation.error ??
		importGitSkillMutation.error ??
		updateGitSkillMutation.error;
	const searchTerm = searchValue.trim().toLocaleLowerCase();
	const localizedSkills = (skillsQuery.data ?? [])
		.map((skill) =>
			toLibrarySkill(skill, mountCountsQuery.data?.[skill.id] ?? 0),
		)
		.map((skill) => ({
			...skill,
			name: skill.folderName,
			sourceLabel: t(`skills.source.${skill.sourceType}`),
		}));
	const visibleSkills = localizedSkills.filter((skill) => {
		const matchesFilter =
			activeFilter === "all" ||
			(activeFilter === "mounted" && skill.mountedCount > 0) ||
			skill.sourceType === activeFilter;
		const searchableText = [
			skill.name,
			skill.displayName,
			skill.description,
			skill.sourceLabel,
		]
			.join(" ")
			.toLocaleLowerCase();

		return matchesFilter && searchableText.includes(searchTerm);
	});

	/** Opens the Skill-specific native picker and delegates validation to native storage. */
	const importSkillFolder = async () => {
		if (importSkillMutation.isPending) return;
		try {
			const sourcePath = await selectSkillFolder(t("skills.chooseFolderTitle"));
			if (sourcePath) await importSkillMutation.mutateAsync(sourcePath);
		} catch (error) {
			handleError(error, "Skill import failed");
		}
	};

	/** Imports one repository URL after the user confirms the Git dialog. */
	const importSkillFromGit = async () => {
		const trimmedGitUrl = gitUrl.trim();
		if (!trimmedGitUrl || importGitSkillMutation.isPending) return;
		try {
			await importGitSkillMutation.mutateAsync(trimmedGitUrl);
			setGitUrl("");
			setIsGitImportOpen(false);
		} catch (error) {
			handleError(error, "Git Skill import failed");
		}
	};

	/** Refreshes a Git Skill from the remote URL retained by native storage. */
	const updateGitSkill = async (skillId: string) => {
		if (updateGitSkillMutation.isPending) return;
		try {
			await updateGitSkillMutation.mutateAsync(skillId);
		} catch (error) {
			handleError(error, "Git Skill update failed");
		}
	};

	/**
	 * Routes the declarative add-menu selection to the page-owned side effect.
	 *
	 * @example
	 * handleAddSkillAction("folder");
	 */
	const handleAddSkillAction = (action: SkillAddAction) => {
		const actions: Record<SkillAddAction, () => void> = {
			folder: importSkillFolder,
			git: () => setIsGitImportOpen(true),
			platform: () => navigate("/skills/create-skill"),
		};

		actions[action]();
	};

	const tableStatus = pageError
		? importSkillMutation.error
			? "importFailed"
			: "loadFailed"
		: isLoading
			? "loading"
			: null;

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("skills.title")}
				</p>
				<p className="hidden font-mono text-caption-sm text-mute sm:block">
					{t("skills.path")}
				</p>
			</PageHeader>

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
					<SkillAddDropdown
						isDisabled={
							importSkillMutation.isPending || importGitSkillMutation.isPending
						}
						onAction={handleAddSkillAction}
					/>
				</div>

				<div className="flex items-start gap-sm">
					<Input
						aria-label={t("skills.searchPlaceholder")}
						className="mt-[18px] h-10 w-full max-w-130 rounded-md border border-hairline bg-surface-card px-[14px] text-body-sm text-ink outline-none placeholder:text-mute focus:border-hairline-strong focus-visible:ring-2 focus-visible:ring-focus-ring"
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder={t("skills.searchPlaceholder")}
						type="search"
						value={searchValue}
					/>
					<SkillFilterDropdown
						activeFilter={activeFilter}
						onAction={setActiveFilter}
					/>
				</div>

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

				<SkillLibraryTable
					isUpdatePending={updateGitSkillMutation.isPending}
					onManageSkill={setManagedSkill}
					onUpdateSkill={updateGitSkill}
					skills={visibleSkills}
					status={tableStatus}
				/>
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
			<ModalProvider
				description={t("skills.gitDialog.description")}
				footer={
					<>
						<Button
							onPress={() => setIsGitImportOpen(false)}
							variant="tertiary"
						>
							{t("common.cancel")}
						</Button>
						<Button
							isDisabled={!gitUrl.trim() || importGitSkillMutation.isPending}
							onPress={() => importSkillFromGit()}
							variant="primary"
						>
							{t("skills.gitDialog.import")}
						</Button>
					</>
				}
				isOpen={isGitImportOpen}
				onOpenChange={(isOpen) => {
					setIsGitImportOpen(isOpen);
					if (!isOpen) setGitUrl("");
				}}
				title={t("skills.gitDialog.title")}
			>
				<TextField className="flex flex-col gap-xs text-body-sm font-medium text-ink">
					<Label>{t("skills.gitDialog.urlLabel")}</Label>
					<Input
						className="rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
						onChange={(event) => setGitUrl(event.target.value)}
						placeholder="https://github.com/owner/skill.git"
						value={gitUrl}
					/>
				</TextField>
				{importGitSkillMutation.error ? (
					<p className="text-body-sm text-terminal-red" role="alert">
						{t("skills.gitDialog.failed")}
					</p>
				) : null}
			</ModalProvider>
		</main>
	);
};

export default SkillsPage;
