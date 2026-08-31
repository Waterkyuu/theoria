import { useState } from "react";
import { FolderPlus } from "@gravity-ui/icons";
import { Button, Tabs } from "@heroui/react";
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
	const renderWorkspaceNameField = () => (
		<label className="flex flex-col gap-xs text-body-sm font-medium text-ink">
			{t("workspaceSidebar.workspaceNameLabel")}
			<input
				className="rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
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
	);

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
				<Tabs
					onSelectionChange={(key) =>
						setSourceKind(key === "external" ? "external" : "managed")
					}
					selectedKey={sourceKind}
				>
					<Tabs.ListContainer className="rounded-lg">
						<Tabs.List
							aria-label={t("workspaceSidebar.workspaceSourceLabel")}
							className="w-full"
						>
							<Tabs.Tab
								className="rounded-md data-[selected=true]:bg-canvas data-[selected=true]:text-ink data-[selected=true]:shadow-sm"
								id="external"
							>
								{t("workspaceSidebar.workspaceSource.external")}
							</Tabs.Tab>
							<Tabs.Tab
								className="rounded-md data-[selected=true]:bg-canvas data-[selected=true]:text-ink data-[selected=true]:shadow-sm"
								id="managed"
							>
								<Tabs.Separator />
								{t("workspaceSidebar.workspaceSource.managed")}
							</Tabs.Tab>
						</Tabs.List>
					</Tabs.ListContainer>
					<Tabs.Panel className="mt-2 flex flex-col gap-3 p-0" id="external">
						{renderWorkspaceNameField()}
						<div className="flex flex-col gap-xs">
							<span>{t("workspaceSidebar.workspacePathLabel")}</span>
							<button
								className="flex min-h-24 flex-col items-center justify-center gap-sm rounded-md border border-hairline bg-canvas px-lg py-md text-center text-body-sm font-normal text-charcoal outline-none transition-colors hover:border-hairline-strong hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-focus-ring"
								onClick={() => selectSourceDirectory()}
								type="button"
							>
								<FolderPlus
									aria-hidden="true"
									className="size-5 shrink-0 text-mute"
								/>
								<span className={sourcePath ? "break-all text-ink" : undefined}>
									{sourcePath || t("workspaceSidebar.chooseFolder")}
								</span>
							</button>
						</div>
					</Tabs.Panel>
					<Tabs.Panel className="mt-2 p-0" id="managed">
						{renderWorkspaceNameField()}
					</Tabs.Panel>
				</Tabs>
			</div>
			{createWorkspaceMutation.error ? (
				<p className="text-body-sm text-terminal-red" role="alert">
					{t("workspaceSidebar.createWorkspaceFailed")}
				</p>
			) : null}
		</ModalProvider>
	);
};

export { NewWorkspaceModal as default, NewWorkspaceModal };
