import { useState } from "react";
import {
	Ellipsis,
	PencilToSquare,
	Pin,
	PinFill,
	PinSlash,
	TrashBin,
} from "@gravity-ui/icons";
import { Button, Toast } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { RenameModal } from "@/components/share/rename-modal";
import { AlertDialog } from "@/components/ui/alert-dialog";
import type { DropdownMenuItemProps } from "@/components/ui/dropdown-menu";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { handleError } from "@/utils/error";
import { useDeleteTask, useRenameTask, useSetTaskPin } from "@/queries/task";

type TaskActionDropdownProps = {
	/** Called after deletion so an active route can return to its Composer. */
	onDeleted?: () => void;
	/** Present only for global Recent Tasks that support pinning. */
	pinnedAtMs?: number | null;
	/** Stable Task identifier removed with its owned run files. */
	taskId: string;
	/** Task name included in the menu trigger's accessible label. */
	taskName: string;
};

type TaskMenuAction = "delete" | "pin" | "rename";

/**
 * Owns task-only menu actions so the shell stays focused on navigation layout.
 *
 * @example
 * <TaskActionDropdown taskId="task-1" taskName="Current task" />
 */
const TaskActionDropdown = ({
	onDeleted,
	pinnedAtMs,
	taskId,
	taskName,
}: TaskActionDropdownProps) => {
	const { t } = useTranslation();
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isRenameOpen, setIsRenameOpen] = useState(false);
	const deleteTaskMutation = useDeleteTask();
	const renameTaskMutation = useRenameTask();
	const setTaskPinMutation = useSetTaskPin();
	const supportsPinning = pinnedAtMs !== undefined;
	const isPinned = pinnedAtMs !== null && pinnedAtMs !== undefined;

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

	/** Persists the modal value and keeps it open when the request fails. */
	const renameTask = async (title: string) => {
		try {
			await renameTaskMutation.mutateAsync({ taskId, title });
			Toast.toast.success(t("workspaceSidebar.taskRename.success", { title }));
			return true;
		} catch (error) {
			handleError(error, "Task rename failed", true);
			return false;
		}
	};

	/** Toggles persisted pin state for global Recent Tasks only. */
	const setPinState = async () => {
		if (!supportsPinning || setTaskPinMutation.isPending) return;
		try {
			await setTaskPinMutation.mutateAsync({ isPinned: !isPinned, taskId });
		} catch (error) {
			handleError(error, "Task pin update failed", true);
		}
	};

	/**
	 * Dispatches one menu identifier without coupling callbacks to item metadata.
	 *
	 * @example
	 * handleMenuAction("rename");
	 */
	const handleMenuAction = (action: TaskMenuAction) => {
		const actions: Record<TaskMenuAction, () => void> = {
			delete: () => setIsDeleteOpen(true),
			pin: setPinState,
			rename: () => setIsRenameOpen(true),
		};

		actions[action]();
	};
	const menuItems: DropdownMenuItemProps<TaskMenuAction>[] = [
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
				<TrashBin aria-hidden="true" className="size-4 shrink-0 text-danger" />
			),
			id: "delete",
			labelKey: "workspaceSidebar.deleteConversation",
			separated: true,
		},
	];

	if (supportsPinning) {
		menuItems.unshift({
			icon: isPinned ? (
				<PinSlash aria-hidden="true" className="size-4 shrink-0 text-ink" />
			) : (
				<Pin aria-hidden="true" className="size-4 shrink-0 text-ink" />
			),
			id: "pin",
			isDisabled: setTaskPinMutation.isPending,
			labelKey: isPinned
				? "workspaceSidebar.unpinTask"
				: "workspaceSidebar.pinTask",
		});
	}

	return (
		<>
			{supportsPinning ? (
				<Button
					aria-label={t(
						isPinned
							? "workspaceSidebar.unpinTask"
							: "workspaceSidebar.pinTask",
					)}
					className="size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none transition-colors hover:bg-transparent hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
					isDisabled={setTaskPinMutation.isPending}
					isIconOnly
					onPress={() => setPinState()}
					size="sm"
					variant="ghost"
				>
					{isPinned ? (
						<PinFill aria-hidden="true" className="size-4" />
					) : (
						<Pin aria-hidden="true" className="size-4" />
					)}
				</Button>
			) : null}
			<DropdownMenu
				items={menuItems}
				onAction={handleMenuAction}
				placement="bottom end"
				trigger={
					<Button
						aria-label={t("workspaceSidebar.mockConversationActions", {
							conversation: taskName,
						})}
						className={cn(
							"size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none transition-colors hover:bg-transparent hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
							supportsPinning &&
								isPinned &&
								"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
						)}
						isIconOnly
						size="sm"
						variant="ghost"
					>
						<Ellipsis aria-hidden="true" className="size-4" />
					</Button>
				}
			/>
			<RenameModal
				cancelText={t("common.cancel")}
				description={t("workspaceSidebar.taskRename.description", {
					task: taskName,
				})}
				initialName={taskName}
				isOpen={isRenameOpen}
				isPending={renameTaskMutation.isPending}
				label={t("workspaceSidebar.taskRename.label")}
				onOpenChange={setIsRenameOpen}
				onRename={renameTask}
				saveText={t("workspaceSidebar.taskRename.save")}
				title={t("workspaceSidebar.taskRename.title")}
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
