import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Panel, Separator } from "react-resizable-panels";

type SkillEditorLayoutProps = {
	/** Document editor or preview that occupies the remaining width. */
	children: ReactNode;
	/** File explorer whose width is controlled by the divider. */
	directory: ReactNode;
	/** Preferred explorer side, shared with the editor toolbar. */
	side: "left" | "right";
};

/**
 * Uses the existing resize engine while keeping narrow windows vertically stacked.
 *
 * @example
 * <SkillEditorLayout
 *   directory={<FileExplorer />}
 *   side="right"
 * >
 *   <CodeEditor />
 * </SkillEditorLayout>
 */
const SkillEditorLayout = ({
	children,
	directory,
	side,
}: SkillEditorLayoutProps) => {
	const { t } = useTranslation();
	const [compact, setCompact] = useState(
		() => window.matchMedia("(max-width: 767px)").matches,
	);
	useEffect(() => {
		const query = window.matchMedia("(max-width: 767px)");
		// Preserve the stacked layout when the window crosses the desktop breakpoint.
		const syncCompact = () => setCompact(query.matches);
		query.addEventListener("change", syncCompact);
		return () => query.removeEventListener("change", syncCompact);
	}, []);

	if (compact) {
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{children}
				{directory}
			</div>
		);
	}

	const documentPanel = (
		<Panel
			key="document"
			id="skill-document"
			minSize="30%"
			className="flex min-h-0"
		>
			{children}
		</Panel>
	);
	const directoryPanel = (
		<Panel
			key="directory"
			id="skill-directory"
			defaultSize="288px"
			minSize="200px"
			maxSize="60%"
			groupResizeBehavior="preserve-pixel-size"
			className="flex min-h-0"
		>
			{directory}
		</Panel>
	);
	return (
		<Group
			id="skill-editor-layout"
			className="min-h-0 flex-1"
			orientation="horizontal"
		>
			{side === "left" ? directoryPanel : documentPanel}
			<Separator
				key="divider"
				aria-label={t("skills.editor.resizeDirectory")}
				className="relative z-10 w-px cursor-col-resize bg-hairline outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 hover:bg-focus-ring focus-visible:bg-focus-ring data-[separator=active]:bg-focus-ring"
			/>
			{side === "left" ? documentPanel : directoryPanel}
		</Group>
	);
};

export { SkillEditorLayout };
