import {
	ChevronDown,
	ChevronRight,
	Comments,
	Folder,
	Folders,
	Gear,
	LayoutColumns3,
	Puzzle,
} from "@gravity-ui/icons";
import { cn } from "cnfast";
import { lazy, type ReactNode, Suspense, useState } from "react";
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

const NewWorkspaceModal = lazy(() => import("./new-workspace-modal"));

/**
 * Reproduces the compact Figma sidebar while keeping route and tree interactions local.
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
				className="sticky top-0 flex h-[100dvh] w-[287px] min-w-[287px] flex-col overflow-hidden border-r border-hairline bg-surface-soft"
			>
				<header className="flex h-[88px] shrink-0 items-center px-xl">
					<button
						aria-label={t("appName")}
						className="rounded-md font-primary text-heading-md font-semibold leading-6 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => onNavigate("/")}
						type="button"
					>
						{t("appName")}
					</button>
				</header>

				<nav
					aria-label={t("mainNavigation")}
					className="flex h-[116px] shrink-0 flex-col gap-xs px-lg"
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
									"flex h-8 w-full shrink-0 items-center gap-sm rounded-md px-sm text-left text-body-sm text-ink outline-none transition-colors hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring active:translate-y-px",
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

				<div className="flex min-h-0 flex-1 flex-col border-t border-hairline">
					<div className="flex h-10 shrink-0 items-center justify-between px-lg pt-sm">
						<p className="text-[11px] font-semibold uppercase text-mute">
							{t("workspaceSidebar.workspaces")}
						</p>
						<button
							aria-label={t("workspaceSidebar.addWorkspace")}
							className="h-7 rounded-md px-0 text-caption-sm font-medium text-charcoal outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
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
							className="flex flex-col gap-1"
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
								className="flex h-8 w-full items-center gap-sm rounded-md bg-hairline px-sm text-left text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
									<div className="flex flex-col gap-1" role="group">
										<div
											aria-label={`${t("workspaceSidebar.conversationsLabel")} 0`}
											aria-expanded={isConversationsExpanded}
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
													0
												</span>
											</button>
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

				<nav
					aria-label={t("workspaceSidebar.appSettings")}
					className="h-[49px] shrink-0 border-t border-hairline px-lg pt-sm"
				>
					<button
						aria-current={
							currentPath.startsWith("/settings") ? "page" : undefined
						}
						className={cn(
							"flex h-8 w-full items-center gap-sm rounded-md px-sm text-left text-body-sm outline-none hover:bg-hairline focus-visible:ring-2 focus-visible:ring-focus-ring",
							currentPath.startsWith("/settings") && "bg-hairline font-medium",
						)}
						onClick={() => onNavigate("/settings")}
						type="button"
					>
						<Gear aria-hidden="true" className="size-4 shrink-0" />
						<span>{t("workspaceSidebar.appSettings")}</span>
					</button>
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

			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
};

export { AppShell };
