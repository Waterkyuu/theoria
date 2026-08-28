import { useState } from "react";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { ModalProvider } from "@/components/ui/modal-provider";

type NewWorkspaceModalProps = {
	/** Controls whether the new workspace modal is visible. */
	isOpen: boolean;
	/** Updates the controlled modal state. */
	onOpenChange: (isOpen: boolean) => void;
};

/**
 * Collects and validates a workspace name without adding display-only records.
 *
 * @example
 * <NewWorkspaceModal isOpen onOpenChange={setIsOpen} />
 */
const NewWorkspaceModal = ({
	isOpen,
	onOpenChange,
}: NewWorkspaceModalProps) => {
	const { t } = useTranslation();
	const [workspaceName, setWorkspaceName] = useState("");
	const trimmedWorkspaceName = workspaceName.trim();

	/**
	 * Clears an unfinished name whenever the modal closes.
	 *
	 * @example
	 * handleOpenChange(false);
	 */
	const handleOpenChange = (nextIsOpen: boolean) => {
		if (!nextIsOpen) {
			setWorkspaceName("");
		}
		onOpenChange(nextIsOpen);
	};

	/**
	 * Accepts only a visible workspace name before closing the creation UI.
	 *
	 * @example
	 * handleCreateWorkspace();
	 */
	const handleCreateWorkspace = () => {
		if (!trimmedWorkspaceName) {
			return;
		}
		handleOpenChange(false);
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
						isDisabled={!trimmedWorkspaceName}
						onPress={handleCreateWorkspace}
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
		</ModalProvider>
	);
};

export { NewWorkspaceModal as default, NewWorkspaceModal };
