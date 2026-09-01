import { useTranslation } from "react-i18next";
import { RenameModal as SharedRenameModal } from "@/components/share/rename-modal";

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

	return (
		<SharedRenameModal
			cancelText={t("common.cancel")}
			description={t("comparisonHistory.renameDescription", { query })}
			initialName={query}
			isOpen={isOpen}
			label={t("comparisonHistory.renameLabel")}
			onOpenChange={onOpenChange}
			onRename={async () => true}
			saveText={t("comparisonHistory.renameSave")}
			title={t("comparisonHistory.renameTitle")}
		/>
	);
};

export { RenameModal };
