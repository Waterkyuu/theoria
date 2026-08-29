import { useState } from "react";
import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { ModalProvider } from "@/components/ui/modal-provider";

type RenameModalProps = {
	/** Controls whether the rename modal is visible. */
	isOpen: boolean;
	/** Updates the controlled modal state. */
	onOpenChange: (isOpen: boolean) => void;
	/** Current record query shown in the rename guidance. */
	query: string;
};

/**
 * Keeps rename-specific copy and modal composition out of the history row.
 * @example <RenameModal isOpen={isOpen} onOpenChange={setIsOpen} query="Compare agents" />
 */
const RenameModal = ({ isOpen, onOpenChange, query }: RenameModalProps) => {
	const { t } = useTranslation();
	const [name, setName] = useState(query);
	const trimmedName = name.trim();

	/**
	 * Resets unfinished edits whenever the controlled modal closes.
	 * @example handleOpenChange(false);
	 */
	const handleOpenChange = (nextIsOpen: boolean) => {
		if (!nextIsOpen) {
			setName(query);
		}
		onOpenChange(nextIsOpen);
	};

	/**
	 * Closes the UI only after a non-empty record name is provided.
	 * @example handleRename();
	 */
	const handleRename = () => {
		if (!trimmedName) {
			return;
		}
		handleOpenChange(false);
	};

	return (
		<ModalProvider
			description={t("comparisonHistory.renameDescription", { query })}
			footer={
				<>
					<Button onPress={() => handleOpenChange(false)} variant="tertiary">
						{t("common.cancel")}
					</Button>
					<Button
						isDisabled={!trimmedName}
						onPress={handleRename}
						variant="primary"
					>
						{t("comparisonHistory.renameSave")}
					</Button>
				</>
			}
			isOpen={isOpen}
			onOpenChange={handleOpenChange}
			title={t("comparisonHistory.renameTitle")}
		>
			<label className="flex flex-col gap-xs text-body-sm font-medium text-ink">
				{t("comparisonHistory.renameLabel")}
				<input
					className="rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none transition-colors placeholder:text-mute focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</label>
		</ModalProvider>
	);
};

export { RenameModal };
