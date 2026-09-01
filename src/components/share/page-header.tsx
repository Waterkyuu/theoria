import type { ReactNode } from "react";

type PageHeaderProps = {
	/** Page-specific title and actions arranged inside the shared top bar. */
	children: ReactNode;
};

/**
 * Keeps page-level title bars visually aligned while leaving their content flexible.
 *
 * @example
 * <PageHeader><p>Tasks</p><button type="button">Summary</button></PageHeader>
 */
const PageHeader = ({ children }: PageHeaderProps) => (
	<header className="flex h-11 shrink-0 items-center justify-between gap-lg border-b border-hairline px-4 sm:px-xl">
		{children}
	</header>
);

export { PageHeader };
