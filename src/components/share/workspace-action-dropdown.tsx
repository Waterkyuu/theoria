import {
	Archive,
	Ellipsis,
	PencilToSquare,
	Pin,
	TrashBin,
} from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

type WorkspaceActionDropdownProps = {
	/** Workspace name included in the menu trigger's accessible label. */
	workspaceName: string;
};

/**
 * Keeps workspace-specific actions outside the shell's navigation structure.
 *
 * @example
 * <WorkspaceActionDropdown workspaceName="agent-gauge" />
 */
const WorkspaceActionDropdown = ({
	workspaceName,
}: WorkspaceActionDropdownProps) => {
	const { t } = useTranslation();

	return (
		<DropdownMenu
			items={[
				{
					icon: <Pin aria-hidden="true" className="size-4 shrink-0 text-ink" />,
					id: "pin",
					labelKey: "workspaceSidebar.pinWorkspace",
				},
				{
					icon: (
						<PencilToSquare
							aria-hidden="true"
							className="size-4 shrink-0 text-ink"
						/>
					),
					id: "rename",
					labelKey: "workspaceSidebar.renameWorkspace",
				},
				{
					icon: (
						<Archive aria-hidden="true" className="size-4 shrink-0 text-ink" />
					),
					id: "archive",
					labelKey: "workspaceSidebar.archiveWorkspace",
				},
				{
					danger: true,
					icon: (
						<TrashBin
							aria-hidden="true"
							className="size-4 shrink-0 text-danger"
						/>
					),
					id: "remove",
					labelKey: "workspaceSidebar.removeWorkspace",
					separated: true,
				},
			]}
			placement="bottom end"
			trigger={
				<Button
					aria-label={t("workspaceSidebar.workspaceActions", {
						workspace: workspaceName,
					})}
					className="size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none transition-colors hover:bg-transparent hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
					isIconOnly
					size="sm"
					variant="ghost"
				>
					<Ellipsis aria-hidden="true" className="size-4" />
				</Button>
			}
		/>
	);
};

export { WorkspaceActionDropdown };
