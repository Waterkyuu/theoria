import {
	ChartColumn,
	ChevronDown,
	ChevronRight,
	Comment,
	Comments,
	Ellipsis,
	Folder,
	FolderOpen,
	Folders,
	Gear,
	LayoutColumns3,
	Pin,
	Plus,
	Puzzle,
} from "@gravity-ui/icons";
import { cn } from "cnfast";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

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

const PINNED_CONVERSATIONS = [
	"workspaceSidebar.conversations.renameHistory",
	"workspaceSidebar.conversations.openCodeProtocol",
] as const;

const RECENT_CONVERSATIONS = [
	"workspaceSidebar.conversations.runBoardLayout",
	"workspaceSidebar.conversations.githubPullRequest",
	"workspaceSidebar.conversations.tokenStats",
	"workspaceSidebar.conversations.agentMemory",
] as const;

/**
 * Keeps global navigation and app settings fixed while only the workspace tree scrolls.
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

	return (
		<div className="flex min-h-[100dvh] bg-canvas text-ink">
			<aside
				aria-label={t("workspaceSidebar.label")}
				className="sticky top-0 flex h-[100dvh] w-72 min-w-72 flex-col overflow-hidden border-r border-hairline bg-surface-soft"
			>
				<header className="shrink-0 px-lg pb-md pt-lg">
					<button
						aria-label={t("appName")}
						className="flex w-full items-center gap-md rounded-md px-sm py-sm text-left outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => onNavigate("/")}
						type="button"
					>
						<span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-on-primary">
							<ChartColumn aria-hidden="true" className="size-4" />
						</span>
						<span className="min-w-0">
							<span className="block font-primary text-body-md font-semibold leading-none">
								{t("appName")}
							</span>
							<span className="mt-xs block truncate text-caption-sm text-body">
								{t("appEdition")}
							</span>
						</span>
					</button>
				</header>

				<nav
					aria-label={t("mainNavigation")}
					className="shrink-0 space-y-0.5 px-lg pb-lg"
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
									"flex w-full items-center gap-md rounded-md px-md py-sm text-left text-body-sm text-body outline-none transition-colors hover:bg-hairline hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring active:translate-y-px",
									isActive && "bg-hairline font-medium text-ink",
								)}
								key={item.path}
								onClick={() => onNavigate(item.path)}
								type="button"
							>
								<ItemIcon aria-hidden="true" className="size-4 shrink-0" />
								<span className="truncate">{t(item.labelKey)}</span>
							</button>
						);
					})}
				</nav>

				<div className="flex min-h-0 flex-1 flex-col border-t border-hairline">
					<div className="flex shrink-0 items-center justify-between px-xl pb-sm pt-lg">
						<p className="text-caption-sm font-medium text-body">
							{t("workspaceSidebar.workspaces")}
						</p>
						<button
							aria-label={t("workspaceSidebar.addWorkspace")}
							className="grid size-7 place-items-center rounded-md text-body outline-none transition-colors hover:bg-hairline hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
							type="button"
						>
							<Plus aria-hidden="true" className="size-4" />
						</button>
					</div>

					<div
						aria-label={t("workspaceSidebar.workspaces")}
						className="min-h-0 flex-1 overflow-y-auto px-sm pb-lg"
						role="tree"
					>
						<div
							aria-label="agent-gauge"
							aria-expanded={isWorkspaceExpanded}
							aria-level={1}
							className="mb-xs"
							role="treeitem"
							tabIndex={-1}
						>
							<div className="group flex items-center gap-xs rounded-md pr-xs hover:bg-hairline">
								<button
									aria-label={t(
										isWorkspaceExpanded
											? "workspaceSidebar.collapseWorkspace"
											: "workspaceSidebar.expandWorkspace",
										{ workspace: "agent-gauge" },
									)}
									className="grid size-8 shrink-0 place-items-center rounded-md text-body outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
									onClick={() =>
										setIsWorkspaceExpanded((expanded) => !expanded)
									}
									type="button"
								>
									{isWorkspaceExpanded ? (
										<ChevronDown aria-hidden="true" className="size-4" />
									) : (
										<ChevronRight aria-hidden="true" className="size-4" />
									)}
								</button>
								<FolderOpen
									aria-hidden="true"
									className="size-[18px] shrink-0"
								/>
								<button
									className="min-w-0 flex-1 truncate py-sm text-left text-body-sm font-medium outline-none"
									onClick={() => onNavigate("/")}
									type="button"
								>
									agent-gauge
								</button>
								<button
									aria-label={t("workspaceSidebar.workspaceActions", {
										workspace: "agent-gauge",
									})}
									className="grid size-7 shrink-0 place-items-center rounded-md text-body opacity-0 outline-none transition-opacity hover:bg-hairline-strong focus:opacity-100 focus-visible:ring-2 focus-visible:ring-focus-ring group-hover:opacity-100"
									type="button"
								>
									<Ellipsis aria-hidden="true" className="size-4" />
								</button>
							</div>

							{isWorkspaceExpanded ? (
								<>
									{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use group to own child treeitems. */}
									<div
										className="ml-[15px] border-l border-hairline pl-sm"
										role="group"
									>
										<div
											aria-label={`${t("workspaceSidebar.conversationsLabel")} 12`}
											aria-expanded={isConversationsExpanded}
											aria-level={2}
											role="treeitem"
											tabIndex={-1}
										>
											<button
												className="flex w-full items-center gap-sm rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
												onClick={() =>
													setIsConversationsExpanded((expanded) => !expanded)
												}
												type="button"
											>
												{isConversationsExpanded ? (
													<ChevronDown
														aria-hidden="true"
														className="size-3.5"
													/>
												) : (
													<ChevronRight
														aria-hidden="true"
														className="size-3.5"
													/>
												)}
												<Comments aria-hidden="true" className="size-4" />
												<span className="min-w-0 flex-1 truncate">
													{t("workspaceSidebar.conversationsLabel")}
												</span>
												<span className="text-caption-sm tabular-nums text-mute">
													12
												</span>
											</button>

											{isConversationsExpanded ? (
												<>
													{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use group to own child treeitems. */}
													<div
														className="ml-[15px] border-l border-hairline pl-sm"
														role="group"
													>
														<div aria-level={3} role="treeitem" tabIndex={-1}>
															<button
																className="flex w-full items-center gap-sm rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
																type="button"
															>
																<Plus aria-hidden="true" className="size-4" />
																<span>
																	{t("workspaceSidebar.newConversation")}
																</span>
															</button>
														</div>

														<p className="px-md pb-xs pt-sm text-[11px] font-medium text-mute">
															{t("workspaceSidebar.pinned")}
														</p>
														{PINNED_CONVERSATIONS.map((conversation) => (
															<div
																aria-level={3}
																key={conversation}
																role="treeitem"
																tabIndex={-1}
															>
																<button
																	className="group/item flex w-full items-center gap-sm rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
																	type="button"
																>
																	<Pin
																		aria-hidden="true"
																		className="size-4 shrink-0"
																	/>
																	<span className="min-w-0 flex-1 truncate">
																		{t(conversation)}
																	</span>
																</button>
															</div>
														))}

														<p className="px-md pb-xs pt-sm text-[11px] font-medium text-mute">
															{t("workspaceSidebar.recent")}
														</p>
														{RECENT_CONVERSATIONS.map((conversation) => (
															<div
																aria-level={3}
																key={conversation}
																role="treeitem"
																tabIndex={-1}
															>
																<button
																	className="flex w-full items-center gap-sm rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
																	type="button"
																>
																	<Comment
																		aria-hidden="true"
																		className="size-4 shrink-0"
																	/>
																	<span className="min-w-0 flex-1 truncate">
																		{t(conversation)}
																	</span>
																</button>
															</div>
														))}
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
												className="flex w-full items-center gap-sm rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
												onClick={() =>
													setIsBenchmarksExpanded((expanded) => !expanded)
												}
												type="button"
											>
												{isBenchmarksExpanded ? (
													<ChevronDown
														aria-hidden="true"
														className="size-3.5"
													/>
												) : (
													<ChevronRight
														aria-hidden="true"
														className="size-3.5"
													/>
												)}
												<ChartColumn aria-hidden="true" className="size-4" />
												<span className="min-w-0 flex-1 truncate">
													{t("workspaceSidebar.benchmarks")}
												</span>
												<span className="text-caption-sm tabular-nums text-mute">
													3
												</span>
											</button>
											{isBenchmarksExpanded ? (
												<>
													{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use group to own child treeitems. */}
													<div
														className="ml-[15px] border-l border-hairline pl-sm"
														role="group"
													>
														<div aria-level={3} role="treeitem" tabIndex={-1}>
															<button
																className="w-full truncate rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
																type="button"
															>
																{t("workspaceSidebar.benchmarkExample")}
															</button>
														</div>
													</div>
												</>
											) : null}
										</div>

										<div
											aria-expanded={isSkillsExpanded}
											aria-level={2}
											role="treeitem"
											tabIndex={-1}
										>
											<button
												className="flex w-full items-center gap-sm rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
												onClick={() =>
													setIsSkillsExpanded((expanded) => !expanded)
												}
												type="button"
											>
												{isSkillsExpanded ? (
													<ChevronDown
														aria-hidden="true"
														className="size-3.5"
													/>
												) : (
													<ChevronRight
														aria-hidden="true"
														className="size-3.5"
													/>
												)}
												<Puzzle aria-hidden="true" className="size-4" />
												<span className="min-w-0 flex-1 truncate">
													{t("workspaceSidebar.mountedSkills")}
												</span>
												<span className="text-caption-sm tabular-nums text-mute">
													2
												</span>
											</button>
											{isSkillsExpanded ? (
												<>
													{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA trees use group to own child treeitems. */}
													<div
														className="ml-[15px] border-l border-hairline pl-sm"
														role="group"
													>
														{["TDD", "Product Design"].map((skill) => (
															<div
																aria-level={3}
																key={skill}
																role="treeitem"
																tabIndex={-1}
															>
																<button
																	className="w-full truncate rounded-md py-sm pl-sm pr-md text-left text-body-sm outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring"
																	type="button"
																>
																	{skill}
																</button>
															</div>
														))}
													</div>
												</>
											) : null}
										</div>
									</div>
								</>
							) : null}
						</div>

						{["research-benchmarks", "docs-lab"].map((workspace) => (
							<div aria-level={1} key={workspace} role="treeitem" tabIndex={-1}>
								<button
									className="flex w-full items-center gap-sm rounded-md px-sm py-sm text-left text-body-sm text-body outline-none transition-colors hover:bg-hairline hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
									type="button"
								>
									<ChevronRight aria-hidden="true" className="size-4" />
									<Folder aria-hidden="true" className="size-[18px]" />
									<span className="truncate">{workspace}</span>
								</button>
							</div>
						))}
					</div>
				</div>

				<nav
					aria-label={t("workspaceSidebar.appSettings")}
					className="shrink-0 border-t border-hairline p-lg"
				>
					<button
						aria-current={
							currentPath.startsWith("/settings") ? "page" : undefined
						}
						className={cn(
							"flex w-full items-center gap-md rounded-md px-md py-sm text-left text-body-sm text-body outline-none transition-colors hover:bg-hairline hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring active:translate-y-px",
							currentPath.startsWith("/settings") &&
								"bg-hairline font-medium text-ink",
						)}
						onClick={() => onNavigate("/settings")}
						type="button"
					>
						<Gear aria-hidden="true" className="size-4" />
						<span>{t("workspaceSidebar.appSettings")}</span>
					</button>
				</nav>
			</aside>

			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
};

export { AppShell };
