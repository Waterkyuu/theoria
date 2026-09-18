import type { ReactNode } from "react";
import { PageHeaderHost } from "@/components/share/page-header";

type LayoutProps = {
	/** Page content placed below the shared header. */
	children: ReactNode;
};

/** Keeps route content consistently inset below the shared page header.
 * @example <Layout><Routes /></Layout>
 */
const Layout = ({ children }: LayoutProps) => (
	<PageHeaderHost>
		<div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6 [&>main]:!h-full">
			{children}
		</div>
	</PageHeaderHost>
);

export { Layout };
