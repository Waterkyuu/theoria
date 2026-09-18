import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { Clock, Grip } from "@gravity-ui/icons";
import { Card, Chip, ProgressBar } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import { PageHeader } from "@/components/share/page-header";
import { checkAgentActivities, onAgentActivitiesChanged } from "@/api/agent";
import type {
	AgentActivity,
	AgentActivityStatus,
	AgentKind,
} from "@/types/agent";

type StatusPresentation = {
	/** Tailwind color class for the status marker. */
	markerClassName: string;
	/** Status-specific border and background treatment for the task badge. */
	chipClassName: string;
};

type ActivePanelDrag = {
	/** Panel moved under the pointer. */
	element: HTMLElement;
	/** Pointer identity used to ignore unrelated mouse events. */
	pointerId: number;
	/** Panels in their original layout order for this gesture. */
	panels: HTMLElement[];
	/** Original panel positions used as stable drop slots. */
	slots: DOMRect[];
	/** Original index of the dragged panel. */
	sourceIndex: number;
	/** Visual order shown while the pointer is held down. */
	previewOrder: number[];
	/** Pointer coordinates at the start of the drag. */
	startX: number;
	/** Pointer coordinates at the start of the drag. */
	startY: number;
	/** Whether movement crossed the click tolerance. */
	moved: boolean;
};

const BOARD_STATUSES: AgentActivityStatus[] = [
	"running",
	"waiting",
	"finish",
	"error",
];

const CONTEXT_USAGE_BLACKLIST: ReadonlySet<AgentKind> = new Set(["workbuddy"]);

const STATUS_PRESENTATIONS: Record<AgentActivityStatus, StatusPresentation> = {
	running: {
		markerClassName: "bg-blue-600",
		chipClassName: "border-blue-400/40 bg-blue-500/10 text-blue-700",
	},
	waiting: {
		markerClassName: "bg-terminal-yellow",
		chipClassName: "border-terminal-yellow/40 bg-terminal-yellow/15 text-ink",
	},
	finish: {
		markerClassName: "bg-terminal-green",
		chipClassName:
			"border-terminal-green/40 bg-terminal-green/10 text-green-800",
	},
	error: {
		markerClassName: "bg-terminal-red",
		chipClassName: "border-terminal-red/40 bg-terminal-red/10 text-ink",
	},
};

const RunBoardPage = () => {
	const { i18n, t } = useTranslation();
	const [layout, setLayout] = useState(BOARD_STATUSES);
	const activeDrag = useRef<ActivePanelDrag | null>(null);
	const [activities, setActivities] = useState<AgentActivity[]>([]);

	/** Captures the original panel slots once so hover checks stay stable as panels move.
	 * @example startPanelDrag(event);
	 */
	const startPanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
		if (event.pointerType !== "mouse" || event.button !== 0) return;
		const panels = Array.from(
			event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
				"[data-board-status]",
			) ?? [],
		);
		if (panels.length !== layout.length) return;
		activeDrag.current = {
			element: event.currentTarget,
			pointerId: event.pointerId,
			panels,
			slots: panels.map((panel) => panel.getBoundingClientRect()),
			sourceIndex: panels.indexOf(event.currentTarget),
			previewOrder: panels.map((_, index) => index),
			startX: event.clientX,
			startY: event.clientY,
			moved: false,
		};
		event.currentTarget.setPointerCapture?.(event.pointerId);
	};

	/** Uses the slots captured at drag start so moving neighbors cannot change the hover target.
	 * @example movePanelDrag(event);
	 */
	const movePanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
		const drag = activeDrag.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - drag.startX;
		const deltaY = event.clientY - drag.startY;
		if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
		drag.moved = true;
		// The actual panel follows the pointer, including all of its cards.
		drag.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0px)`;
		drag.element.style.zIndex = "10";
		drag.element.style.pointerEvents = "none";
		const hoveredIndex = drag.slots.findIndex(
			(rect) =>
				event.clientX >= rect.left &&
				event.clientX < rect.right &&
				event.clientY >= rect.top &&
				event.clientY < rect.bottom,
		);
		if (hoveredIndex < 0) return;
		const nextOrder = drag.panels
			.map((_, index) => index)
			.filter((index) => index !== drag.sourceIndex);
		nextOrder.splice(hoveredIndex, 0, drag.sourceIndex);
		drag.previewOrder = nextOrder;
		for (const [slotIndex, panelIndex] of nextOrder.entries()) {
			if (panelIndex === drag.sourceIndex) continue;
			const panel = drag.panels[panelIndex];
			const from = drag.slots[panelIndex];
			const to = drag.slots[slotIndex];
			panel.style.transition = "transform 150ms ease";
			panel.style.transform = `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0px)`;
		}
	};

	/** Commits the visible order on drop or restores the original order on cancellation.
	 * @example finishPanelDrag(event, false);
	 */
	const finishPanelDrag = (
		event: ReactPointerEvent<HTMLElement>,
		cancelled: boolean,
	) => {
		const drag = activeDrag.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		for (const panel of drag.panels) {
			panel.style.removeProperty("transform");
			panel.style.removeProperty("transition");
		}
		drag.element.style.removeProperty("z-index");
		drag.element.style.removeProperty("pointer-events");
		if (drag.element.hasPointerCapture?.(drag.pointerId)) {
			drag.element.releasePointerCapture(drag.pointerId);
		}
		activeDrag.current = null;
		if (
			cancelled ||
			!drag.moved ||
			drag.previewOrder.every((index, slot) => index === slot)
		)
			return;
		setLayout(
			drag.previewOrder.map(
				(index) =>
					drag.panels[index].dataset.boardStatus as AgentActivityStatus,
			),
		);
	};

	// Loads the cached native snapshot and keeps it current through source-change events.
	useEffect(() => {
		let isActive = true;
		let receivedEvent = false;
		let stopListening: (() => void) | undefined;

		// Starts the native snapshot and event subscription without allowing stale unmount updates.
		const startActivityMonitoring = async () => {
			try {
				const [response, unlisten] = await Promise.all([
					checkAgentActivities(),
					onAgentActivitiesChanged((nextResponse) => {
						receivedEvent = true;
						if (isActive) {
							setActivities(nextResponse.activities);
						}
					}),
				]);
				if (!isActive) {
					unlisten();
					return;
				}
				stopListening = unlisten;
				if (!receivedEvent) {
					setActivities(response.activities);
				}
			} catch {
				if (isActive) {
					setActivities([]);
				}
			}
		};

		startActivityMonitoring();

		return () => {
			isActive = false;
			stopListening?.();
		};
	}, []);

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("runBoard.title")}
				</p>
			</PageHeader>

			<div className="main-content-layout min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto h-full max-w-330">
					<div
						className="grid h-full auto-rows-[max(32rem,100%)] gap-4 lg:grid-cols-2 xl:grid-cols-4"
						data-testid="run-board"
					>
						{layout.map((status) => {
							const presentation = STATUS_PRESENTATIONS[status];
							const items = activities.filter((item) => item.status === status);

							return (
								<section
									aria-labelledby={`board-${status}`}
									className="relative flex min-h-128 min-w-0 cursor-grab select-none flex-col overflow-hidden rounded-2xl bg-surface-soft p-2 active:cursor-grabbing"
									data-board-status={status}
									key={status}
									onPointerDown={startPanelDrag}
									onPointerMove={movePanelDrag}
									onPointerUp={(event) => finishPanelDrag(event, false)}
									onPointerCancel={(event) => finishPanelDrag(event, true)}
								>
									<header className="flex items-center gap-2 px-2 py-2.5">
										<button
											aria-label={t("runBoard.dragStatus", {
												status: t(`runBoard.status.${status}`),
											})}
											className="cursor-grab rounded-md p-1 text-mute hover:text-ink active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-focus-ring"
											onKeyDown={(event) => {
												const offset =
													event.key === "ArrowLeft" || event.key === "ArrowUp"
														? -1
														: event.key === "ArrowRight" ||
															  event.key === "ArrowDown"
															? 1
															: 0;
												if (offset === 0) return;
												event.preventDefault();
												// Adjacent swaps let keyboard users reorder the same panels as mouse users.
												setLayout((current) => {
													const from = current.indexOf(status);
													const to = from + offset;
													if (to < 0 || to >= current.length) return current;
													const next = [...current];
													[next[from], next[to]] = [next[to], next[from]];
													return next;
												});
											}}
											type="button"
										>
											<Grip aria-hidden="true" className="size-4" />
										</button>
										<span
											aria-hidden="true"
											className={cn(
												"size-2.5 shrink-0 rounded-full",
												presentation.markerClassName,
											)}
										/>
										<h2
											className="flex min-w-0 items-baseline gap-2 text-body-sm-strong font-medium"
											id={`board-${status}`}
										>
											<span className="truncate">
												{t(`runBoard.status.${status}`)}
											</span>
											<span className="shrink-0 font-normal text-mute">
												{items.length}
											</span>
										</h2>
									</header>

									<div
										className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-1"
										data-testid={`run-board-list-${status}`}
									>
										{items.length > 0 ? (
											items.map((item) => {
												const contextPercentage =
													item.contextUsage &&
													!CONTEXT_USAGE_BLACKLIST.has(item.agent) &&
													item.contextUsage.windowTokens > 0
														? Math.min(
																100,
																Math.round(
																	(item.contextUsage.usedTokens /
																		item.contextUsage.windowTokens) *
																		100,
																),
															)
														: null;
												const updatedAt = new Date(item.updatedAtMs);
												const updatedTime = updatedAt.toLocaleTimeString(
													i18n.language,
													{
														hour: "2-digit",
														minute: "2-digit",
													},
												);
												const updatedDate = updatedAt.toLocaleDateString(
													i18n.language,
													{
														month: "2-digit",
														day: "2-digit",
													},
												);

												return (
													<Card
														className="h-48 w-72 max-w-full overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-none transition-colors hover:border-hairline-strong"
														key={item.id}
														role="article"
													>
														<Card.Content className="flex h-full flex-col p-3">
															{/* Equal columns keep lifecycle and Agent identity aligned at opposite edges. */}
															<div className="grid grid-cols-2 items-center gap-3 text-caption-sm text-mute">
																<Chip
																	className={cn(
																		"min-w-0 justify-self-start border",
																		presentation.chipClassName,
																	)}
																	size="sm"
																	variant="tertiary"
																>
																	<Chip.Label className="truncate">
																		{t(
																			`runBoard.statusDescription.${item.status}`,
																		)}
																	</Chip.Label>
																</Chip>
																<span className="flex min-w-0 items-center justify-end gap-1.5">
																	<AgentIcon
																		name={item.agent}
																		width={14}
																		height={14}
																	/>
																	<span className="truncate">
																		{t(`agentNames.${item.agent}`)}
																	</span>
																</span>
															</div>
															{/* Product titles make cards recognizable without exposing opaque identifiers. */}
															<h3 className="mt-3 line-clamp-2 shrink-0 break-words overflow-hidden text-body-sm-strong font-medium">
																{item.title ?? t("runBoard.untitledTask")}
															</h3>
															{contextPercentage !== null && (
																<ProgressBar
																	aria-label={t("runBoard.contextUsage")}
																	className="mt-2"
																	value={contextPercentage}
																>
																	<div className="flex items-center justify-between text-caption-sm text-mute">
																		<span>{t("runBoard.contextUsage")}</span>
																		<ProgressBar.Output>
																			{contextPercentage}%
																		</ProgressBar.Output>
																	</div>
																	<ProgressBar.Track className="mt-1 h-1 rounded-full bg-hairline">
																		<ProgressBar.Fill
																			className={cn(
																				"h-full rounded-full",
																				contextPercentage >= 80
																					? "bg-orange-500"
																					: "bg-blue-600",
																			)}
																		/>
																	</ProgressBar.Track>
																</ProgressBar>
															)}
															<div className="mt-auto flex items-center justify-between border-t border-hairline pt-2 font-mono text-caption-sm text-mute">
																<span>{updatedTime}</span>
																<span className="flex items-center gap-1.5">
																	<Clock
																		aria-hidden="true"
																		className="size-3.5"
																	/>
																	{updatedDate}
																</span>
															</div>
														</Card.Content>
													</Card>
												);
											})
										) : (
											<p className="px-4 py-10 text-center text-caption-sm text-body">
												{t("runBoard.empty")}
											</p>
										)}
									</div>
								</section>
							);
						})}
					</div>
				</div>
			</div>
		</main>
	);
};

export default RunBoardPage;
