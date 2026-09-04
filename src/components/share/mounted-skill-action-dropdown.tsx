import { useState } from "react";
import { Ellipsis, TrashBin } from "@gravity-ui/icons";
import { Button, Toast } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { AlertDialog } from "@/components/ui/alert-dialog";
import type { DropdownMenuItemProps } from "@/components/ui/dropdown-menu";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { handleError } from "@/utils/error";
import { useUnmountWorkspaceSkill } from "@/queries/skill";

type MountedSkillActionDropdownProps = {
	/** Managed Skill mounted into the current Workspace. */
	skill: { folderName: string; id: string };
	/** Workspace owning the mount relationship. */
	workspace: { id: string; name: string };
};

type MountedSkillMenuAction = "unmount";

/**
 * Owns mounted Skill actions so the Workspace tree only renders navigation rows.
 *
 * @example
 * <MountedSkillActionDropdown skill={skill} workspace={workspace} />
 */
const MountedSkillActionDropdown = ({
	skill,
	workspace,
}: MountedSkillActionDropdownProps) => {
	const { t } = useTranslation();
	const [isUnmountOpen, setIsUnmountOpen] = useState(false);
	const unmountSkillMutation = useUnmountWorkspaceSkill();
	const menuItems: DropdownMenuItemProps<MountedSkillMenuAction>[] = [
		{
			icon: (
				<TrashBin aria-hidden="true" className="size-4 shrink-0 text-danger" />
			),
			id: "unmount",
			isDisabled: unmountSkillMutation.isPending,
			labelKey: "workspaceSidebar.unmountSkillFromWorkspace",
		},
	];

	/** Removes one Skill mount only from this Workspace. */
	const confirmUnmount = async () => {
		if (unmountSkillMutation.isPending) return;
		try {
			await unmountSkillMutation.mutateAsync({
				skillId: skill.id,
				workspaceId: workspace.id,
			});
			Toast.toast.success(
				t("workspaceSidebar.skillUnmount.success", {
					skill: skill.folderName,
					workspace: workspace.name,
				}),
			);
			setIsUnmountOpen(false);
		} catch (error) {
			handleError(
				error,
				"Workspace Skill unmount failed",
				true,
				t("workspaceSidebar.skillUnmount.failed"),
			);
		}
	};

	return (
		<>
			<DropdownMenu
				items={menuItems}
				onAction={() => setIsUnmountOpen(true)}
				placement="bottom end"
				trigger={
					<Button
						aria-label={t("workspaceSidebar.mountedSkillActions", {
							skill: skill.folderName,
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
				confirmText={t("workspaceSidebar.unmountSkillFromWorkspace")}
				description={t("workspaceSidebar.skillUnmount.description", {
					skill: skill.folderName,
					workspace: workspace.name,
				})}
				isConfirmDisabled={unmountSkillMutation.isPending}
				isOpen={isUnmountOpen}
				onConfirm={() => confirmUnmount()}
				onOpenChange={setIsUnmountOpen}
				title={t("workspaceSidebar.skillUnmount.title")}
			>
				{unmountSkillMutation.error ? (
					<p className="text-body-sm text-danger" role="alert">
						{t("workspaceSidebar.skillUnmount.failed")}
					</p>
				) : null}
			</AlertDialog>
		</>
	);
};

export type { MountedSkillActionDropdownProps };
export { MountedSkillActionDropdown };
