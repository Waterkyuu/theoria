import {
	type PointerEvent as ReactPointerEvent,
	useRef,
	useState,
} from "react";
import { CircleInfo, Sliders, Xmark } from "@gravity-ui/icons";
import { Button, Dropdown } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/components/share/agent-icon";
import type {
	AgentKind,
	AgentProcessStates,
	AgentRuntimeState,
} from "@/types/agent";

type AgentEnvironmentDropdownProps = {
	/** Agent products shown in the environment panel and counted as running. */
	agentKinds: readonly AgentKind[];
	/** Latest local process snapshot, or null while the first snapshot is pending. */
	agentProcesses: AgentProcessStates | null;
	/** Installation and runtime probe state for every supported Agent product. */
	environmentRuntimes: Record<AgentKind, AgentRuntimeState>;
};

/**
 * Renders the draggable Agent environment trigger and its anchored status Dropdown.
 *
 * @example
 * <AgentEnvironmentDropdown
 *   agentKinds={agentKinds}
 *   agentProcesses={agentProcesses}
 *   environmentRuntimes={environmentRuntimes}
 * />
 */
const AgentEnvironmentDropdown = ({
	agentKinds,
	agentProcesses,
	environmentRuntimes,
}: AgentEnvironmentDropdownProps) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [buttonOffset, setButtonOffset] = useState({ x: 0, y: 0 });
	const suppressClick = useRef(false);
	const drag = useRef({
		pointerId: -1,
		pointerX: 0,
		pointerY: 0,
		offsetX: 0,
		offsetY: 0,
		minX: 0,
		maxX: 0,
		minY: 0,
		maxY: 0,
		moved: false,
	});
	const startedAgentCount = agentProcesses
		? agentKinds.filter((agent) => agentProcesses[agent]).length
		: 0;

	/**
	 * Captures the trigger and nearest page bounds so dragging stays on the visible canvas.
	 *
	 * @example
	 * onPointerDown={startDrag}
	 */
	const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const boundary = event.currentTarget.closest("main");
		if (event.button !== 0 || !boundary) return;

		const buttonBounds = event.currentTarget.getBoundingClientRect();
		const boundaryBounds = boundary.getBoundingClientRect();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		suppressClick.current = false;
		drag.current = {
			pointerId: event.pointerId,
			pointerX: event.clientX,
			pointerY: event.clientY,
			offsetX: buttonOffset.x,
			offsetY: buttonOffset.y,
			minX: buttonOffset.x + boundaryBounds.left - buttonBounds.left,
			maxX: buttonOffset.x + boundaryBounds.right - buttonBounds.right,
			minY: buttonOffset.y + boundaryBounds.top - buttonBounds.top,
			maxY: buttonOffset.y + boundaryBounds.bottom - buttonBounds.bottom,
			moved: false,
		};
	};

	/**
	 * Moves the trigger only after the pointer clears the click-versus-drag threshold.
	 *
	 * @example
	 * onPointerMove={moveTrigger}
	 */
	const moveTrigger = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const activeDrag = drag.current;
		if (activeDrag.pointerId !== event.pointerId) return;

		const deltaX = event.clientX - activeDrag.pointerX;
		const deltaY = event.clientY - activeDrag.pointerY;
		if (!activeDrag.moved && Math.hypot(deltaX, deltaY) < 4) return;

		activeDrag.moved = true;
		suppressClick.current = true;
		setButtonOffset({
			x: Math.min(
				Math.max(activeDrag.offsetX + deltaX, activeDrag.minX),
				activeDrag.maxX,
			),
			y: Math.min(
				Math.max(activeDrag.offsetY + deltaY, activeDrag.minY),
				activeDrag.maxY,
			),
		});
	};

	/**
	 * Ends the captured drag without letting its synthetic click toggle the Dropdown.
	 *
	 * @example
	 * onPointerUpCapture={finishDrag}
	 */
	const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const activeDrag = drag.current;
		if (activeDrag.pointerId !== event.pointerId) return;

		suppressClick.current = event.type === "pointerup" && activeDrag.moved;
		if (activeDrag.moved) {
			event.preventDefault();
			event.stopPropagation();
		}
		activeDrag.pointerId = -1;
		if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	/**
	 * Closes on Dropdown dismiss requests while opening waits for click-versus-drag resolution.
	 *
	 * @example
	 * onOpenChange={changeOpen}
	 */
	const changeOpen = (open: boolean) => {
		if (drag.current.moved || open) return;
		setIsOpen(false);
	};

	/** Opens the Dropdown only after the trigger gesture is confirmed as a click. */
	const openDropdown = () => {
		if (suppressClick.current) {
			suppressClick.current = false;
			return;
		}
		if (!isOpen) setIsOpen(true);
	};

	return (
		<div
			className="absolute bottom-6 right-5 z-30 max-sm:bottom-auto max-sm:right-3 max-sm:top-17"
			data-component="agent-environment-dropdown"
			style={{
				transform: `translate3d(${buttonOffset.x}px, ${buttonOffset.y}px, 0)`,
			}}
		>
			<Dropdown isOpen={isOpen} onOpenChange={changeOpen}>
				<Button
					aria-label={t("workspace.viewEnvironment")}
					className="size-11 min-w-0 cursor-grab touch-none select-none rounded-full border border-hairline-strong bg-canvas p-0 text-ink shadow-[0_8px_24px_rgba(0,0,0,0.12)] outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring active:cursor-grabbing"
					isIconOnly
					onClick={openDropdown}
					onPointerCancel={finishDrag}
					onPointerDown={startDrag}
					onPointerMove={moveTrigger}
					onPointerUpCapture={finishDrag}
					variant="ghost"
				>
					<span className="relative">
						<Sliders aria-hidden="true" className="size-4" />
						<span className="absolute -right-1 -top-1 size-2 rounded-full border border-canvas bg-terminal-green" />
					</span>
				</Button>

				<Dropdown.Popover
					className="max-w-none overflow-visible bg-transparent p-0 shadow-none"
					offset={12}
					placement="top end"
				>
					<section
						aria-label={t("workspace.environment")}
						aria-modal="false"
						className="flex h-80 w-90 flex-col overflow-hidden rounded-lg border border-hairline bg-canvas shadow-[0_24px_70px_rgba(0,0,0,0.16)] max-sm:h-[min(24rem,calc(100dvh-8rem))] max-sm:w-[calc(100vw-1.5rem)]"
						role="dialog"
					>
						<header className="flex items-start justify-between border-b border-hairline px-lg py-md">
							<div>
								<h2 className="text-body-sm font-semibold">
									{t("workspace.environment")}
								</h2>
								<p className="mt-xs text-caption-sm text-body">
									{t("workspace.startedAgentCount", {
										count: startedAgentCount,
									})}
								</p>
							</div>
							<button
								aria-label={t("workspace.closeEnvironment")}
								className="grid size-7 place-items-center rounded-md text-body hover:bg-surface-soft"
								onClick={() => setIsOpen(false)}
								type="button"
							>
								<Xmark aria-hidden="true" className="size-4" />
							</button>
						</header>
						<div className="min-h-0 flex-1 overflow-y-auto p-sm">
							{agentKinds.map((agent) => {
								const runtimeState = environmentRuntimes[agent];
								const runtime =
									runtimeState.status === "resolved"
										? runtimeState.value
										: null;
								const isRunning = agentProcesses?.[agent] ?? false;
								const runtimeSummary = [
									runtime?.model,
									runtime?.reasoningEffort,
								]
									.filter(Boolean)
									.join(" · ");

								return (
									<div
										className="flex items-center gap-md rounded-md px-md py-md hover:bg-surface-soft"
										key={agent}
									>
										<span className="grid size-9 place-items-center rounded-md border border-hairline">
											<AgentIcon name={agent} width={20} height={20} />
										</span>
										<div className="min-w-0 flex-1">
											<p className="text-body-sm font-medium">
												{t(`agentNames.${agent}`)}
											</p>
											<p className="mt-xs truncate text-caption-sm text-body">
												{runtimeState.status === "checking"
													? t("checkingLogin", {
															agent: t(`agentNames.${agent}`),
														})
													: runtimeState.status === "failed"
														? t("loginCheckFailed", {
																agent: t(`agentNames.${agent}`),
															})
														: runtimeSummary || t("metricUnavailable")}
											</p>
										</div>
										<div className="text-right">
											<p className="flex items-center justify-end gap-xs text-caption-sm">
												<span
													className={cn(
														"size-1.5 rounded-full",
														isRunning ? "bg-terminal-green" : "bg-mute",
													)}
												/>
												{t(isRunning ? "agentRunning" : "agentReady")}
											</p>
											<p className="mt-xs text-[11px] text-mute">
												{runtimeState.status === "resolved"
													? t(
															runtimeState.value.installed
																? "workspace.installed"
																: "notInstalled",
														)
													: t("metricUnavailable")}
											</p>
										</div>
									</div>
								);
							})}
						</div>
						<footer className="flex items-center gap-sm border-t border-hairline bg-surface-soft px-lg py-sm text-caption-sm text-body">
							<CircleInfo aria-hidden="true" className="size-4" />
							<span>{t("workspace.environmentDescription")}</span>
						</footer>
					</section>
				</Dropdown.Popover>
			</Dropdown>
		</div>
	);
};

export type { AgentEnvironmentDropdownProps };
export { AgentEnvironmentDropdown };
