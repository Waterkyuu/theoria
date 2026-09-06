import { CircleCheckFill, Puzzle, ShieldCheck } from "@gravity-ui/icons";
import { Dropdown, Header } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import type { Skill } from "@/types/skill";
import type { CreateTaskRequest } from "@/types/task";

type ComposerSkillDropdownProps = {
	/** Skills available in the library or mounted in the Workspace. */
	availableSkills: Skill[];
	/** Library skill IDs selected for the next Task. */
	selectedSkillIds: string[];
	/** Updates the Task selection while leaving the menu open for more choices. */
	onSelectionChange: (skillIds: string[]) => void;
	/** Mounted Workspace skills are visible but cannot be changed here. */
	workspaceSkillsLocked: boolean;
};

type ComposerPermissionDropdownProps = {
	/** Current file mutation policy for the next Task. */
	fileAccess: CreateTaskRequest["fileAccess"];
	/** Current command execution policy for the next Task. */
	commandExecution: CreateTaskRequest["commandExecution"];
	/** Updates file access independently of command execution. */
	onFileAccessChange: (access: CreateTaskRequest["fileAccess"]) => void;
	/** Updates command execution independently of file access. */
	onCommandExecutionChange: (
		permission: CreateTaskRequest["commandExecution"],
	) => void;
};

/**
 * Preserves the compact Skill picker while delegating focus and dismissal to Dropdown.
 * @example
 * <ComposerSkillDropdown availableSkills={skills} selectedSkillIds={ids} onSelectionChange={setIds} workspaceSkillsLocked={false} />
 */
const ComposerSkillDropdown = ({
	availableSkills,
	selectedSkillIds,
	onSelectionChange,
	workspaceSkillsLocked,
}: ComposerSkillDropdownProps) => {
	const { t } = useTranslation();
	return (
		<DropdownMenu
			trigger={
				<Dropdown.Trigger
					aria-label={t("workspace.mountedSkillCount", {
						count: workspaceSkillsLocked
							? availableSkills.length
							: selectedSkillIds.length,
					})}
					className="flex h-8 items-center gap-xs rounded-md px-sm text-caption-sm text-charcoal hover:bg-surface-soft"
					type="button"
				>
					<Puzzle aria-hidden="true" className="size-3.5" />
					<span>
						{workspaceSkillsLocked
							? availableSkills.length
							: selectedSkillIds.length}
					</span>
				</Dropdown.Trigger>
			}
			offset={8}
			placement="top start"
			className="w-64 max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-hairline bg-canvas p-sm shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
			aria-label={t("workspace.skillSelection")}
			menuClassName="max-h-64 overflow-y-auto p-0"
			selectionMode="multiple"
			selectedKeys={
				workspaceSkillsLocked
					? availableSkills.map((skill) => skill.id)
					: selectedSkillIds
			}
			onSelectionChange={(keys) => {
				if (!workspaceSkillsLocked)
					onSelectionChange(
						keys === "all"
							? availableSkills.map((skill) => skill.id)
							: Array.from(keys, String),
					);
			}}
			closeOnSelect={false}
		>
			{availableSkills.length > 0 ? (
				availableSkills.map((skill) => {
					const selected =
						workspaceSkillsLocked || selectedSkillIds.includes(skill.id);
					return (
						<Dropdown.Item
							id={skill.id}
							aria-label={skill.displayName}
							textValue={skill.displayName}
							className="flex h-18 w-full shrink-0 items-start gap-sm overflow-hidden rounded-md px-md py-sm text-left hover:bg-surface-soft disabled:cursor-default"
							isDisabled={workspaceSkillsLocked}
							key={skill.id}
						>
							<Puzzle aria-hidden="true" className="mt-xs size-4" />
							<span className="min-w-0 flex-1">
								<span className="block truncate text-body-sm font-medium">
									{skill.displayName}
								</span>
								<span className="line-clamp-2 text-caption-sm text-body">
									{skill.description}
								</span>
							</span>
							{selected ? (
								<CircleCheckFill aria-hidden="true" className="size-4" />
							) : null}
						</Dropdown.Item>
					);
				})
			) : (
				<Dropdown.Item
					id="empty"
					textValue={t("workspace.noSkills")}
					isDisabled
					className="px-md py-sm text-caption-sm text-mute"
				>
					{t("workspace.noSkills")}
				</Dropdown.Item>
			)}
		</DropdownMenu>
	);
};

/**
 * Keeps both permission groups in one anchored menu so users can configure a Task together.
 * @example
 * <ComposerPermissionDropdown fileAccess={access} commandExecution={execution} onFileAccessChange={setAccess} onCommandExecutionChange={setExecution} />
 */
const ComposerPermissionDropdown = ({
	fileAccess,
	commandExecution,
	onFileAccessChange,
	onCommandExecutionChange,
}: ComposerPermissionDropdownProps) => {
	const { t } = useTranslation();
	return (
		<div className="hidden min-[1040px]:block">
			<DropdownMenu
				trigger={
					<Dropdown.Trigger
						aria-label={t("workspace.permission")}
						className="flex h-8 items-center gap-xs rounded-md px-sm text-caption-sm text-body outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
						type="button"
					>
						<ShieldCheck aria-hidden="true" className="size-3.5" />
						{t(
							fileAccess === "allow_edits"
								? "workspace.permission"
								: "workspace.permissionReadOnly",
						)}
					</Dropdown.Trigger>
				}
				offset={8}
				placement="top end"
				className="w-64 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-hairline bg-canvas p-sm shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
				closeOnSelect={false}
				menuClassName="p-0"
				aria-label={t("workspace.permissionSelection")}
			>
				<Dropdown.Section selectionMode="single" selectedKeys={[fileAccess]}>
					<Header className="px-md pb-xs text-[11px] font-medium uppercase text-mute">
						{t("workspace.filePermission")}
					</Header>
					{(["read_only", "allow_edits"] as const).map((access) => (
						<Dropdown.Item
							aria-label={t(
								access === "read_only"
									? "workspace.permissionReadOnly"
									: "workspace.permissionAllowEdits",
							)}
							id={access}
							onAction={() => onFileAccessChange(access)}
							textValue={t(
								access === "read_only"
									? "workspace.permissionReadOnly"
									: "workspace.permissionAllowEdits",
							)}
							className="flex w-full items-center justify-between rounded-md px-md py-sm text-left text-body-sm hover:bg-surface-soft"
							key={access}
						>
							{t(
								access === "read_only"
									? "workspace.permissionReadOnly"
									: "workspace.permissionAllowEdits",
							)}
							{fileAccess === access ? (
								<CircleCheckFill aria-hidden="true" className="size-4" />
							) : null}
						</Dropdown.Item>
					))}
				</Dropdown.Section>
				<Dropdown.Section
					selectionMode="single"
					selectedKeys={[commandExecution]}
				>
					<Header className="mt-xs border-t border-hairline px-md pb-xs pt-sm text-[11px] font-medium uppercase text-mute">
						{t("workspace.commandPermission")}
					</Header>
					{(["deny", "ask", "allow"] as const).map((permission) => (
						<Dropdown.Item
							aria-label={t(`workspace.commandPermissionOption.${permission}`)}
							id={permission}
							onAction={() => onCommandExecutionChange(permission)}
							textValue={t(`workspace.commandPermissionOption.${permission}`)}
							className="flex w-full items-center justify-between rounded-md px-md py-sm text-left text-body-sm hover:bg-surface-soft"
							key={permission}
						>
							{t(`workspace.commandPermissionOption.${permission}`)}
							{commandExecution === permission ? (
								<CircleCheckFill aria-hidden="true" className="size-4" />
							) : null}
						</Dropdown.Item>
					))}
				</Dropdown.Section>
			</DropdownMenu>
		</div>
	);
};

export { ComposerPermissionDropdown, ComposerSkillDropdown };
