import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { CheckBox } from "@/components/ui/check-box";
import { ModalProvider } from "@/components/ui/modal-provider";
import { handleError } from "@/utils/error";
import {
	useMountWorkspaceSkill,
	useUnmountWorkspaceSkill,
	useWorkspaceSkills,
} from "@/queries/skill";
import { useWorkspaces } from "@/queries/workspace";
import type { Skill } from "@/types/skill";
import type { Workspace } from "@/types/workspace";

type WorkspaceMountModalProps = {
	/** Whether the mount manager is visible. */
	isOpen: boolean;
	/** Controls the parent-owned modal state. */
	onOpenChange: (isOpen: boolean) => void;
	/** Managed Skill whose future Workspace mounts are edited. */
	skill: Skill;
};

type WorkspaceMountRowProps = {
	/** Managed Skill whose relationship is edited. */
	skillId: string;
	/** Persisted Workspace rendered as one mount option. */
	workspace: Workspace;
};

/** Renders one independently loaded Workspace mount relationship. */
const WorkspaceMountRow = ({ skillId, workspace }: WorkspaceMountRowProps) => {
	const { t } = useTranslation();
	const workspaceSkillsQuery = useWorkspaceSkills(workspace.id);
	const mountMutation = useMountWorkspaceSkill();
	const unmountMutation = useUnmountWorkspaceSkill();
	const isMounted =
		workspaceSkillsQuery.data?.some((skill) => skill.id === skillId) ?? false;
	const isPending = mountMutation.isPending || unmountMutation.isPending;

	/** Persists the selected relationship without changing existing Task snapshots. */
	const updateMount = async (shouldMount: boolean) => {
		if (isPending) return;
		try {
			const input = { skillId, workspaceId: workspace.id };
			if (shouldMount) await mountMutation.mutateAsync(input);
			else await unmountMutation.mutateAsync(input);
		} catch (error) {
			handleError(error, "Workspace Skill mount update failed", true);
		}
	};

	return (
		<div className="flex min-h-12 items-center rounded-md border border-hairline bg-surface-card px-md">
			{workspaceSkillsQuery.isLoading ? (
				<div
					aria-label={t("skills.mountDialog.loading")}
					className="h-4 w-full animate-pulse rounded bg-hairline motion-reduce:animate-none"
					role="status"
				/>
			) : workspaceSkillsQuery.error ? (
				<p className="text-body-sm text-danger" role="alert">
					{t("skills.mountDialog.loadFailed", { workspace: workspace.name })}
				</p>
			) : (
				<CheckBox
					className="w-full"
					isDisabled={isPending}
					isSelected={isMounted}
					label={
						<span className="flex min-w-0 flex-1 items-center justify-between gap-md">
							<span className="truncate text-body-sm font-medium text-ink">
								{workspace.name}
							</span>
							<span
								aria-hidden="true"
								className="shrink-0 text-caption-sm text-mute"
							>
								{t(`workspaceSidebar.workspaceSource.${workspace.sourceKind}`)}
							</span>
						</span>
					}
					onChange={(selected) => updateMount(selected)}
				/>
			)}
		</div>
	);
};

/** Manages the selected Skill across persisted Workspaces in a small modal. */
const WorkspaceMountModal = ({
	isOpen,
	onOpenChange,
	skill,
}: WorkspaceMountModalProps) => {
	const { t } = useTranslation();
	const workspacesQuery = useWorkspaces();

	return (
		<ModalProvider
			description={t("skills.mountDialog.description", {
				skill: skill.folderName,
			})}
			footer={
				<Button onPress={() => onOpenChange(false)} variant="primary">
					{t("common.done")}
				</Button>
			}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			title={t("skills.mountDialog.title")}
		>
			<div className="flex max-h-80 flex-col gap-sm overflow-y-auto py-xs">
				{workspacesQuery.isLoading ? (
					<>
						<div className="h-12 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
						<div className="h-12 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
					</>
				) : workspacesQuery.error ? (
					<p className="text-body-sm text-danger" role="alert">
						{t("skills.mountDialog.workspacesFailed")}
					</p>
				) : workspacesQuery.data?.length ? (
					workspacesQuery.data.map((workspace) => (
						<WorkspaceMountRow
							key={workspace.id}
							skillId={skill.id}
							workspace={workspace}
						/>
					))
				) : (
					<p className="py-lg text-center text-body-sm text-mute">
						{t("skills.mountDialog.empty")}
					</p>
				)}
			</div>
		</ModalProvider>
	);
};

export { WorkspaceMountModal };
