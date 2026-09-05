import { BarsDescendingAlignCenter, Check } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

const SKILL_SOURCE_FILTERS = ["git", "platform", "local_folder"] as const;
const SKILL_FILTERS = ["all", "mounted", ...SKILL_SOURCE_FILTERS] as const;
const SKILL_ADD_ITEMS = [
	{
		id: "platform",
		labelKey: "skills.addMenu.platform",
		children: [
			{ id: "platform", labelKey: "skills.addMenu.simple" },
			{ id: "editor", labelKey: "skills.addMenu.editor" },
		],
	},
	{ id: "folder", labelKey: "skills.addMenu.folder" },
	{ id: "git", labelKey: "skills.addMenu.git" },
] as const;

type SkillAddAction = (typeof SKILL_ADD_ITEMS)[number]["id"] | "editor";
type SkillSourceFilter = (typeof SKILL_SOURCE_FILTERS)[number];
type SkillFilter = (typeof SKILL_FILTERS)[number];

type SkillAddDropdownProps = {
	/** Whether imports are pending and the add menu trigger must be disabled. */
	isDisabled: boolean;
	/** Receives the selected creation method for centralized page-level dispatch. */
	onAction: (action: SkillAddAction) => void;
};

type SkillFilterDropdownProps = {
	/** Currently active library filter, used to mark the selected source. */
	activeFilter: SkillFilter;
	/** Applies the selected source filter to the library. */
	onAction: (filter: SkillSourceFilter) => void;
};

/**
 * Keeps add-menu items declarative while the page owns navigation and import effects.
 *
 * @example
 * <SkillAddDropdown isDisabled={false} onAction={handleAddAction} />
 */
const SkillAddDropdown = ({ isDisabled, onAction }: SkillAddDropdownProps) => {
	const { t } = useTranslation();

	return (
		<DropdownMenu
			headerKey="skills.addMenu.title"
			items={SKILL_ADD_ITEMS}
			onAction={onAction}
			placement="bottom end"
			trigger={
				<Button
					className="h-9 w-full shrink-0 rounded-md bg-surface-dark px-lg text-body-sm font-medium text-on-dark outline-none hover:bg-ink-deep focus-visible:ring-2 focus-visible:ring-focus-ring sm:w-auto sm:min-w-34"
					isDisabled={isDisabled}
				>
					{t("skills.addSkill")}
				</Button>
			}
		/>
	);
};

/**
 * Renders the compact source picker and reports one exact source to the page.
 *
 * @example
 * <SkillFilterDropdown activeFilter="all" onAction={setFilter} />
 */
const SkillFilterDropdown = ({
	activeFilter,
	onAction,
}: SkillFilterDropdownProps) => {
	const { t } = useTranslation();

	return (
		<DropdownMenu
			headerKey="skills.filterMenu.title"
			itemClassName="min-w-40"
			items={SKILL_SOURCE_FILTERS.map((filter) => ({
				icon: (
					<Check
						aria-hidden="true"
						className={cn("size-4", activeFilter !== filter && "invisible")}
					/>
				),
				id: filter,
				labelKey: `skills.filters.${filter}`,
			}))}
			onAction={onAction}
			placement="bottom end"
			trigger={
				<Button
					aria-label={t("skills.filterMenu.title")}
					className="mt-[18px] size-10 min-w-10 shrink-0 cursor-pointer rounded-md border border-hairline bg-surface-card p-0 text-charcoal shadow-none outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
					isIconOnly
					size="sm"
					variant="ghost"
				>
					<BarsDescendingAlignCenter aria-hidden="true" className="size-4" />
				</Button>
			}
		/>
	);
};

export type { SkillAddAction, SkillFilter, SkillSourceFilter };
export { SKILL_FILTERS, SkillAddDropdown, SkillFilterDropdown };
