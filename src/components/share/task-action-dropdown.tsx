import { Ellipsis, PencilToSquare, TrashBin } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

type TaskActionDropdownProps = {
	/** Task name included in the menu trigger's accessible label. */
	taskName: string;
};

/**
 * Owns task-only menu actions so the shell stays focused on navigation layout.
 *
 * @example
 * <TaskActionDropdown taskName="Current task" />
 */
const TaskActionDropdown = ({ taskName }: TaskActionDropdownProps) => {
	const { t } = useTranslation();

	return (
		<DropdownMenu
			items={[
				{
					icon: (
						<PencilToSquare
							aria-hidden="true"
							className="size-4 shrink-0 text-ink"
						/>
					),
					id: "rename",
					labelKey: "workspaceSidebar.renameConversation",
				},
				{
					danger: true,
					icon: (
						<TrashBin
							aria-hidden="true"
							className="size-4 shrink-0 text-danger"
						/>
					),
					id: "delete",
					labelKey: "workspaceSidebar.deleteConversation",
					separated: true,
				},
			]}
			placement="bottom end"
			trigger={
				<Button
					aria-label={t("workspaceSidebar.mockConversationActions", {
						conversation: taskName,
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

export { TaskActionDropdown };
