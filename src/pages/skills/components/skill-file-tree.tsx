import { type HTMLAttributes, useEffect, useRef } from "react";
import { ChevronRight, Ellipsis, File, Folder } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

type FileTreeProps = {
	/** Relative files and explicit folders marked by a trailing slash. */
	paths: string[];
	/** Current prefix, empty at the skill root. */
	prefix?: string;
	/** Active document to mark in the directory. */
	activePath: string;
	/** Switches documents without discarding edits. */
	onSelect: (path: string) => void;
	/** Requests a draft operation from the page that owns all file contents. */
	onAction: (action: "rename" | "delete", path: string) => void;
	/** Prevents changes while the directory snapshot is being saved. */
	isDisabled: boolean;
};

/**
 * Keeps folder expansion local while the draft remains owned by the editor page.
 *
 * @example
 * <FileTree paths={["SKILL.md"]} activePath="SKILL.md" onSelect={setPath} onAction={handleAction} isDisabled={false} />
 */
const FileTree = ({
	paths,
	prefix = "",
	activePath,
	onSelect,
	onAction,
	isDisabled,
}: FileTreeProps) => {
	const { t } = useTranslation();
	const menuButtons = useRef(new Map<string, HTMLButtonElement>());
	const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const pressOrigin = useRef<[number, number] | null>(null);
	const suppressClick = useRef(false);

	useEffect(() => () => clearTimeout(pressTimer.current), []);

	/**
	 * Cancels pending long presses when a gesture becomes scrolling or ends early.
	 */
	const cancelPress = () => {
		clearTimeout(pressTimer.current);
		pressOrigin.current = null;
	};

	/**
	 * Shares one accessible menu between touch, mouse and keyboard gestures without changing normal clicks.
	 *
	 * @example
	 * <button {...entryEvents("SKILL.md")}>SKILL.md</button>
	 */
	const entryEvents = (path: string): HTMLAttributes<HTMLElement> => ({
		onPointerDown: (event) => {
			cancelPress();
			suppressClick.current = false;
			if (isDisabled || event.button !== 0) return;
			pressOrigin.current = [event.clientX, event.clientY];
			pressTimer.current = setTimeout(() => {
				suppressClick.current = true;
				menuButtons.current.get(path)?.click();
			}, 500);
		},
		onPointerMove: (event) => {
			const origin = pressOrigin.current;
			if (
				origin &&
				Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) > 8
			)
				cancelPress();
		},
		onPointerUp: cancelPress,
		onPointerCancel: cancelPress,
		onPointerLeave: cancelPress,
		onClickCapture: (event) => {
			if (!suppressClick.current) return;
			suppressClick.current = false;
			event.preventDefault();
			event.stopPropagation();
		},
		onContextMenu: (event) => {
			event.preventDefault();
			cancelPress();
			// Touch platforms may emit contextmenu after the long-press timer already opened it.
			if (!isDisabled && !suppressClick.current)
				menuButtons.current.get(path)?.click();
		},
		onKeyDown: (event) => {
			if (
				event.key === "ContextMenu" ||
				(event.shiftKey && event.key === "F10")
			) {
				event.preventDefault();
				if (!isDisabled) menuButtons.current.get(path)?.click();
			}
		},
	});
	const names = [
		...new Set(paths.map((path) => path.slice(prefix.length).split("/")[0])),
	].sort();
	return (
		<ul className="space-y-1">
			{names.map((name) => {
				const path = prefix + name;
				const children = paths.filter(
					(file) => file.startsWith(`${path}/`) && file !== `${path}/`,
				);
				const isFolder = children.length > 0 || paths.includes(`${path}/`);
				return (
					<li key={path} className="relative">
						<div className="absolute right-1 top-1">
							<DropdownMenu
								items={[
									{ id: "rename", labelKey: "skills.editor.rename" },
									{
										id: "delete",
										labelKey: "skills.editor.delete",
										danger: true,
									},
								]}
								onAction={(action) => onAction(action, path)}
								placement="bottom end"
								trigger={
									<Button
										aria-label={t("skills.editor.entryActions", { path })}
										ref={(button) => {
											if (button) menuButtons.current.set(path, button);
											else menuButtons.current.delete(path);
										}}
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
							<details className="group" open>
								<summary
									{...entryEvents(path)}
									className="flex select-none touch-pan-y cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 pr-10 text-body-sm text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden"
								>
									<ChevronRight className="size-4 shrink-0 group-open:rotate-90" />
									<Folder className="size-4 shrink-0" />
									<span className="truncate">{name}</span>
								</summary>
								<div className="ml-4 border-l border-hairline pl-2">
									<FileTree
										paths={children}
										prefix={`${path}/`}
										activePath={activePath}
										onSelect={onSelect}
										onAction={onAction}
										isDisabled={isDisabled}
									/>
								</div>
							</details>
						) : (
							<button
								type="button"
								{...entryEvents(path)}
								aria-current={activePath === path ? "true" : undefined}
								onClick={() => onSelect(path)}
								className={cn(
									"flex w-full select-none touch-pan-y items-center gap-2 rounded-md px-2 py-2 pr-10 text-left text-body-sm outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring",
									activePath === path
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
