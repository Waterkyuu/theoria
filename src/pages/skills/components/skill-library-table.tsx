import { useState } from "react";
import { Puzzle, TrashBin } from "@gravity-ui/icons";
import { Checkbox, Pagination, type Selection, Table } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AlertDialog } from "@/components/ui/alert-dialog";
import type { Skill } from "@/types/skill";

type SkillLibraryItem = Skill & {
	/** Number of persisted Workspace mount relationships. */
	mountedCount: number;
	/** Folder-backed name used as the primary row label. */
	name: string;
	/** Localized source type shown in the source column. */
	sourceLabel: string;
};

type SkillLibraryStatus = "importFailed" | "loadFailed" | "loading" | null;

type SkillLibraryTableProps = {
	/** Whether a Git-backed Skill update is currently pending. */
	isUpdatePending: boolean;
	/** Whether selected Skills are currently being removed. */
	isRemovePending: boolean;
	/** Opens Workspace mount management for the selected Skill. */
	onManageSkill: (skill: Skill) => void;
	/** Removes the selected managed Skills after confirmation. */
	onRemoveSkills: (skillIds: string[]) => void;
	/** Refreshes the selected Git-backed Skill from its saved remote. */
	onUpdateSkill: (skillId: string) => void;
	/** Localized and filtered records rendered in the table. */
	skills: SkillLibraryItem[];
	/** Current table-level loading or failure state. */
	status: SkillLibraryStatus;
};

const STATUS_TRANSLATION_KEYS = {
	importFailed: "skills.importFailed",
	loadFailed: "skills.loadFailed",
	loading: "skills.loading",
} as const;

/** Keeps the table scan-friendly and its page height predictable across the library. */
const ROWS_PER_PAGE = 8;

/**
 * Keeps eight-row pagination with the HeroUI table while the page retains data orchestration.
 *
 * @example
 * <SkillLibraryTable skills={skills} status={null} onManageSkill={manage} onRemoveSkills={remove} onUpdateSkill={update} isRemovePending={false} isUpdatePending={false} />
 */
const SkillLibraryTable = ({
	isRemovePending,
	isUpdatePending,
	onManageSkill,
	onRemoveSkills,
	onUpdateSkill,
	skills,
	status,
}: SkillLibraryTableProps) => {
	const { t } = useTranslation();
	const [isRemoveOpen, setIsRemoveOpen] = useState(false);
	const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
	const [page, setPage] = useState(1);
	const hasSelectedSkills =
		selectedKeys === "all" ? skills.length > 0 : selectedKeys.size > 0;
	const totalPages = Math.max(1, Math.ceil(skills.length / ROWS_PER_PAGE));
	// Filtering can shrink the result set while a later page is active, so render the nearest valid page immediately.
	const currentPage = Math.min(page, totalPages);
	const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
	// The rows and footer summary share this offset to keep the visible range consistent.
	const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
	const paginatedSkills = skills.slice(startIndex, startIndex + ROWS_PER_PAGE);
	const selectedSkillIds =
		selectedKeys === "all"
			? paginatedSkills.map((skill) => skill.id)
			: Array.from(selectedKeys, String);
	const rangeStart = startIndex + 1;
	const rangeEnd = Math.min(currentPage * ROWS_PER_PAGE, skills.length);

	/** Opens the required destructive-action confirmation without starting the request. */
	const requestSelectedSkillRemoval = () => setIsRemoveOpen(true);

	/** Starts removal only from the AlertDialog confirmation action. */
	const confirmSelectedSkillRemoval = () => {
		if (isRemovePending) return;
		onRemoveSkills(selectedSkillIds);
		setSelectedKeys(new Set());
	};

	return (
		<Table className="-mx-4 mt-[22px] sm:mx-0">
			<Table.ScrollContainer>
				<Table.Content
					aria-label={t("skills.libraryLabel")}
					className="min-w-195 table-fixed"
					onSelectionChange={setSelectedKeys}
					selectedKeys={selectedKeys}
					selectionMode="multiple"
				>
					<Table.Header>
						<Table.Column className="w-12">
							<Checkbox aria-label={t("skills.selectAll")} slot="selection">
								<Checkbox.Content>
									<Checkbox.Control>
										<Checkbox.Indicator />
									</Checkbox.Control>
								</Checkbox.Content>
							</Checkbox>
						</Table.Column>
						<Table.Column className="w-[55%]" isRowHeader>
							{t("skills.columns.skill")}
						</Table.Column>
						<Table.Column className="w-[16%]">
							{t("skills.columns.source")}
						</Table.Column>
						<Table.Column className="w-[21%]">
							{t("skills.columns.workspaces")}
						</Table.Column>
						<Table.Column
							aria-label={t("skills.columns.actions")}
							className="w-[13%]"
						>
							{hasSelectedSkills ? (
								<button
									aria-label={t("skills.deleteSelected")}
									className="ml-auto flex size-8 items-center justify-center rounded-md text-danger outline-none hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
									disabled={isRemovePending}
									onClick={requestSelectedSkillRemoval}
									type="button"
								>
									<TrashBin aria-hidden="true" className="size-4" />
								</button>
							) : null}
						</Table.Column>
					</Table.Header>
					<Table.Body>
						{paginatedSkills.map((skill) => (
							<Table.Row className="h-24" id={skill.id} key={skill.id}>
								<Table.Cell>
									<Checkbox
										aria-label={t("skills.selectNamed", { name: skill.name })}
										slot="selection"
									>
										<Checkbox.Content>
											<Checkbox.Control>
												<Checkbox.Indicator />
											</Checkbox.Control>
										</Checkbox.Content>
									</Checkbox>
								</Table.Cell>
								<Table.Cell>
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
								</Table.Cell>
								<Table.Cell className="text-body-sm text-charcoal">
									{skill.sourceLabel}
								</Table.Cell>
								<Table.Cell className="text-body-sm text-charcoal">
									{skill.mountedCount === 0
										? t("skills.notMounted")
										: t("skills.mountedCount", {
												count: skill.mountedCount,
											})}
								</Table.Cell>
								<Table.Cell className="text-right">
									<div className="flex justify-end gap-sm">
										{skill.sourceType === "git" ? (
											<button
												aria-label={t("skills.updateNamed", {
													name: skill.name,
												})}
												className="h-9 shrink-0 whitespace-nowrap rounded-md border border-hairline bg-surface-card px-md text-body-sm font-medium text-ink outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
												disabled={isUpdatePending}
												onClick={() => onUpdateSkill(skill.id)}
												type="button"
											>
												{t("skills.update")}
											</button>
										) : null}
										<button
											className="h-9 w-[94px] rounded-md border border-hairline bg-surface-card text-body-sm font-medium text-ink outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
											onClick={() => onManageSkill(skill)}
											type="button"
										>
											{t(
												skill.mountedCount > 0
													? "skills.manage"
													: "skills.mount",
											)}
										</button>
									</div>
								</Table.Cell>
							</Table.Row>
						))}
						{status ? (
							<Table.Row id="status">
								<Table.Cell
									className="h-24 text-center text-body-sm text-mute"
									colSpan={5}
								>
									<span role={status === "loading" ? "status" : "alert"}>
										{t(STATUS_TRANSLATION_KEYS[status])}
									</span>
								</Table.Cell>
							</Table.Row>
						) : null}
						{!status && skills.length === 0 ? (
							<Table.Row id="empty">
								<Table.Cell
									className="h-24 text-center text-body-sm text-mute"
									colSpan={5}
								>
									{t("skills.noResults")}
								</Table.Cell>
							</Table.Row>
						) : null}
					</Table.Body>
				</Table.Content>
			</Table.ScrollContainer>
			{!status && skills.length > ROWS_PER_PAGE ? (
				<Table.Footer className="py-xs">
					<Pagination aria-label={t("skills.pagination.label")} size="sm">
						<Pagination.Summary>
							{t("skills.pagination.summary", {
								end: rangeEnd,
								start: rangeStart,
								total: skills.length,
							})}
						</Pagination.Summary>
						<Pagination.Content>
							<Pagination.Item>
								<Pagination.Previous
									isDisabled={currentPage === 1}
									onPress={() => setPage((value) => Math.max(1, value - 1))}
								>
									<Pagination.PreviousIcon />
									{t("skills.pagination.previous")}
								</Pagination.Previous>
							</Pagination.Item>
							{pages.map((pageNumber) => (
								<Pagination.Item key={pageNumber}>
									<Pagination.Link
										isActive={pageNumber === currentPage}
										onPress={() => setPage(pageNumber)}
									>
										{pageNumber}
									</Pagination.Link>
								</Pagination.Item>
							))}
							<Pagination.Item>
								<Pagination.Next
									isDisabled={currentPage === totalPages}
									onPress={() =>
										setPage((value) => Math.min(totalPages, value + 1))
									}
								>
									{t("skills.pagination.next")}
									<Pagination.NextIcon />
								</Pagination.Next>
							</Pagination.Item>
						</Pagination.Content>
					</Pagination>
				</Table.Footer>
			) : null}
			<AlertDialog
				confirmText={t("skills.removeDialog.confirm")}
				description={t("skills.removeDialog.description", {
					count: selectedSkillIds.length,
				})}
				isConfirmDisabled={isRemovePending}
				isOpen={isRemoveOpen}
				onConfirm={confirmSelectedSkillRemoval}
				onOpenChange={setIsRemoveOpen}
				title={t("skills.removeDialog.title")}
			/>
		</Table>
	);
};

export type { SkillLibraryItem, SkillLibraryStatus };
export { SkillLibraryTable };
