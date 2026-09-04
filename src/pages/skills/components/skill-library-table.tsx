import { useState } from "react";
import { Puzzle, TrashBin } from "@gravity-ui/icons";
import { Checkbox, type Selection, Table } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { Skill } from "@/types/skill";

type SkillLibraryItem = Skill & {
	/** Localized access policy shown in the permission column. */
	accessLabel: string;
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
	/** Opens Workspace mount management for the selected Skill. */
	onManageSkill: (skill: Skill) => void;
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

/**
 * Owns the Skill Library's HeroUI table markup while the page retains data orchestration.
 *
 * @example
 * <SkillLibraryTable skills={skills} status={null} onManageSkill={manage} onUpdateSkill={update} isUpdatePending={false} />
 */
const SkillLibraryTable = ({
	isUpdatePending,
	onManageSkill,
	onUpdateSkill,
	skills,
	status,
}: SkillLibraryTableProps) => {
	const { t } = useTranslation();
	const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
	const hasSelectedSkills =
		selectedKeys === "all" ? skills.length > 0 : selectedKeys.size > 0;

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
						<Table.Column className="w-[48%]" isRowHeader>
							{t("skills.columns.skill")}
						</Table.Column>
						<Table.Column className="w-[16%]">
							{t("skills.columns.source")}
						</Table.Column>
						<Table.Column className="w-[18%]">
							{t("skills.columns.workspaces")}
						</Table.Column>
						<Table.Column className="w-[10%]">
							{t("skills.columns.access")}
						</Table.Column>
						<Table.Column
							aria-label={t("skills.columns.actions")}
							className="w-[13%]"
						>
							{hasSelectedSkills ? (
								<button
									aria-label={t("skills.deleteSelected")}
									className="ml-auto flex size-8 items-center justify-center rounded-md text-danger outline-none hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
									type="button"
								>
									<TrashBin aria-hidden="true" className="size-4" />
								</button>
							) : null}
						</Table.Column>
					</Table.Header>
					<Table.Body>
						{skills.map((skill) => (
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
								<Table.Cell className="text-body-sm text-charcoal">
									{skill.accessLabel}
								</Table.Cell>
								<Table.Cell className="text-right">
									<div className="flex justify-end gap-sm">
										{skill.sourceType === "git" ? (
											<button
												aria-label={t("skills.updateNamed", {
													name: skill.name,
												})}
												className="h-9 rounded-md border border-hairline bg-surface-card px-md text-body-sm font-medium text-ink outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
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
									colSpan={6}
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
									colSpan={6}
								>
									{t("skills.noResults")}
								</Table.Cell>
							</Table.Row>
						) : null}
					</Table.Body>
				</Table.Content>
			</Table.ScrollContainer>
		</Table>
	);
};

export type { SkillLibraryItem, SkillLibraryStatus };
export { SkillLibraryTable };
