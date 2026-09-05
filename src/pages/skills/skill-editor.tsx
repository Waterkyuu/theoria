import { type FormEvent, useState } from "react";
import {
	ChevronRight,
	File,
	FilePlus,
	Folder,
	FolderPlus,
	LayoutSplitSideContentLeft,
	LayoutSplitSideContentRight,
} from "@gravity-ui/icons";
import { Button, Input, Label, TextField, Toast, Tooltip } from "@heroui/react";
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

type FileTreeProps = {
	/** Relative file paths; directories are derived from their shared prefixes. */
	paths: string[];
	/** Current prefix, empty at the skill root. */
	prefix?: string;
	/** Active document to mark in the directory. */
	activePath: string;
	/** Switches documents without discarding edits. */
	onSelect: (path: string) => void;
};

/**
 * Keeps folder expansion local while the draft remains owned by the editor page.
 *
 * @example
 * <FileTree paths={["SKILL.md"]} activePath="SKILL.md" onSelect={setPath} />
 */
const FileTree = ({
	paths,
	prefix = "",
	activePath,
	onSelect,
}: FileTreeProps) => {
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
					<li key={path}>
						{isFolder ? (
							<details className="group" open>
								<summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-body-sm text-charcoal outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden">
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
									/>
								</div>
							</details>
						) : (
							<button
								type="button"
								aria-current={activePath === path ? "true" : undefined}
								onClick={() => onSelect(path)}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-body-sm outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring",
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

const SkillEditorPage = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const mutation = useCreatePlatformSkill();
	const [files, setFiles] = useState<Record<string, string>>({
		"SKILL.md": "---\nname: \ndescription: \n---\n",
	});
	const [directories, setDirectories] = useState<string[]>([]);
	const [entryKind, setEntryKind] = useState<"file" | "folder">("file");
	const [activePath, setActivePath] = useState("SKILL.md");
	const [preview, setPreview] = useState(false);
	const [filter, setFilter] = useState("");
	const [newPath, setNewPath] = useState<string | null>(null);
	const [pathError, setPathError] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [confirmExit, setConfirmExit] = useState(false);
	const [side, setSide] = useState(() =>
		localStorage.getItem("skill-editor-directory-side") === "left"
			? "left"
			: "right",
	);
	const metadata = readMetadata(files["SKILL.md"]);
	const paths = [
		...Object.keys(files),
		...directories.map((path) => `${path}/`),
	].filter((path) => path.toLowerCase().includes(filter.toLowerCase()));
	const markdown = /\.md$/i.test(activePath);
	const content = files[activePath];
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
		const path = newPath?.trim() ?? "";
		const lower = path.toLowerCase();
		const fileConflict = Object.keys(files).some((file) => {
			const existing = file.toLowerCase();
			return (
				existing === lower ||
				existing.startsWith(`${lower}/`) ||
				lower.startsWith(`${existing}/`)
			);
		});
		const directoryConflict = directories.some((directory) => {
			const existing = directory.toLowerCase();
			return existing === lower || existing.startsWith(`${lower}/`);
		});
		if (
			path.length > 240 ||
			!path.split("/").every(isPortableName) ||
			fileConflict ||
			directoryConflict ||
			Object.keys(files).length + directories.length >= 100
		) {
			setPathError(true);
			return;
		}
		if (entryKind === "folder") {
			setDirectories([...directories, path]);
		} else {
			setFiles({ ...files, [path]: "" });
			setActivePath(path);
			setPreview(false);
		}
		setNewPath(null);
		setPathError(false);
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
			<div
				className={cn(
					"flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row",
					side === "left" && "md:flex-row-reverse",
				)}
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
						<CodeEditor
							path={activePath}
							value={content}
							isReadOnly={mutation.isPending}
							onChange={(value) => {
								setFiles((draft) => ({ ...draft, [activePath]: value }));
								setDirty(true);
							}}
						/>
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
				<aside
					aria-label={t("skills.editor.directory")}
					className="flex max-h-64 min-h-0 flex-col gap-3 overflow-y-auto border-x border-hairline bg-surface-card p-3 md:max-h-none md:w-64 md:shrink-0 lg:w-72"
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
					{newPath !== null ? (
						<form onSubmit={addEntry} className="flex flex-col gap-2">
							<TextField autoFocus>
								<Label>
									{t(
										entryKind === "folder"
											? "skills.editor.folderPath"
											: "skills.editor.filePath",
									)}
								</Label>
								<Input
									value={newPath}
									onChange={(event) => setNewPath(event.target.value)}
									placeholder={
										entryKind === "folder"
											? "references"
											: "references/guide.md"
									}
								/>
							</TextField>
							<p className="text-caption-sm text-mute">
								{t("skills.editor.pathHint")}
							</p>
							{pathError ? (
								<p role="alert" className="text-caption-sm text-terminal-red">
									{t("skills.editor.pathError")}
								</p>
							) : null}
							<div className="flex gap-2">
								<Button size="sm" type="submit" isDisabled={mutation.isPending}>
									{t(
										entryKind === "folder"
											? "skills.editor.createFolder"
											: "skills.editor.createFile",
									)}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onPress={() => {
										setNewPath(null);
										setPathError(false);
									}}
								>
									{t("common.cancel")}
								</Button>
							</div>
						</form>
					) : null}
					<FileTree
						paths={paths}
						activePath={activePath}
						onSelect={(path) => {
							setActivePath(path);
							setPreview(false);
						}}
					/>
					{paths.length === 0 ? (
						<p className="text-body-sm text-mute">
							{t("skills.editor.noFiles")}
						</p>
					) : null}
				</aside>
			</div>
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
