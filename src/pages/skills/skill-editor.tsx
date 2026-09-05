import { type FormEvent, useState } from "react";
import {
	ChevronRight,
	FilePlus,
	FolderFill,
	FolderPlus,
	LayoutSplitSideContentLeft,
	LayoutSplitSideContentRight,
} from "@gravity-ui/icons";
import { Button, Input, TextField, Toast, Tooltip } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router";
import { CodeEditor } from "@/components/share/code-editor";
import { PageHeader } from "@/components/share/page-header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { SearchBox } from "@/components/ui/search-box";
import { handleError } from "@/utils/error";
import { useCreatePlatformSkill } from "@/queries/skill";
import { SkillEditorLayout } from "./components/skill-editor-layout";
import { FileTree } from "./components/skill-file-tree";

/**
 * Rejects filenames that collide or escape on supported desktop platforms.
 *
 * @example
 * isPortableName("guide.md")
 */
const isPortableName = (name: string) =>
	Boolean(name) &&
	name !== "." &&
	name !== ".." &&
	!/[<>:"/\\|?*\p{Cc}]|[. ]$/u.test(name) &&
	!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);

/**
 * Reads supported single-line frontmatter without rewriting the saved file.
 *
 * @example
 * readFrontmatter("---\nname: demo\ndescription: Test\n---\n")
 */
const readFrontmatter = (manifest: string) => {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
		manifest,
	)?.[1];
	const fields: Record<string, string> = {};
	for (const line of frontmatter?.split(/\r?\n/) ?? []) {
		const match = /^(name|description):\s*(.*)$/.exec(line);
		if (!match || fields[match[1]]) continue;
		let value = match[2].trim();
		if (value.startsWith('"')) {
			try {
				value = JSON.parse(value) as string;
			} catch {
				return null;
			}
		} else if (value.startsWith("'")) {
			if (!value.endsWith("'") || value.length < 2) return null;
			value = value.slice(1, -1).replace(/''/g, "'");
		}
		fields[match[1]] = value;
	}
	return fields;
};

/**
 * Validates required fields for saving without hiding incomplete values in the preview.
 *
 * @example
 * readMetadata("---\nname: demo\ndescription: Test\n---\n")
 */
const readMetadata = (manifest: string) => {
	const fields = readFrontmatter(manifest);
	if (!fields) return null;
	const { name, description } = fields;
	if (
		!name ||
		!/^[A-Za-z0-9_-]{1,120}$/.test(name) ||
		!isPortableName(name) ||
		!description?.trim() ||
		/^(\||>|null|~)$/.test(description)
	)
		return null;
	return { name, description };
};

/**
 * Uses a path boundary so operations on one folder cannot affect similarly named siblings.
 *
 * @example
 * isEntryPath("references/guide.md", "references")
 */
const isEntryPath = (path: string, root: string) =>
	path === root || path.startsWith(`${root}/`);

/**
 * Uses the containing directory when a file is selected as the creation target.
 *
 * @example
 * parentDirectory("references/guide.md")
 */
const parentDirectory = (path: string) =>
	path.slice(0, Math.max(0, path.lastIndexOf("/")));

const SkillEditorPage = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const mutation = useCreatePlatformSkill();
	const [files, setFiles] = useState<Record<string, string>>({
		"SKILL.md": "---\nname: \ndescription: \n---\n",
	});
	const [directories, setDirectories] = useState<string[]>([]);
	const [entryKind, setEntryKind] = useState<"file" | "folder">("file");
	const [selectedPath, setSelectedPath] = useState("SKILL.md");
	const [entryParent, setEntryParent] = useState("");
	const [activePath, setActivePath] = useState("SKILL.md");
	const [preview, setPreview] = useState(false);
	const [filter, setFilter] = useState("");
	const [newPath, setNewPath] = useState<string | null>(null);
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [deletingPath, setDeletingPath] = useState<string | null>(null);
	const [pathError, setPathError] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [confirmExit, setConfirmExit] = useState(false);
	const [side, setSide] = useState<"left" | "right">(() =>
		localStorage.getItem("skill-editor-directory-side") === "left"
			? "left"
			: "right",
	);
	const targetDirectory =
		files[selectedPath] !== undefined
			? parentDirectory(selectedPath)
			: selectedPath;
	const metadata = readMetadata(files["SKILL.md"] ?? "");
	const paths = [
		...Object.keys(files),
		...directories.map((path) => `${path}/`),
	].filter((path) => path.toLowerCase().includes(filter.toLowerCase()));
	const markdown = /\.md$/i.test(activePath);
	const content = files[activePath] ?? "";
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n-{3,}(?:\r?\n|$)/.exec(
		content,
	)?.[0];

	/**
	 * Draft paths are relative to the skill root; reject conflicts before replacing any content.
	 *
	 * @example
	 * addEntry(event)
	 */
	const addEntry = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = newPath?.trim() ?? "";
		const path = entryParent ? `${entryParent}/${name}` : name;
		const lower = path.toLowerCase();
		if (renamingPath === path) {
			setRenamingPath(null);
			setNewPath(null);
			return;
		}
		const remainingFiles = Object.keys(files).filter(
			(file) => !renamingPath || !isEntryPath(file, renamingPath),
		);
		const remainingDirectories = directories.filter(
			(directory) => !renamingPath || !isEntryPath(directory, renamingPath),
		);
		const fileConflict = remainingFiles.some((file) => {
			const existing = file.toLowerCase();
			return (
				existing === lower ||
				existing.startsWith(`${lower}/`) ||
				lower.startsWith(`${existing}/`)
			);
		});
		const directoryConflict = remainingDirectories.some((directory) => {
			const existing = directory.toLowerCase();
			return existing === lower || existing.startsWith(`${lower}/`);
		});
		const invalidMove =
			renamingPath &&
			(isEntryPath(path, renamingPath) ||
				[...Object.keys(files), ...directories].some(
					(entry) =>
						isEntryPath(entry, renamingPath) &&
						path.length + entry.length - renamingPath.length > 240,
				));
		if (
			path.length > 240 ||
			!path.split("/").every(isPortableName) ||
			fileConflict ||
			directoryConflict ||
			invalidMove ||
			(!renamingPath && Object.keys(files).length + directories.length >= 100)
		) {
			setPathError(true);
			return;
		}
		if (renamingPath) {
			/**
			 * Rewrites descendants together so renamed folders retain their open document and contents.
			 *
			 * @example
			 * movePath("references/guide.md")
			 */
			const movePath = (entry: string) =>
				isEntryPath(entry, renamingPath)
					? path + entry.slice(renamingPath.length)
					: entry;
			setFiles(
				Object.fromEntries(
					Object.entries(files).map(([file, value]) => [movePath(file), value]),
				),
			);
			setDirectories(directories.map(movePath));
			setActivePath(movePath(activePath));
			setSelectedPath(movePath(selectedPath));
			setRenamingPath(null);
		} else if (entryKind === "folder") {
			setDirectories([...directories, path]);
			setSelectedPath(path);
		} else {
			setFiles({ ...files, [path]: "" });
			setActivePath(path);
			setSelectedPath(path);
			setPreview(false);
		}
		setNewPath(null);
		setPathError(false);
		setDirty(true);
	};

	/**
	 * Removes the confirmed entry and all descendants from the next saved snapshot.
	 */
	const deleteEntry = () => {
		if (!deletingPath || mutation.isPending) return;
		const remaining = Object.fromEntries(
			Object.entries(files).filter(
				([path]) => !isEntryPath(path, deletingPath),
			),
		);
		setFiles(remaining);
		if (isEntryPath(selectedPath, deletingPath))
			setSelectedPath(parentDirectory(deletingPath));
		setDirectories(
			directories.filter((path) => !isEntryPath(path, deletingPath)),
		);
		if (isEntryPath(activePath, deletingPath)) {
			setActivePath(Object.keys(remaining)[0] ?? "");
			setPreview(false);
		}
		setNewPath(null);
		setRenamingPath(null);
		setDeletingPath(null);
		setDirty(true);
	};

	/**
	 * Persist one immutable draft snapshot; leave it available for retry on failure.
	 */
	const save = async () => {
		if (!metadata || mutation.isPending) return;
		setSaveError(false);
		try {
			await mutation.mutateAsync({
				files,
				...(directories.length ? { directories } : {}),
			});
			Toast.toast.success(t("skills.create.success", { skill: metadata.name }));
			navigate("/skills");
		} catch (error) {
			setSaveError(true);
			handleError(
				error,
				"Editor Skill creation failed",
				true,
				t("skills.editor.saveFailed"),
			);
		}
	};

	/**
	 * Persist the user's layout preference independently of the unsaved skill draft.
	 */
	const switchSide = () => {
		const next = side === "right" ? "left" : "right";
		setSide(next);
		localStorage.setItem("skill-editor-directory-side", next);
	};

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas selection:bg-focus-ring selection:text-ink max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("skills.addMenu.editor")}
				</p>
			</PageHeader>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<Button
						size="sm"
						variant="ghost"
						isDisabled={mutation.isPending}
						onPress={() => (dirty ? setConfirmExit(true) : navigate("/skills"))}
					>
						{t("skills.create.back")}
					</Button>
					<ChevronRight className="size-4 shrink-0 text-mute" />
					<span className="truncate font-mono text-body-sm text-ink">
						{activePath}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="primary"
						isDisabled={!metadata || mutation.isPending}
						onPress={save}
					>
						{t(
							mutation.isPending
								? "skills.editor.saving"
								: "skills.editor.save",
						)}
					</Button>
				</div>
			</div>
			<SkillEditorLayout
				side={side}
				directory={
					<aside
						aria-label={t("skills.editor.directory")}
						className="flex max-h-64 min-h-0 w-full flex-col gap-3 overflow-y-auto bg-surface-card p-3 md:max-h-none"
					>
						<div className="flex items-center justify-between">
							<span className="text-body-sm font-medium text-charcoal">
								{t("skills.editor.directory")}
							</span>
							<div className="flex items-center gap-1">
								<Tooltip delay={0}>
									<Button
										aria-label={t("skills.editor.newFile")}
										isIconOnly
										size="sm"
										variant="ghost"
										isDisabled={mutation.isPending}
										onPress={() => {
											setRenamingPath(null);
											setEntryParent(targetDirectory);
											setFilter("");
											setEntryKind("file");
											setNewPath("");
											setPathError(false);
										}}
									>
										<FilePlus aria-hidden="true" className="size-4" />
									</Button>
									<Tooltip.Content placement="bottom">
										{t("skills.editor.newFile")}
									</Tooltip.Content>
								</Tooltip>
								<Tooltip delay={0}>
									<Button
										aria-label={t("skills.editor.newFolder")}
										isIconOnly
										size="sm"
										variant="ghost"
										isDisabled={mutation.isPending}
										onPress={() => {
											setRenamingPath(null);
											setEntryParent(targetDirectory);
											setFilter("");
											setEntryKind("folder");
											setNewPath("");
											setPathError(false);
										}}
									>
										<FolderPlus aria-hidden="true" className="size-4" />
									</Button>
									<Tooltip.Content placement="bottom">
										{t("skills.editor.newFolder")}
									</Tooltip.Content>
								</Tooltip>
								<Tooltip delay={0}>
									<Button
										aria-label={t(
											side === "right"
												? "skills.editor.moveLeft"
												: "skills.editor.moveRight",
										)}
										isIconOnly
										size="sm"
										variant="ghost"
										onPress={switchSide}
									>
										{side === "right" ? (
											<LayoutSplitSideContentLeft
												aria-hidden="true"
												className="size-4"
											/>
										) : (
											<LayoutSplitSideContentRight
												aria-hidden="true"
												className="size-4"
											/>
										)}
									</Button>
									<Tooltip.Content placement="bottom">
										{t(
											side === "right"
												? "skills.editor.moveLeft"
												: "skills.editor.moveRight",
										)}
									</Tooltip.Content>
								</Tooltip>
							</div>
						</div>
						<SearchBox
							value={filter}
							onValueChange={setFilter}
							placeholder={t("skills.editor.filter")}
						/>
						<FileTree
							draftParent={newPath !== null ? entryParent : undefined}
							draftPath={renamingPath}
							draftInput={
								newPath !== null ? (
									<form onSubmit={addEntry} className="py-1">
										<div className="flex items-center gap-2 px-2">
											{entryKind === "folder" ? (
												<FolderFill
													aria-hidden="true"
													className="size-4 shrink-0 text-blue-300"
												/>
											) : (
												<svg
													aria-hidden="true"
													viewBox="0 0 16 16"
													fill="currentColor"
													className="size-4 shrink-0 text-blue-300"
												>
													<path d="M5 1a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8h-4a3 3 0 0 1-3-3V1H5Zm3.5.697V5A1.5 1.5 0 0 0 10 6.5h3.303a1.5 1.5 0 0 0-.242-.318L8.818 1.939a1.5 1.5 0 0 0-.318-.242Z" />
												</svg>
											)}
											<TextField
												autoFocus
												className="min-w-0 flex-1"
												aria-label={t(
													entryKind === "folder"
														? "skills.editor.folderPath"
														: "skills.editor.filePath",
												)}
											>
												<Input
													value={newPath}
													onChange={(event) => setNewPath(event.target.value)}
													onFocus={(event) => event.target.select()}
													onKeyDown={(event) => {
														if (event.key === "Escape") {
															event.preventDefault();
															setNewPath(null);
															setRenamingPath(null);
															setPathError(false);
														}
													}}
												/>
											</TextField>
										</div>
										{pathError ? (
											<p
												role="alert"
												className="mt-1 text-caption-sm text-terminal-red"
											>
												{t("skills.editor.pathError")}
											</p>
										) : null}
									</form>
								) : null
							}
							onSelectFolder={setSelectedPath}
							isDisabled={mutation.isPending}
							onAction={(action, path) => {
								if (action === "delete") {
									setDeletingPath(path);
									return;
								}
								setEntryKind(files[path] === undefined ? "folder" : "file");
								setRenamingPath(path);
								setSelectedPath(path);
								setEntryParent(parentDirectory(path));
								setNewPath(path.slice(path.lastIndexOf("/") + 1));
								setFilter("");
								setPathError(false);
							}}
							paths={paths}
							selectedPath={selectedPath}
							onSelect={(path) => {
								setActivePath(path);
								setSelectedPath(path);
								setPreview(false);
							}}
						/>
						<button
							type="button"
							aria-label={t("skills.editor.selectRoot")}
							className="min-h-8 w-full flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
							onClick={() => {
								setSelectedPath("");
								setNewPath(null);
								setRenamingPath(null);
							}}
						/>
						{paths.length === 0 && newPath === null ? (
							<p className="text-body-sm text-mute">
								{t("skills.editor.noFiles")}
							</p>
						) : null}
					</aside>
				}
			>
				<section
					aria-label={t("skills.editor.document")}
					className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card"
				>
					<div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2">
						<span className="truncate font-mono text-body-sm text-charcoal">
							{activePath}
						</span>
						{markdown ? (
							<div className="flex gap-1">
								<Button
									size="sm"
									variant={preview ? "ghost" : "tertiary"}
									aria-pressed={!preview}
									onPress={() => setPreview(false)}
								>
									{t("skills.editor.edit")}
								</Button>
								<Button
									size="sm"
									variant={preview ? "tertiary" : "ghost"}
									aria-pressed={preview}
									onPress={() => setPreview(true)}
								>
									{t("skills.editor.preview")}
								</Button>
							</div>
						) : null}
					</div>
					<div
						className={cn("min-h-0 flex-1", preview && markdown && "hidden")}
					>
						{activePath ? (
							<CodeEditor
								path={activePath}
								value={content}
								isReadOnly={mutation.isPending}
								onChange={(value) => {
									setFiles((draft) => ({ ...draft, [activePath]: value }));
									setDirty(true);
								}}
							/>
						) : (
							<p className="p-6 text-body-sm text-mute">
								{t("skills.editor.noDocument")}
							</p>
						)}
					</div>
					{preview && markdown ? (
						<article className="min-h-0 flex-1 overflow-auto break-words p-6 text-body-sm leading-7 text-ink [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&>h2]:my-4 [&>h2]:text-xl [&>h2]:font-semibold [&_h3]:my-3 [&_h3]:font-semibold [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-surface-soft [&_pre]:p-4 [&_blockquote]:border-l-2 [&_blockquote]:border-hairline [&_blockquote]:pl-4 [&_a]:underline">
							{frontmatter ? (
								<section
									aria-label={t("skills.editor.metadata")}
									className="mb-6 rounded-lg border border-hairline bg-surface-soft px-4 py-3"
								>
									<h2 className="mb-3 text-body-sm font-medium text-charcoal">
										{t("skills.editor.metadata")}
									</h2>
									<dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-x-4 gap-y-2 font-mono text-body-sm leading-relaxed">
										{Object.entries(readFrontmatter(frontmatter) ?? {}).map(
											([field, value]) => (
												<div key={field} className="contents">
													<dt className="text-charcoal">{field}</dt>
													<dd className="min-w-0 whitespace-pre-wrap break-words text-ink">
														{value}
													</dd>
												</div>
											),
										)}
									</dl>
								</section>
							) : null}
							<ReactMarkdown>
								{frontmatter ? content.slice(frontmatter.length) : content}
							</ReactMarkdown>
						</article>
					) : null}
				</section>
			</SkillEditorLayout>
			<div className="border-t border-hairline px-4 py-2 text-caption-sm text-mute">
				{saveError ? (
					<p role="alert" className="text-terminal-red">
						{t("skills.editor.saveFailed")}
					</p>
				) : (
					<p>
						{metadata
							? t("skills.editor.folderHint", { name: metadata.name })
							: t("skills.editor.metadataHint")}
					</p>
				)}
			</div>
			<AlertDialog
				isOpen={deletingPath !== null}
				onOpenChange={(open) => {
					if (!open) setDeletingPath(null);
				}}
				title={t("skills.editor.deleteTitle", { path: deletingPath })}
				description={t("skills.editor.deleteDescription")}
				confirmText={t("skills.editor.delete")}
				isConfirmDisabled={mutation.isPending}
				onConfirm={deleteEntry}
			/>
			<AlertDialog
				isOpen={confirmExit}
				onOpenChange={setConfirmExit}
				title={t("skills.editor.discardTitle")}
				description={t("skills.editor.discardDescription")}
				confirmText={t("skills.editor.discard")}
				onConfirm={() => navigate("/skills")}
			/>
		</main>
	);
};

export { SkillEditorPage };
