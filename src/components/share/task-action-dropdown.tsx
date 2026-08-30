import { useState } from "react";
import { Ellipsis, PencilToSquare, TrashBin } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { handleError } from "@/utils/error";
import { useDeleteTask } from "@/queries/task";

type TaskActionDropdownProps = {
	/** Called after deletion so an active route can return to its Composer. */
	onDeleted?: () => void;
	/** Stable Task identifier removed with its owned run files. */
	taskId: string;
	/** Task name included in the menu trigger's accessible label. */
	taskName: string;
};

/**
 * Owns task-only menu actions so the shell stays focused on navigation layout.
 *
 * @example
 * <TaskActionDropdown taskId="task-1" taskName="Current task" />
 */
const TaskActionDropdown = ({
	onDeleted,
	taskId,
	taskName,
}: TaskActionDropdownProps) => {
	const { t } = useTranslation();
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const deleteTaskMutation = useDeleteTask();

	/** Removes Task persistence and owned run files after explicit confirmation. */
	const confirmDelete = async () => {
		if (deleteTaskMutation.isPending) return;
		try {
			await deleteTaskMutation.mutateAsync(taskId);
			setIsDeleteOpen(false);
			onDeleted?.();
		} catch (error) {
			handleError(error, "Task deletion failed");
		}
	};

	return (
		<>
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
						onAction: () => setIsDeleteOpen(true),
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
			<AlertDialog
				confirmText={t("workspaceSidebar.taskDelete.confirm")}
				description={t("workspaceSidebar.taskDelete.description", {
					task: taskName,
				})}
				isConfirmDisabled={deleteTaskMutation.isPending}
				isOpen={isDeleteOpen}
				onConfirm={() => confirmDelete()}
				onOpenChange={setIsDeleteOpen}
				title={t("workspaceSidebar.taskDelete.title")}
			>
				{deleteTaskMutation.error ? (
					<p className="text-body-sm text-danger" role="alert">
						{t("workspaceSidebar.taskDelete.failed")}
					</p>
				) : null}
			</AlertDialog>
		</>
	);
};

export { TaskActionDropdown };
