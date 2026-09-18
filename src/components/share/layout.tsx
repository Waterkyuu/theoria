import type { ReactNode } from "react";

type LayoutProps = {
	/** Active page, including any page-owned header. */
	children: ReactNode;
};

/** Applies one consistent inset to the route's main area.
 * @example <Layout><Routes /></Layout>
 */
const Layout = ({ children }: LayoutProps) => (
	<div className="h-dvh min-h-0 min-w-0 flex-1 overflow-y-auto p-6 max-md:h-[calc(100dvh-4rem)] [&>main]:!h-full">
		{children}
	</div>
);

export { Layout };
