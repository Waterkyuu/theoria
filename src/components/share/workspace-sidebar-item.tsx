import { useState } from "react";
import {
	Ellipsis,
	Folder,
	LayoutColumns3,
	Plus,
	Puzzle,
	TargetDart,
	TrashBin,
} from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { TaskActionDropdown } from "@/components/share/task-action-dropdown";
import { WorkspaceActionDropdown } from "@/components/share/workspace-action-dropdown";
import type { DropdownMenuItemProps } from "@/components/ui/dropdown-menu";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { handleError } from "@/utils/error";
import { useUnmountWorkspaceSkill, useWorkspaceSkills } from "@/queries/skill";
import { useTasks } from "@/queries/task";
import type { Workspace } from "@/types/workspace";

type WorkspaceSidebarItemProps = {
	/** Active path used for the existing workspace selection treatment. */
	currentPath: string;
	/** Navigates without reloading the desktop shell. */
	onNavigate: (path: string) => void;
	/** Persisted Workspace rendered with the original Figma tree structure. */
	workspace: Workspace;
};

type MountedSkillMenuAction = "unmount";

/**
 * Connects one persisted Workspace to the existing expandable sidebar tree.
 *
 * @example
 * <WorkspaceSidebarItem currentPath="/task" onNavigate={navigate} workspace={workspace} />
 */
const WorkspaceSidebarItem = ({
	currentPath,
	onNavigate,
	workspace,
}: WorkspaceSidebarItemProps) => {
	const { t } = useTranslation();
	const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(true);
	const [isConversationsExpanded, setIsConversationsExpanded] = useState(true);
	const [isBenchmarksExpanded, setIsBenchmarksExpanded] = useState(false);
	const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
	const tasksQuery = useTasks(workspace.id);
	const skillsQuery = useWorkspaceSkills(workspace.id);
	const unmountSkillMutation = useUnmountWorkspaceSkill();
	const tasks = tasksQuery.data ?? [];
	const mountedSkillCount = skillsQuery.data?.length ?? 0;
	const workspacePath = `/workspaces/${encodeURIComponent(workspace.id)}`;
	const isWorkspaceSelected = currentPath.startsWith(workspacePath);
	const mountedSkillMenuItems: DropdownMenuItemProps<MountedSkillMenuAction>[] =
		[
			{
				icon: (
					<TrashBin
						aria-hidden="true"
						className="size-4 shrink-0 text-danger"
					/>
				),
				id: "unmount",
				isDisabled: unmountSkillMutation.isPending,
				labelKey: "workspaceSidebar.unmountSkillFromWorkspace",
			},
		];

	/** Removes one Skill mount only from this Workspace. */
	const removeMountedSkill = async (skillId: string) => {
		if (unmountSkillMutation.isPending) return;
		try {
			await unmountSkillMutation.mutateAsync({
				skillId,
				workspaceId: workspace.id,
			});
		} catch (error) {
			handleError(error, "Workspace Skill unmount failed", true);
		}
	};

	return (
		<div
			aria-expanded={isWorkspaceExpanded}
			aria-label={workspace.name}
			aria-level={1}
			aria-selected={isWorkspaceSelected}
			className="flex flex-col gap-xxs"
			role="treeitem"
			tabIndex={-1}
		>
			<div
				className={cn(
					"group flex h-8 w-full items-center rounded-md text-body-sm font-medium hover:bg-hairline",
					isWorkspaceSelected && "bg-hairline",
				)}
			>
				<button
					aria-label={t(
						isWorkspaceExpanded
							? "workspaceSidebar.collapseWorkspace"
							: "workspaceSidebar.expandWorkspace",
						{ workspace: workspace.name },
					)}
					className="flex h-full min-w-0 flex-1 items-center gap-sm rounded-md px-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
					onClick={() => {
						if (isWorkspaceSelected) {
							setIsWorkspaceExpanded((expanded) => !expanded);
							return;
						}
						setIsWorkspaceExpanded(true);
						onNavigate(workspacePath);
					}}
					type="button"
				>
					<Folder aria-hidden="true" className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate">{workspace.name}</span>
				</button>
				<div className="flex shrink-0 items-center gap-sm pr-sm text-mute opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
					<button
						aria-label={`${workspace.name} ${t("navigation.newTask")}`}
						className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => onNavigate(workspacePath)}
						type="button"
					>
						<Plus
							aria-hidden="true"
							className="size-4 shrink-0 transition-colors hover:text-ink"
						/>
					</button>
					<WorkspaceActionDropdown
						onRemoved={() => {
							if (currentPath.startsWith(workspacePath)) onNavigate("/task");
						}}
						workspace={workspace}
					/>
				</div>
			</div>

			{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use group to own child treeitems. */}
			<div
				aria-hidden={!isWorkspaceExpanded}
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
					isWorkspaceExpanded
						? "grid-rows-[1fr] opacity-100"
						: "pointer-events-none grid-rows-[0fr] opacity-0",
				)}
				inert={!isWorkspaceExpanded}
				role="group"
			>
				<div className="min-h-0 overflow-hidden">
					<div
						aria-expanded={isConversationsExpanded}
						aria-label={`${t("workspaceSidebar.conversationsLabel")} ${tasks.length}`}
						aria-level={2}
						className="flex flex-col"
						role="treeitem"
						tabIndex={-1}
					>
						<button
							className="flex h-8 w-full items-center gap-sm rounded-md pl-xl pr-sm text-left text-body-sm outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() =>
								setIsConversationsExpanded((expanded) => !expanded)
							}
							type="button"
						>
							<TargetDart aria-hidden="true" className="size-4 shrink-0" />
							<span className="min-w-0 flex-1 truncate">
								{t("workspaceSidebar.conversationsLabel")}
							</span>
							<span className="text-caption-sm tabular-nums text-mute">
								{tasksQuery.isLoading ? (
									<span
										aria-hidden="true"
										className="block h-3 w-3 animate-pulse rounded-sm bg-hairline-strong motion-reduce:animate-none"
									/>
								) : (
									tasks.length
								)}
							</span>
						</button>

						{isConversationsExpanded ? (
							tasksQuery.isLoading ? (
								<div
									aria-label={t("loadingPage")}
									className="space-y-xs py-xs pl-12"
									role="status"
								>
									<div className="h-8 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
									<div className="h-8 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
								</div>
							) : (
								tasks.map((task) => (
									<div
										aria-label={task.title}
										aria-level={3}
										className={cn(
											"group mt-xs flex h-8 items-center gap-[7px] rounded-md pl-12 pr-[6px] text-body-sm font-medium hover:bg-hairline",
											currentPath === `${workspacePath}/task/${task.id}` &&
												"bg-hairline",
										)}
										key={task.id}
										role="treeitem"
										tabIndex={-1}
									>
										<button
											className="min-w-0 flex-1 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
											onClick={() =>
												onNavigate(
													`${workspacePath}/task/${encodeURIComponent(task.id)}`,
												)
											}
											type="button"
										>
											{task.title}
										</button>
										<div className="flex shrink-0 items-center gap-sm text-mute opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
											<TaskActionDropdown
												onDeleted={() => {
													if (
														currentPath === `${workspacePath}/task/${task.id}`
													) {
														onNavigate(workspacePath);
													}
												}}
												pinnedAtMs={task.pinnedAtMs}
												taskId={task.id}
												taskName={task.title}
											/>
										</div>
									</div>
								))
							)
						) : null}
					</div>

					<div
						aria-expanded={isBenchmarksExpanded}
						aria-level={2}
						role="treeitem"
						tabIndex={-1}
					>
						<button
							className="flex h-8 w-full items-center gap-sm rounded-md pl-xl pr-sm text-left text-body-sm outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() => setIsBenchmarksExpanded((expanded) => !expanded)}
							type="button"
						>
							<LayoutColumns3 aria-hidden="true" className="size-4 shrink-0" />
							<span className="min-w-0 flex-1 truncate">
								{t("workspaceSidebar.benchmarks")}
							</span>
							<span className="text-caption-sm tabular-nums text-mute">0</span>
						</button>
					</div>

					<div
						aria-expanded={isSkillsExpanded}
						aria-level={2}
						className="mt-xxs"
						role="treeitem"
						tabIndex={-1}
					>
						<button
							className="flex h-8 w-full items-center gap-sm rounded-md pl-xl pr-sm text-left text-body-sm outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() => setIsSkillsExpanded((expanded) => !expanded)}
							type="button"
						>
							<Puzzle aria-hidden="true" className="size-4 shrink-0" />
							<span className="min-w-0 flex-1 truncate">
								{t("workspaceSidebar.mountedSkills")}
							</span>
							<span className="text-caption-sm tabular-nums text-mute">
								{skillsQuery.isLoading ? (
									<span
										aria-hidden="true"
										className="block h-3 w-3 animate-pulse rounded-sm bg-hairline-strong motion-reduce:animate-none"
									/>
								) : (
									mountedSkillCount
								)}
							</span>
						</button>
						{isSkillsExpanded ? (
							skillsQuery.isLoading ? (
								<div
									aria-label={t("loadingPage")}
									className="space-y-xs py-xs pl-12"
									role="status"
								>
									<div className="h-8 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
									<div className="h-8 animate-pulse rounded-md bg-hairline motion-reduce:animate-none" />
								</div>
							) : (
								(skillsQuery.data ?? []).map((skill) => (
									<div
										aria-label={skill.folderName}
										aria-level={3}
										className="group mt-xs flex h-8 items-center gap-[7px] rounded-md pl-12 pr-[6px] text-body-sm font-medium hover:bg-hairline"
										key={skill.id}
										role="treeitem"
										tabIndex={-1}
									>
										<span className="min-w-0 flex-1 truncate text-left">
											{skill.folderName}
										</span>
										<div className="flex shrink-0 items-center gap-sm text-mute opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
											<DropdownMenu
												items={mountedSkillMenuItems}
												onAction={() => removeMountedSkill(skill.id)}
												placement="bottom end"
												trigger={
													<Button
														aria-label={t(
															"workspaceSidebar.mountedSkillActions",
															{ skill: skill.folderName },
														)}
														className="size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none transition-colors hover:bg-transparent hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
														isIconOnly
														size="sm"
														variant="ghost"
													>
														<Ellipsis aria-hidden="true" className="size-4" />
													</Button>
												}
											/>
										</div>
									</div>
								))
							)
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
};

export { WorkspaceSidebarItem };
