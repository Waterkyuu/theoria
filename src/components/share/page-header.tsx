import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

type PageHeaderProps = {
	/** Page-specific title and actions arranged inside the shared top bar. */
	children: ReactNode;
};

type PageHeaderHostProps = {
	/** Current route rendered below the shared header slot. */
	children: ReactNode;
};

const PageHeaderTargetContext = createContext<HTMLElement | null | undefined>(
	undefined,
);

/** Keeps one header slot beside the sidebar for every route.
 * @example <PageHeaderHost><Layout><TasksPage /></Layout></PageHeaderHost>
 */
const PageHeaderHost = ({ children }: PageHeaderHostProps) => {
	const [target, setTarget] = useState<HTMLElement | null>(null);

	return (
		<PageHeaderTargetContext.Provider value={target}>
			<div className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
				<div ref={setTarget} className="shrink-0" />
				{children}
			</div>
		</PageHeaderTargetContext.Provider>
	);
};

/**
 * Keeps page-level title bars visually aligned while leaving their content flexible.
 *
 * @example
 * <PageHeader><p>Tasks</p><button type="button">Summary</button></PageHeader>
 */
const PageHeader = ({ children }: PageHeaderProps) => {
	const target = useContext(PageHeaderTargetContext);
	const header = (
		<header className="flex h-11 shrink-0 items-center justify-between gap-lg border-b border-hairline px-6">
			{children}
		</header>
	);

	return target === undefined
		? header
		: target
			? createPortal(header, target)
			: null;
};

export { PageHeader, PageHeaderHost };
