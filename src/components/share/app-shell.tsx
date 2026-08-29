import { lazy, type ReactNode, Suspense, useState } from "react";
import {
	ChevronDown,
	ChevronRight,
	Ellipsis,
	Folder,
	LayoutColumns3,
	LayoutSideContentLeft,
	PencilToSquare,
	Pin,
	Plus,
	Puzzle,
	TargetDart,
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
	{ path: "/", labelKey: "navigation.newTask", icon: TargetDart },
	{ path: "/skills", labelKey: "navigation.skills", icon: Puzzle },
	{ path: "/runs", labelKey: "navigation.runs", icon: LayoutColumns3 },
] as const;

const NewWorkspaceModal = lazy(() => import("./new-workspace-modal"));

/**
 * Reproduces the Figma sidebar alignment and keeps animated visibility and tree state local.
 *
 * @example
 * <AppShell currentPath="/" onNavigate={navigateTo}><main /></AppShell>
 */
const AppShell = ({ currentPath, children, onNavigate }: AppShellProps) => {
	const { t } = useTranslation();
	const isAgentGaugeSelected = currentPath === "/workspaces/agent-gauge";
	const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(true);
	const [isConversationsExpanded, setIsConversationsExpanded] = useState(true);
	const [isBenchmarksExpanded, setIsBenchmarksExpanded] = useState(false);
	const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
	const [isNewWorkspaceOpen, setIsNewWorkspaceOpen] = useState(false);
	const [isSidebarVisible, setIsSidebarVisible] = useState(true);

	return (
		<div className="flex min-h-[100dvh] bg-canvas text-ink">
			<aside
				aria-hidden={!isSidebarVisible}
				aria-label={t("workspaceSidebar.label")}
				className={cn(
					"sticky top-0 flex h-[100dvh] w-[287px] min-w-[287px] flex-col gap-[9px] overflow-hidden border-r border-hairline bg-surface-soft px-[14px] py-[7px] opacity-100 transition-[width,min-width,padding,opacity,transform,border-color] duration-200 ease-out motion-reduce:transition-none max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:z-50 max-md:h-16 max-md:w-full max-md:min-w-0 max-md:gap-0 max-md:border-r-0 max-md:border-t max-md:px-0 max-md:py-0",
					!isSidebarVisible &&
						"pointer-events-none w-0 min-w-0 -translate-x-full border-r-transparent px-0 opacity-0",
				)}
				inert={!isSidebarVisible}
			>
				<header className="flex shrink-0 flex-col gap-[9px] max-md:hidden">
					<div className="flex h-5 items-center justify-end">
						<button
							aria-label={t("collapseSidebar")}
							className="cursor-pointer rounded-sm outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() => setIsSidebarVisible(false)}
							type="button"
						>
							<LayoutSideContentLeft aria-hidden="true" className="size-4" />
						</button>
					</div>
					<div className="flex items-center py-[6px]">
						<button
							aria-label={t("appName")}
							className="rounded-md font-serif text-heading-md font-semibold leading-6 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() => onNavigate("/")}
							type="button"
						>
							{t("appName")}
						</button>
					</div>
				</header>

				<nav
					aria-label={t("mainNavigation")}
					className="flex h-[132px] shrink-0 flex-col gap-xs max-md:h-16 max-md:flex-row max-md:gap-1 max-md:px-2 max-md:py-1"
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
									"flex h-9 w-full shrink-0 items-center gap-sm rounded-md px-sm text-left text-body-sm text-ink outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring active:translate-y-px max-md:h-full max-md:flex-1 max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:text-center max-md:text-caption-sm",
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

				<div className="flex min-h-0 flex-1 flex-col py-[7px] max-md:hidden">
					<div className="flex h-7 shrink-0 items-center justify-between">
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
						className="min-h-0 flex-1 overflow-y-auto"
						role="tree"
					>
						<div
							aria-label="agent-gauge"
							aria-expanded={isWorkspaceExpanded}
							aria-level={1}
							aria-selected={isAgentGaugeSelected}
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
								className={cn(
									"group flex h-8 w-full items-center gap-sm rounded-md px-sm text-left text-body-sm font-medium outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
									isAgentGaugeSelected && "bg-hairline",
								)}
								onClick={() => {
									if (isAgentGaugeSelected) {
										setIsWorkspaceExpanded((expanded) => !expanded);
										return;
									}
									setIsWorkspaceExpanded(true);
									onNavigate("/workspaces/agent-gauge");
								}}
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
								<span
									aria-hidden="true"
									className="flex shrink-0 items-center gap-sm text-mute opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none"
								>
									<Plus className="size-4 shrink-0" />
									<Ellipsis className="size-4 shrink-0" />
								</span>
							</button>

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
											<TargetDart
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
													className="group mt-xs flex h-8 items-center gap-[7px] rounded-md pl-12 pr-[6px] text-body-sm font-medium hover:bg-hairline"
													role="treeitem"
													tabIndex={-1}
												>
													<span className="min-w-0 flex-1 truncate">
														{t("workspaceSidebar.mockConversation")}
													</span>
													<div className="flex shrink-0 items-center gap-sm text-mute opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none">
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
																	className="size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
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
											<Puzzle aria-hidden="true" className="size-4 shrink-0" />
											<span className="min-w-0 flex-1 truncate">
												{t("workspaceSidebar.mountedSkills")}
											</span>
											<span className="text-caption-sm tabular-nums text-mute">
												0
											</span>
										</button>
									</div>
								</div>
							</div>
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

			<div
				className={cn(
					"relative min-w-0 flex-1 max-md:pb-16",
					!isSidebarVisible &&
						"[&>main>header:first-child]:pl-[128px] max-md:[&>main>header:first-child]:pl-4",
				)}
			>
				{isSidebarVisible ? null : (
					<button
						aria-label={t("expandSidebar")}
						className="fixed left-[96px] top-[9px] z-50 cursor-pointer rounded-sm bg-canvas outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring max-md:hidden"
						onClick={() => setIsSidebarVisible(true)}
						type="button"
					>
						<LayoutSideContentLeft aria-hidden="true" className="size-4" />
					</button>
				)}
				{children}
			</div>
		</div>
	);
};

export { AppShell };
