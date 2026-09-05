import type { ReactElement } from "react";
import {
	Dropdown,
	type DropdownPopoverProps,
	Header,
	Label,
	Separator,
} from "@heroui/react";
import { useTranslation } from "react-i18next";

type DropdownMenuItemProps<T extends string> = {
	/** Nested actions displayed in a submenu. */
	children?: readonly DropdownMenuItemProps<T>[];
	/** Whether the item uses the danger visual treatment. */
	danger?: boolean;
	/** Optional decorative icon rendered before the item label. */
	icon?: ReactElement;
	/** Stable business action returned by the menu-level callback. */
	id: T;
	/** Whether the item is disabled. */
	isDisabled?: boolean;
	/** Translation key used as both the visible label and accessible text value. */
	labelKey: string;
	/** Whether to insert a separator before this item. */
	separated?: boolean;
	/** Test identifier rendered as data-testid. */
	testId?: string;
};

type DropdownMenuProps<T extends string> = {
	/** Additional classes applied to the floating popover. */
	className?: string;
	/** Whether the menu closes after an item is selected. Defaults to true. */
	closeOnSelect?: boolean;
	/** Translation key rendered as the optional menu header. */
	headerKey?: string;
	/** Additional classes applied to every menu item. */
	itemClassName?: string;
	/** Business actions rendered by the menu. */
	items: readonly DropdownMenuItemProps<T>[];
	/** Additional classes applied to the menu list. */
	menuClassName?: string;
	/** Distance in pixels between the trigger and popover. Defaults to 4. */
	offset?: DropdownPopoverProps["offset"];
	/** Receives the selected business action for centralized dispatch. */
	onAction: (action: T) => void;
	/** Preferred popover placement. Defaults to bottom start. */
	placement?: DropdownPopoverProps["placement"];
	/** Pressable element that opens the menu, such as a HeroUI Button. */
	trigger: ReactElement;
};

/**
 * Renders a constrained business action menu with translated labels and stable action identifiers.
 *
 * @example
 * <DropdownMenu
 *   items={[{ id: 'delete', labelKey: 'project.delete', danger: true }]}
 *   onAction={(action) => setActiveDialog(action)}
 *   trigger={<Button aria-label="Project actions">Actions</Button>}
 * />
 */
const DropdownMenu = <T extends string>({
	className,
	closeOnSelect = true,
	headerKey,
	itemClassName,
	items,
	menuClassName,
	offset = 4,
	onAction,
	placement = "bottom start",
	trigger,
}: DropdownMenuProps<T>) => {
	const { t } = useTranslation();

	const renderedItems = items.flatMap((item, index) => {
		const elements: ReactElement[] = [];
		const label = t(item.labelKey);

		if (item.separated && index > 0) {
			elements.push(<Separator key={`${item.id}-separator`} />);
		}

		const menuItem = (
			<Dropdown.Item
				className={itemClassName}
				data-testid={item.testId}
				id={item.id}
				isDisabled={item.isDisabled}
				key={item.id}
				textValue={label}
				variant={item.danger ? "danger" : undefined}
			>
				{item.icon}
				<Label className={item.danger ? "text-danger" : undefined}>
					{label}
				</Label>
				{item.children ? <Dropdown.SubmenuIndicator /> : null}
			</Dropdown.Item>
		);
		elements.push(
			item.children ? (
				<Dropdown.SubmenuTrigger key={item.id}>
					{menuItem}
					<Dropdown.Popover>
						<Dropdown.Menu onAction={(key) => onAction(key as T)}>
							{item.children.map((child) => (
								<Dropdown.Item
									key={child.id}
									id={child.id}
									textValue={t(child.labelKey)}
								>
									<Label>{t(child.labelKey)}</Label>
								</Dropdown.Item>
							))}
						</Dropdown.Menu>
					</Dropdown.Popover>
				</Dropdown.SubmenuTrigger>
			) : (
				menuItem
			),
		);

		return elements;
	});

	return (
		<Dropdown>
			{trigger}
			<Dropdown.Popover
				className={className}
				offset={offset}
				placement={placement}
			>
				<Dropdown.Menu
					className={menuClassName}
					onAction={(key) => {
						const action = key as T;
						onAction(action);
					}}
					shouldCloseOnSelect={closeOnSelect}
				>
					{headerKey ? (
						<Dropdown.Section>
							<Header>{t(headerKey)}</Header>
							{renderedItems}
						</Dropdown.Section>
					) : (
						renderedItems
					)}
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
};

export type { DropdownMenuItemProps, DropdownMenuProps };
export { DropdownMenu };
