import { useState } from "react";
import {
	Archive,
	Ellipsis,
	PencilToSquare,
	Pin,
	PinSlash,
	TrashBin,
} from "@gravity-ui/icons";
import { Button, Input, Label, TextField, Toast } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { handleError } from "@/utils/error";
import { useRemoveWorkspace, useSetWorkspacePin } from "@/queries/workspace";
import type { Workspace } from "@/types/workspace";

type WorkspaceActionDropdownProps = {
	/** Called after removal so active Workspace routes can leave safely. */
	onRemoved?: () => void;
	/** Persisted Workspace represented by the existing action menu. */
	workspace: Workspace;
};

/**
 * Keeps workspace-specific actions outside the shell's navigation structure.
 *
 * @example
 * <WorkspaceActionDropdown workspace={workspace} />
 */
const WorkspaceActionDropdown = ({
	onRemoved,
	workspace,
}: WorkspaceActionDropdownProps) => {
	const { t } = useTranslation();
	const [isRemoveOpen, setIsRemoveOpen] = useState(false);
	const [managedConfirmation, setManagedConfirmation] = useState("");
	const removeWorkspaceMutation = useRemoveWorkspace();
	const setWorkspacePinMutation = useSetWorkspacePin();
	const isPinned = workspace.pinnedAtMs !== null;
	const requiresManagedConfirmation = workspace.sourceKind === "managed";
	const isConfirmed =
		!requiresManagedConfirmation || managedConfirmation === workspace.name;

	/** Removes the Workspace collection after applying source-specific protection. */
	const confirmRemove = async () => {
		if (!isConfirmed || removeWorkspaceMutation.isPending) return;
		try {
			await removeWorkspaceMutation.mutateAsync({
				managedFilesConfirmed: requiresManagedConfirmation,
				workspaceId: workspace.id,
			});
			setIsRemoveOpen(false);
			setManagedConfirmation("");
			Toast.toast.success(
				t("workspaceSidebar.workspaceRemove.success", {
					workspace: workspace.name,
				}),
			);
			onRemoved?.();
		} catch (error) {
			handleError(error, "Workspace removal failed", true);
		}
	};

	/** Toggles persisted pin state so the refreshed sidebar receives database ordering. */
	const setPinState = async () => {
		if (setWorkspacePinMutation.isPending) return;
		try {
			await setWorkspacePinMutation.mutateAsync({
				isPinned: !isPinned,
				workspaceId: workspace.id,
			});
		} catch (error) {
			handleError(error, "Workspace pin update failed", true);
		}
	};

	return (
		<>
			<DropdownMenu
				items={[
					{
						icon: isPinned ? (
							<PinSlash
								aria-hidden="true"
								className="size-4 shrink-0 text-ink"
							/>
						) : (
							<Pin aria-hidden="true" className="size-4 shrink-0 text-ink" />
						),
						id: "pin",
						isDisabled: setWorkspacePinMutation.isPending,
						labelKey: isPinned
							? "workspaceSidebar.unpinWorkspace"
							: "workspaceSidebar.pinWorkspace",
						onAction: setPinState,
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
							<Archive
								aria-hidden="true"
								className="size-4 shrink-0 text-ink"
							/>
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
						onAction: () => setIsRemoveOpen(true),
						separated: true,
					},
				]}
				placement="bottom end"
				trigger={
					<Button
						aria-label={t("workspaceSidebar.workspaceActions", {
							workspace: workspace.name,
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
				confirmText={t("workspaceSidebar.workspaceRemove.confirm")}
				description={t(
					requiresManagedConfirmation
						? "workspaceSidebar.workspaceRemove.managedDescription"
						: "workspaceSidebar.workspaceRemove.externalDescription",
					{ workspace: workspace.name },
				)}
				isConfirmDisabled={!isConfirmed || removeWorkspaceMutation.isPending}
				isOpen={isRemoveOpen}
				onConfirm={() => confirmRemove()}
				onOpenChange={(isOpen) => {
					setIsRemoveOpen(isOpen);
					if (!isOpen) setManagedConfirmation("");
				}}
				title={t("workspaceSidebar.workspaceRemove.title")}
			>
				{requiresManagedConfirmation ? (
					<TextField className="flex flex-col gap-xs text-body-sm text-charcoal">
						<Label>
							{t("workspaceSidebar.workspaceRemove.confirmationLabel", {
								workspace: workspace.name,
							})}
						</Label>
						<Input
							className="h-10 rounded-md border border-hairline bg-surface-card px-md text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
							onChange={(event) => setManagedConfirmation(event.target.value)}
							value={managedConfirmation}
						/>
					</TextField>
				) : null}
				{removeWorkspaceMutation.error ? (
					<p className="text-body-sm text-danger" role="alert">
						{t("workspaceSidebar.workspaceRemove.failed")}
					</p>
				) : null}
			</AlertDialog>
		</>
	);
};

export { WorkspaceActionDropdown };
