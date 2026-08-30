import { lazy, type ReactNode, Suspense, useState } from "react";
import {
	Archive,
	ChartColumn,
	ChevronDown,
	ChevronRight,
	Ellipsis,
	Folder,
	Gear,
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
	{ path: "/benchmark", labelKey: "navigation.benchmark", icon: ChartColumn },
] as const;

const NewWorkspaceModal = lazy(() => import("./create-workspace-modal"));

/**
 * Reproduces the Figma sidebar alignment and keeps animated visibility and tree state local.
 *
 * @example
 * <AppShell currentPath="/" onNavigate={navigateTo}><main /></AppShell>
 */
const AppShell = ({ currentPath, children, onNavigate }: AppShellProps) => {
	const { t } = useTranslation();
	const isAgentGaugeSelected = currentPath === "/workspaces/agent-gauge";
	const [isWorkspaceListExpanded, setIsWorkspaceListExpanded] = useState(true);
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
							<LayoutSideContentLeft
								aria-hidden="true"
								className="size-4 text-mute"
							/>
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
					className="flex h-[156px] shrink-0 flex-col gap-xs max-md:h-16 max-md:flex-row max-md:gap-1 max-md:px-2 max-md:py-1"
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

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-10 pt-[7px] max-md:hidden">
					<div className="flex shrink-0 items-center justify-between py-[7px]">
						<button
							aria-expanded={isWorkspaceListExpanded}
							aria-label={t(
								isWorkspaceListExpanded
									? "workspaceSidebar.collapseWorkspaces"
									: "workspaceSidebar.expandWorkspaces",
							)}
							className="flex items-center gap-xs rounded-sm text-mute outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() =>
								setIsWorkspaceListExpanded((expanded) => !expanded)
							}
							type="button"
						>
							<span className="text-[11px] font-semibold uppercase">
								{t("workspaceSidebar.workspaces")}
							</span>
							{isWorkspaceListExpanded ? (
								<ChevronDown
									aria-hidden="true"
									className="size-3 shrink-0 text-mute"
								/>
							) : (
								<ChevronRight
									aria-hidden="true"
									className="size-3 shrink-0 text-mute"
								/>
							)}
						</button>
						<button
							aria-label={t("workspaceSidebar.addWorkspace")}
							className="size-3 rounded-sm text-mute outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() => setIsNewWorkspaceOpen(true)}
							type="button"
						>
							<Plus aria-hidden="true" className="size-3 text-mute" />
						</button>
					</div>

					<div
						aria-hidden={!isWorkspaceListExpanded}
						aria-label={t("workspaceSidebar.workspaces")}
						className="shrink-0"
						inert={!isWorkspaceListExpanded}
						role="tree"
					>
						<div
							className={cn(
								"grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
								isWorkspaceListExpanded
									? "grid-rows-[1fr] opacity-100"
									: "pointer-events-none grid-rows-[0fr] opacity-0",
							)}
						>
							<div className="min-h-0 overflow-hidden">
								<div
									aria-label="agent-gauge"
									aria-expanded={isWorkspaceExpanded}
									aria-level={1}
									aria-selected={isAgentGaugeSelected}
									className="flex flex-col gap-xxs"
									role="treeitem"
									tabIndex={-1}
								>
									<div
										className={cn(
											"group flex h-8 w-full items-center rounded-md text-body-sm font-medium hover:bg-hairline",
											isAgentGaugeSelected && "bg-hairline",
										)}
									>
										<button
											aria-label={t(
												isWorkspaceExpanded
													? "workspaceSidebar.collapseWorkspace"
													: "workspaceSidebar.expandWorkspace",
												{ workspace: "agent-gauge" },
											)}
											className="flex h-full min-w-0 flex-1 items-center gap-sm rounded-md px-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
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
											<Folder aria-hidden="true" className="size-4 shrink-0" />
											<span className="min-w-0 flex-1 truncate">
												agent-gauge
											</span>
										</button>
										<div className="flex shrink-0 items-center gap-sm pr-sm text-mute opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
											<Plus
												aria-hidden="true"
												className="size-4 shrink-0 transition-colors hover:text-ink"
											/>
											<DropdownMenu
												items={[
													{
														icon: (
															<Pin
																aria-hidden="true"
																className="size-4 shrink-0 text-ink"
															/>
														),
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
														separated: true,
													},
												]}
												placement="bottom end"
												trigger={
													<Button
														aria-label={t("workspaceSidebar.workspaceActions", {
															workspace: "agent-gauge",
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
															aria-label={t(
																"workspaceSidebar.mockConversation",
															)}
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
																	className="size-4 shrink-0 transition-colors hover:text-ink"
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
																			className="size-4 min-w-4 cursor-pointer rounded-sm p-0 text-mute shadow-none outline-none transition-colors hover:bg-transparent hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
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
									</div>
								</div>
							</div>
						</div>
					</div>

					<section
						aria-label={t("workspaceSidebar.recent")}
						className="flex shrink-0 flex-col gap-xs"
					>
						<div className="flex h-7 items-center justify-between">
							<div className="flex items-center gap-xs">
								<p className="text-[11px] font-semibold text-mute">
									{t("workspaceSidebar.recent")}
								</p>
								<ChevronDown
									aria-hidden="true"
									className="size-3 shrink-0 text-mute"
								/>
							</div>
							<button
								aria-label={`${t("workspaceSidebar.recent")} ${t("navigation.newTask")}`}
								className="size-3 rounded-sm text-mute outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
								onClick={() => onNavigate("/")}
								type="button"
							>
								<Plus aria-hidden="true" className="size-3 text-mute" />
							</button>
						</div>
					</section>
				</div>

				<nav
					aria-label={t("workspaceSidebar.appSettings")}
					className="absolute inset-x-[14px] bottom-0 z-10 flex items-center gap-sm bg-surface-soft p-[10px] text-body-sm max-md:hidden"
				>
					<Gear aria-hidden="true" className="size-4 shrink-0" />
					<span>{t("workspaceSidebar.appSettings")}</span>
				</nav>
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
						<LayoutSideContentLeft
							aria-hidden="true"
							className="size-4 text-mute"
						/>
					</button>
				)}
				{children}
			</div>
		</div>
	);
};

export { AppShell };
