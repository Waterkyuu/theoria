import { useState } from "react";
import { FolderOpen } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { ModalProvider } from "@/components/ui/modal-provider";
import { handleError } from "@/utils/error";
import { useCreateWorkspace } from "@/queries/workspace";
import type { Workspace } from "@/types/workspace";

type NewWorkspaceModalProps = {
	/** Controls whether the new workspace modal is visible. */
	isOpen: boolean;
	/** Updates the controlled modal state. */
	onOpenChange: (isOpen: boolean) => void;
	/** Opens the persisted Workspace after native creation succeeds. */
	onCreated: (workspace: Workspace) => void;
};

/**
 * Collects and validates a workspace name without adding display-only records.
 *
 * @example
 * <NewWorkspaceModal isOpen onCreated={openWorkspace} onOpenChange={setIsOpen} />
 */
const NewWorkspaceModal = ({
	isOpen,
	onCreated,
	onOpenChange,
}: NewWorkspaceModalProps) => {
	const { t } = useTranslation();
	const [workspaceName, setWorkspaceName] = useState("");
	const [sourceKind, setSourceKind] = useState<"managed" | "external">(
		"managed",
	);
	const [sourcePath, setSourcePath] = useState("");
	const createWorkspaceMutation = useCreateWorkspace();
	const trimmedWorkspaceName = workspaceName.trim();
	const trimmedSourcePath = sourcePath.trim();
	const canCreate =
		Boolean(trimmedWorkspaceName) &&
		(sourceKind === "managed" || Boolean(trimmedSourcePath));

	/** Opens the native directory picker and retains an absolute external source path. */
	const selectSourceDirectory = async () => {
		try {
			const selectedPath = await open({
				directory: true,
				multiple: false,
				title: t("workspaceSidebar.chooseFolderTitle"),
			});
			if (selectedPath) setSourcePath(selectedPath);
		} catch (error) {
			handleError(error, "Workspace directory selection failed");
		}
	};

	/**
	 * Clears an unfinished name whenever the modal closes.
	 *
	 * @example
	 * handleOpenChange(false);
	 */
	const handleOpenChange = (nextIsOpen: boolean) => {
		if (!nextIsOpen) {
			setWorkspaceName("");
			setSourceKind("managed");
			setSourcePath("");
		}
		onOpenChange(nextIsOpen);
	};

	/**
	 * Accepts only a visible workspace name before closing the creation UI.
	 *
	 * @example
	 * handleCreateWorkspace();
	 */
	const handleCreateWorkspace = async () => {
		if (!canCreate || createWorkspaceMutation.isPending) return;
		try {
			const workspace = await createWorkspaceMutation.mutateAsync(
				sourceKind === "managed"
					? { name: trimmedWorkspaceName, sourceKind }
					: {
							name: trimmedWorkspaceName,
							sourceKind,
							sourcePath: trimmedSourcePath,
						},
			);
			handleOpenChange(false);
			onCreated(workspace);
		} catch (error) {
			handleError(error, "Workspace creation failed");
		}
	};

	return (
		<ModalProvider
			description={t("workspaceSidebar.newWorkspaceDescription")}
			footer={
				<>
					<Button onPress={() => handleOpenChange(false)} variant="tertiary">
						{t("common.cancel")}
					</Button>
					<Button
						isDisabled={!canCreate || createWorkspaceMutation.isPending}
						onPress={() => handleCreateWorkspace()}
						variant="primary"
					>
						{t("workspaceSidebar.createWorkspace")}
					</Button>
				</>
			}
			isOpen={isOpen}
			onOpenChange={handleOpenChange}
			title={t("workspaceSidebar.newWorkspaceTitle")}
		>
			<div className="flex flex-col gap-xs text-body-sm font-medium text-ink">
				<span>{t("workspaceSidebar.workspaceSourceLabel")}</span>
				<div
					aria-label={t("workspaceSidebar.workspaceSourceLabel")}
					className="grid grid-cols-2 gap-xs"
					role="tablist"
				>
					{(["external", "managed"] as const).map((kind) => (
						<button
							aria-selected={sourceKind === kind}
							className={`rounded-md border px-md py-sm text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
								sourceKind === kind
									? "border-ink bg-surface-dark text-on-dark"
									: "border-hairline bg-canvas text-charcoal"
							}`}
							key={kind}
							onClick={() => setSourceKind(kind)}
							role="tab"
							type="button"
						>
							{t(`workspaceSidebar.workspaceSource.${kind}`)}
						</button>
					))}
				</div>
			</div>
			<label className="flex flex-col gap-xs text-body-sm font-medium text-ink">
				{t("workspaceSidebar.workspaceNameLabel")}
				<input
					className="rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none transition-colors focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
					onChange={(event) => setWorkspaceName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							handleCreateWorkspace();
						}
					}}
					value={workspaceName}
				/>
			</label>
			{sourceKind === "external" ? (
				<label className="flex flex-col gap-xs text-body-sm font-medium text-ink">
					{t("workspaceSidebar.workspacePathLabel")}
					<input
						aria-label={t("workspaceSidebar.workspacePathLabel")}
						className="rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none transition-colors focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
						onChange={(event) => setSourcePath(event.target.value)}
						placeholder={t("workspaceSidebar.workspacePathPlaceholder")}
						value={sourcePath}
					/>
					<button
						className="flex min-h-14 items-center justify-center gap-sm rounded-md border border-dashed border-hairline-strong bg-surface-soft px-md py-sm text-body-sm font-normal text-charcoal outline-none hover:border-ink hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
						onClick={() => selectSourceDirectory()}
						type="button"
					>
						<FolderOpen aria-hidden="true" className="size-4 shrink-0" />
						{t("workspaceSidebar.chooseFolder")}
					</button>
				</label>
			) : null}
			{createWorkspaceMutation.error ? (
				<p className="text-body-sm text-terminal-red" role="alert">
					{t("workspaceSidebar.createWorkspaceFailed")}
				</p>
			) : null}
		</ModalProvider>
	);
};

export { NewWorkspaceModal as default, NewWorkspaceModal };
