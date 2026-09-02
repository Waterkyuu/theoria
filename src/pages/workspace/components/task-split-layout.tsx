import { type ReactNode, useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

const COMPACT_LAYOUT_QUERY = "(max-width: 767px)";

type TaskSplitLayoutProps = {
	/** Agent run panels that occupy the primary side of the layout. */
	children: ReactNode;
	/** Accessible description for the draggable divider. */
	resizerLabel: string;
	/** Optional result summary shown in the secondary panel. */
	summary: ReactNode;
};

/** Tracks the breakpoint where the result summary becomes an overlay. */
const useCompactLayout = () => {
	const [isCompact, setIsCompact] = useState(
		() => window.matchMedia(COMPACT_LAYOUT_QUERY).matches,
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
		const syncLayout = () => setIsCompact(mediaQuery.matches);

		mediaQuery.addEventListener("change", syncLayout);
		return () => mediaQuery.removeEventListener("change", syncLayout);
	}, []);

	return isCompact;
};

/** Keeps the desktop panes resizable while preserving the mobile overlay. */
const TaskSplitLayout = ({
	children,
	resizerLabel,
	summary,
}: TaskSplitLayoutProps) => {
	const isCompact = useCompactLayout();

	if (isCompact) {
		return (
			<div className="flex min-h-0 flex-1">
				{children}
				{summary}
			</div>
		);
	}

	return (
		<Group className="min-h-0 flex-1" id="task-summary-layout">
			<Panel className="flex min-h-0" id="task-content" minSize="30%">
				{children}
			</Panel>
			{summary ? (
				<>
					<Separator
						aria-label={resizerLabel}
						className="relative w-px cursor-col-resize bg-hairline outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 hover:bg-hairline-strong focus-visible:bg-focus-ring data-[separator=active]:bg-focus-ring"
						id="task-summary-resizer"
					/>
					<Panel
						className="flex min-h-0"
						defaultSize="40%"
						groupResizeBehavior="preserve-pixel-size"
						id="task-summary"
						maxSize="70%"
						minSize="360px"
					>
						{summary}
					</Panel>
				</>
			) : null}
		</Group>
	);
};

export { TaskSplitLayout };
