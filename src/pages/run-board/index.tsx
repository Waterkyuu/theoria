import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { Clock, Grip } from "@gravity-ui/icons";
import { Card, Chip } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import { PageHeader } from "@/components/share/page-header";
import { SearchBox } from "@/components/ui/search-box";
import { debounce } from "@/utils/common";
import { checkAgentActivities, onAgentActivitiesChanged } from "@/api/agent";
import type { AgentActivity, AgentActivityStatus } from "@/types/agent";

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
	/** Status whose place in the layout will change. */
	status: AgentActivityStatus;
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
	const [agentInput, setAgentInput] = useState("");
	const [agentQuery, setAgentQuery] = useState("");
	const [activities, setActivities] = useState<AgentActivity[]>([]);
	const agentSearchTerm = agentQuery.trim().toLocaleLowerCase();

	/** Ends the pointer gesture after finding the panel underneath the dragged panel.
	 * @example finishPanelDrag(event, false);
	 */
	const finishPanelDrag = (
		event: ReactPointerEvent<HTMLElement>,
		cancelled: boolean,
	) => {
		const drag = activeDrag.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const target =
			!cancelled && drag.moved
				? document
						.elementFromPoint?.(event.clientX, event.clientY)
						?.closest<HTMLElement>("[data-board-status]")
				: null;
		drag.element.style.removeProperty("transform");
		drag.element.style.removeProperty("z-index");
		drag.element.style.removeProperty("pointer-events");
		if (drag.element.hasPointerCapture?.(drag.pointerId)) {
			drag.element.releasePointerCapture(drag.pointerId);
		}
		activeDrag.current = null;
		const targetStatus = target?.dataset.boardStatus as
			| AgentActivityStatus
			| undefined;
		if (!targetStatus || targetStatus === drag.status) return;
		setLayout((current) => {
			if (!current.includes(targetStatus)) return current;
			const next = current.filter((entry) => entry !== drag.status);
			next.splice(current.indexOf(targetStatus), 0, drag.status);
			return next;
		});
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

	// Applies only the latest agent input after the user pauses typing.
	useEffect(() => {
		const updateAgentQuery = debounce(setAgentQuery);

		updateAgentQuery(agentInput);

		return updateAgentQuery.cancel;
	}, [agentInput]);

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("runBoard.title")}
				</p>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-6 sm:pb-10 sm:pt-7 lg:px-8">
				<div className="mx-auto max-w-330">
					<div className="mb-5 flex w-full justify-end">
						<div className="w-full sm:w-72">
							<SearchBox
								onValueChange={setAgentInput}
								placeholder={t("runBoard.searchPlaceholder")}
								value={agentInput}
							/>
						</div>
					</div>

					<div
						className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4"
						data-testid="run-board"
					>
						{layout.map((status) => {
							const presentation = STATUS_PRESENTATIONS[status];
							const items = activities.filter(
								(item) =>
									item.status === status &&
									t(`agentNames.${item.agent}`)
										.toLocaleLowerCase()
										.includes(agentSearchTerm),
							);

							return (
								<section
									aria-labelledby={`board-${status}`}
									className="relative flex min-h-128 min-w-0 cursor-grab flex-col overflow-hidden rounded-2xl bg-surface-soft p-2 active:cursor-grabbing"
									data-board-status={status}
									key={status}
									onPointerDown={(event) => {
										if (event.pointerType !== "mouse" || event.button !== 0)
											return;
										activeDrag.current = {
											element: event.currentTarget,
											pointerId: event.pointerId,
											status,
											startX: event.clientX,
											startY: event.clientY,
											moved: false,
										};
										event.currentTarget.setPointerCapture?.(event.pointerId);
									}}
									onPointerMove={(event) => {
										const drag = activeDrag.current;
										if (!drag || drag.pointerId !== event.pointerId) return;
										const deltaX = event.clientX - drag.startX;
										const deltaY = event.clientY - drag.startY;
										if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
										drag.moved = true;
										// Move the real panel so its cards remain visible throughout the gesture.
										drag.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0px)`;
										drag.element.style.zIndex = "10";
										drag.element.style.pointerEvents = "none";
									}}
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
										className="min-h-48 max-h-[60vh] flex-1 space-y-3 overflow-y-auto overscroll-contain p-1"
										data-testid={`run-board-list-${status}`}
									>
										{items.length > 0 ? (
											items.map((item) => {
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
														className="h-40 w-72 max-w-full overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-none transition-colors hover:border-hairline-strong"
														key={item.id}
														role="article"
													>
														<Card.Content className="p-3">
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
															<h3 className="mt-3 line-clamp-2 break-words overflow-hidden text-body-sm-strong font-medium">
																{item.title ?? t("runBoard.untitledTask")}
															</h3>
															<div className="mt-3 flex items-center justify-between border-t border-hairline pt-2 font-mono text-caption-sm text-mute">
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
												{agentSearchTerm
													? t("runBoard.noSearchResults")
													: t("runBoard.empty")}
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
