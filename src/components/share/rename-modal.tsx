import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { ModalProvider } from "@/components/ui/modal-provider";

type RenameModalProps = {
	/** Guidance shown below the modal title. */
	description: string;
	/** Current persisted name restored whenever editing is cancelled. */
	initialName: string;
	/** Controls whether an external action menu has opened the modal. */
	isOpen: boolean;
	/** Disables repeated submissions while persistence is in progress. */
	isPending?: boolean;
	/** Accessible label for the name input. */
	label: string;
	/** Text shown on the secondary close action. */
	cancelText: string;
	/** Updates the controlled modal state. */
	onOpenChange: (isOpen: boolean) => void;
	/** Persists a trimmed name and reports whether the modal may close. */
	onRename: (name: string) => Promise<boolean>;
	/** Text shown on the primary save action. */
	saveText: string;
	/** Accessible modal heading. */
	title: string;
};

/**
 * Shares rename form behavior while callers retain domain copy and persistence.
 *
 * @example
 * <RenameModal initialName="Task" isOpen onRename={renameTask} {...copy} />
 */
const RenameModal = ({
	cancelText,
	description,
	initialName,
	isOpen,
	isPending = false,
	label,
	onOpenChange,
	onRename,
	saveText,
	title,
}: RenameModalProps) => {
	const [name, setName] = useState(initialName);
	const trimmedName = name.trim();

	/** Restores persisted text after cancellation so stale edits never reopen. */
	const handleOpenChange = (nextIsOpen: boolean) => {
		if (!nextIsOpen) setName(initialName);
		onOpenChange(nextIsOpen);
	};

	/** Closes only after the caller confirms persistence succeeded. */
	const handleRename = async () => {
		if (!trimmedName || isPending) return;
		if (await onRename(trimmedName)) handleOpenChange(false);
	};

	return (
		<ModalProvider
			description={description}
			footer={
				<>
					<Button onPress={() => handleOpenChange(false)} variant="tertiary">
						{cancelText}
					</Button>
					<Button
						isDisabled={!trimmedName || isPending}
						onPress={() => handleRename()}
						variant="primary"
					>
						{saveText}
					</Button>
				</>
			}
			isOpen={isOpen}
			onOpenChange={handleOpenChange}
			title={title}
		>
			<TextField className="flex flex-col gap-xs text-body-sm font-medium text-ink">
				<Label>{label}</Label>
				<Input
					className="rounded-md border border-hairline bg-canvas px-md py-sm font-normal outline-none transition-colors placeholder:text-mute focus:border-hairline-strong focus:ring-2 focus:ring-focus-ring"
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</TextField>
		</ModalProvider>
	);
};

export type { RenameModalProps };
export { RenameModal };
