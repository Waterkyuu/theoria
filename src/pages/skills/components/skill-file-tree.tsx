import type { ReactNode } from "react";
import {
	ChevronRight,
	Ellipsis,
	File,
	Folder,
	PencilToSquare,
	TrashBin,
} from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

type FileTreeProps = {
	/** Relative files and explicit folders marked by a trailing slash. */
	paths: string[];
	/** Current prefix, empty at the skill root. */
	prefix?: string;
	/** Selected file or folder that determines where new entries are created. */
	selectedPath: string;
	/** Switches documents without discarding edits. */
	onSelect: (path: string) => void;
	/** Requests a draft operation from the page that owns all file contents. */
	onAction: (action: "rename" | "delete", path: string) => void;
	/** Prevents changes while the directory snapshot is being saved. */
	isDisabled: boolean;
	/** Selects a folder independently of the document open in the editor. */
	onSelectFolder: (path: string) => void;
	/** Parent directory where the inline creation field belongs. */
	draftParent?: string;
	/** Existing entry being renamed, or null when creating a new entry. */
	draftPath?: string | null;
	/** Inline name field shared with the page-owned validation and draft state. */
	draftInput?: ReactNode;
};

/**
 * Keeps folder expansion local while the draft remains owned by the editor page.
 *
 * @example
 * <FileTree paths={["SKILL.md"]} selectedPath="SKILL.md" onSelect={setPath} onAction={handleAction} onSelectFolder={setPath} isDisabled={false} />
 */
const FileTree = ({
	paths,
	prefix = "",
	selectedPath,
	onSelect,
	onAction,
	isDisabled,
	onSelectFolder,
	draftParent,
	draftPath,
	draftInput,
}: FileTreeProps) => {
	const { t } = useTranslation();
	const names = [
		...new Set(paths.map((path) => path.slice(prefix.length).split("/")[0])),
	].sort();
	return (
		<ul className="space-y-1">
			{draftParent !== undefined &&
			!draftPath &&
			prefix === (draftParent ? `${draftParent}/` : "") ? (
				<li>{draftInput}</li>
			) : null}
			{names.map((name) => {
				const path = prefix + name;
				const children = paths.filter(
					(file) => file.startsWith(`${path}/`) && file !== `${path}/`,
				);
				const isFolder = children.length > 0 || paths.includes(`${path}/`);
				if (draftPath === path) return <li key={path}>{draftInput}</li>;
				const isDraftInside =
					draftParent !== undefined &&
					(draftParent === path || draftParent.startsWith(`${path}/`));
				return (
					<li key={path} className="relative">
						<div className="absolute right-1 top-1">
							<DropdownMenu
								items={[
									{
										id: "rename",
										labelKey: "skills.editor.rename",
										icon: (
											<PencilToSquare
												aria-hidden="true"
												className="size-4 shrink-0"
											/>
										),
									},
									{
										id: "delete",
										labelKey: "skills.editor.delete",
										icon: (
											<TrashBin
												aria-hidden="true"
												className="size-4 shrink-0 text-danger"
											/>
										),
										danger: true,
									},
								]}
								onAction={(action) => onAction(action, path)}
								placement="bottom end"
								trigger={
									<Button
										aria-label={t("skills.editor.entryActions", { path })}
										size="sm"
										variant="ghost"
										isIconOnly
										isDisabled={isDisabled}
									>
										<Ellipsis aria-hidden="true" className="size-4" />
									</Button>
								}
							/>
						</div>
						{isFolder ? (
							<details
								className="group"
								key={isDraftInside ? "editing" : "idle"}
								open
							>
								{/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary already supports keyboard activation and disclosure. */}
								<summary
									onClick={() => onSelectFolder(path)}
									aria-current={selectedPath === path ? "true" : undefined}
									className="flex select-none touch-pan-y cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 pr-10 text-body-sm text-charcoal aria-current:bg-surface-soft aria-current:font-medium outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden"
								>
									<ChevronRight className="size-4 shrink-0 group-open:rotate-90" />
									<Folder className="size-4 shrink-0" />
									<span className="truncate">{name}</span>
								</summary>
								<div className="ml-4 border-l border-hairline pl-2">
									<FileTree
										paths={children}
										prefix={`${path}/`}
										selectedPath={selectedPath}
										onSelect={onSelect}
										onAction={onAction}
										isDisabled={isDisabled}
										onSelectFolder={onSelectFolder}
										draftParent={draftParent}
										draftPath={draftPath}
										draftInput={draftInput}
									/>
								</div>
							</details>
						) : (
							<button
								type="button"
								aria-current={selectedPath === path ? "true" : undefined}
								onClick={() => onSelect(path)}
								className={cn(
									"flex w-full select-none touch-pan-y items-center gap-2 rounded-md px-2 py-2 pr-10 text-left text-body-sm outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring",
									selectedPath === path
										? "bg-surface-soft font-medium text-ink"
										: "text-charcoal",
								)}
							>
								<File className="size-4 shrink-0" />
								<span className="truncate">{name}</span>
							</button>
						)}
					</li>
				);
			})}
		</ul>
	);
};

export { FileTree };
