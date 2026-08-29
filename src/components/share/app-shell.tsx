import { lazy, type ReactNode, Suspense, useState } from "react";
import {
	ChevronDown,
	ChevronRight,
	Comments,
	Ellipsis,
	Folder,
	Folders,
	LayoutColumns3,
	PencilToSquare,
	Pin,
	Puzzle,
	TrashBin,
} from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

type AppShellProps = {
	/** Active browser path used to highlight the current navigation item. */
	currentPath: string;
	/** Page content rendered inside the shared workspace. */
	children: ReactNode;
	/** Changes the active application route without reloading the page. */
	onNavigate: (path: string) => void;
};

const NAVIGATION_ITEMS = [
	{ path: "/", labelKey: "navigation.workspaces", icon: Folders },
	{ path: "/skills", labelKey: "navigation.skills", icon: Puzzle },
	{ path: "/runs", labelKey: "navigation.runs", icon: LayoutColumns3 },
] as const;

const NewWorkspaceModal = lazy(() => import("./new-workspace-modal"));

/**
 * Reproduces the Figma sidebar alignment while keeping route and tree interactions local.
 *
 * @example
 * <AppShell currentPath="/" onNavigate={navigateTo}><main /></AppShell>
 */
const AppShell = ({ currentPath, children, onNavigate }: AppShellProps) => {
	const { t } = useTranslation();
	const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(true);
	const [isConversationsExpanded, setIsConversationsExpanded] = useState(true);
	const [isBenchmarksExpanded, setIsBenchmarksExpanded] = useState(false);
	const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
	const [isNewWorkspaceOpen, setIsNewWorkspaceOpen] = useState(false);

	return (
		<div className="flex min-h-[100dvh] bg-canvas text-ink">
			<aside
				aria-label={t("workspaceSidebar.label")}
				className="sticky top-0 flex h-[100dvh] w-[287px] min-w-[287px] flex-col overflow-hidden border-r border-hairline bg-surface-soft max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:z-50 max-md:h-16 max-md:w-full max-md:min-w-0 max-md:border-r-0 max-md:border-t"
			>
				<header className="flex h-14 shrink-0 items-center px-xl max-md:hidden">
					<button
						aria-label={t("appName")}
						className="translate-y-2 rounded-md font-primary text-heading-md font-semibold leading-6 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => onNavigate("/")}
						type="button"
					>
						{t("appName")}
					</button>
				</header>

				<nav
					aria-label={t("mainNavigation")}
					className="mt-[7px] flex h-[113px] shrink-0 flex-col gap-xs px-[15px] max-md:mt-0 max-md:h-16 max-md:flex-row max-md:gap-1 max-md:px-2 max-md:py-1"
				>
					{NAVIGATION_ITEMS.map((item) => {
						const ItemIcon = item.icon;
						const isActive =
							item.path === "/"
								? currentPath === "/"
								: currentPath.startsWith(item.path);

						return (
							<button
								aria-current={isActive ? "page" : undefined}
								aria-label={t(item.labelKey)}
								className={cn(
									"flex h-8 w-full shrink-0 items-center gap-sm rounded-md px-sm text-left text-body-sm text-ink outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring active:translate-y-px max-md:h-full max-md:flex-1 max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:text-center max-md:text-caption-sm",
									isActive && "bg-hairline font-medium",
								)}
								key={item.path}
								onClick={() => onNavigate(item.path)}
								type="button"
							>
								<ItemIcon aria-hidden="true" className="size-4 shrink-0" />
								<span className="min-w-0 flex-1 truncate">
									{t(item.labelKey)}
								</span>
							</button>
						);
					})}
				</nav>

				<div className="mt-[7px] flex min-h-0 flex-1 flex-col max-md:hidden">
					<div className="flex h-[42px] shrink-0 items-center justify-between px-lg pb-xxs pt-md">
						<p className="text-[11px] font-semibold uppercase text-mute">
							{t("workspaceSidebar.workspaces")}
						</p>
						<button
							aria-label={t("workspaceSidebar.addWorkspace")}
							className="h-7 rounded-md px-0 text-caption-sm font-medium text-mute outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() => setIsNewWorkspaceOpen(true)}
							type="button"
						>
							+ {t("workspaceSidebar.newWorkspace")}
						</button>
					</div>

					<div
						aria-label={t("workspaceSidebar.workspaces")}
						className="min-h-0 flex-1 overflow-y-auto px-lg pb-lg"
						role="tree"
					>
						<div
							aria-label="agent-gauge"
							aria-expanded={isWorkspaceExpanded}
							aria-level={1}
							className="flex flex-col gap-xxs"
							role="treeitem"
							tabIndex={-1}
						>
							<button
								aria-label={t(
									isWorkspaceExpanded
										? "workspaceSidebar.collapseWorkspace"
										: "workspaceSidebar.expandWorkspace",
									{ workspace: "agent-gauge" },
								)}
								className="flex h-8 w-full items-center gap-sm rounded-md bg-hairline px-sm text-left text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
								onClick={() => setIsWorkspaceExpanded((expanded) => !expanded)}
								type="button"
							>
								{isWorkspaceExpanded ? (
									<ChevronDown aria-hidden="true" className="size-4 shrink-0" />
								) : (
									<ChevronRight
										aria-hidden="true"
										className="size-4 shrink-0"
									/>
								)}
								<Folder aria-hidden="true" className="size-4 shrink-0" />
								<span className="min-w-0 flex-1 truncate">agent-gauge</span>
							</button>

							{isWorkspaceExpanded ? (
								<>
									{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use group to own child treeitems. */}
									<div className="flex flex-col" role="group">
										<div
											aria-label={`${t("workspaceSidebar.conversationsLabel")} 1`}
											aria-expanded={isConversationsExpanded}
											className="flex flex-col"
											aria-level={2}
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
												{isConversationsExpanded ? (
													<ChevronDown
														aria-hidden="true"
														className="size-4 shrink-0"
													/>
												) : (
													<ChevronRight
														aria-hidden="true"
														className="size-4 shrink-0"
													/>
												)}
												<Comments
													aria-hidden="true"
													className="size-4 shrink-0"
												/>
												<span className="min-w-0 flex-1 truncate">
													{t("workspaceSidebar.conversationsLabel")}
												</span>
												<span className="text-caption-sm tabular-nums text-mute">
													1
												</span>
											</button>

											{isConversationsExpanded ? (
												<>
													{/* Temporary UI mock for Figma alignment; remove after conversations come from workspace data. */}
													<div
														aria-label={t("workspaceSidebar.mockConversation")}
														aria-level={3}
														className="mt-xs flex h-8 items-center gap-[7px] rounded-md bg-hairline pl-12 pr-[6px] text-body-sm font-medium"
														role="treeitem"
														tabIndex={-1}
													>
														<span className="min-w-0 flex-1 truncate">
															{t("workspaceSidebar.mockConversation")}
														</span>
														<Pin
															aria-hidden="true"
															className="size-4 shrink-0"
														/>
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
																	labelKey:
																		"workspaceSidebar.renameConversation",
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
																	labelKey:
																		"workspaceSidebar.deleteConversation",
																	separated: true,
																},
															]}
															placement="bottom end"
															trigger={
																<Button
																	aria-label={t(
																		"workspaceSidebar.mockConversationActions",
																		{
																			conversation: t(
																				"workspaceSidebar.mockConversation",
																			),
																		},
																	)}
																	className="size-4 min-w-4 cursor-pointer rounded-sm p-0 text-ink shadow-none outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
																	isIconOnly
																	size="sm"
																	variant="ghost"
																>
																	<Ellipsis
																		aria-hidden="true"
																		className="size-4"
																	/>
																</Button>
															}
														/>
													</div>
												</>
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
												onClick={() =>
													setIsBenchmarksExpanded((expanded) => !expanded)
												}
												type="button"
											>
												{isBenchmarksExpanded ? (
													<ChevronDown
														aria-hidden="true"
														className="size-4 shrink-0"
													/>
												) : (
													<ChevronRight
														aria-hidden="true"
														className="size-4 shrink-0"
													/>
												)}
												<LayoutColumns3
													aria-hidden="true"
													className="size-4 shrink-0"
												/>
												<span className="min-w-0 flex-1 truncate">
													{t("workspaceSidebar.benchmarks")}
												</span>
												<span className="text-caption-sm tabular-nums text-mute">
													0
												</span>
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
												onClick={() =>
													setIsSkillsExpanded((expanded) => !expanded)
												}
												type="button"
											>
												{isSkillsExpanded ? (
													<ChevronDown
														aria-hidden="true"
														className="size-4 shrink-0"
													/>
												) : (
													<ChevronRight
														aria-hidden="true"
														className="size-4 shrink-0"
													/>
												)}
												<Puzzle
													aria-hidden="true"
													className="size-4 shrink-0"
												/>
												<span className="min-w-0 flex-1 truncate">
													{t("workspaceSidebar.mountedSkills")}
												</span>
												<span className="text-caption-sm tabular-nums text-mute">
													0
												</span>
											</button>
										</div>
									</div>
								</>
							) : null}
						</div>
					</div>
				</div>
			</aside>

			{isNewWorkspaceOpen ? (
				<Suspense fallback={null}>
					<NewWorkspaceModal
						isOpen={isNewWorkspaceOpen}
						onOpenChange={setIsNewWorkspaceOpen}
					/>
				</Suspense>
			) : null}

			<div className="min-w-0 flex-1 max-md:pb-16">{children}</div>
		</div>
	);
};

export { AppShell };
