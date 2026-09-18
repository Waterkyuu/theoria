import type { ReactNode } from "react";
import { cn } from "cnfast";

type LayoutProps = {
	/** Page content placed below the shared header. */
	children?: ReactNode;
	/** Lets pages choose scrolling or pane layout without changing the shared inset. */
	className?: string;
};

/** Keeps the main area consistently inset from the sidebar and shared page header.
 * @example <Layout className="overflow-y-auto"><section>Tasks</section></Layout>
 */
const Layout = ({ children, className }: LayoutProps) => (
	<div className={cn("min-h-0 min-w-0 flex-1 p-6", className)}>{children}</div>
);

export { Layout };
