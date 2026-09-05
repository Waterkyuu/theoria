import { getFileIconName } from "@/utils/file-icon";
import {
	FILE_ICON_LIGHT_VARIANTS,
	FILE_TYPE_ICONS,
} from "@/constants/file-icons";

type FileTypeIconProps = {
	/** Relative file path used to resolve language and framework-specific icons. */
	path: string;
};

/**
 * Uses locally bundled SVGs and light variants without adding a runtime icon library.
 *
 * @example
 * <FileTypeIcon
 *   path="src/App.tsx"
 * />
 */
const FileTypeIcon = ({ path }: FileTypeIconProps) => {
	const name = getFileIconName(path);
	const src = FILE_TYPE_ICONS[name];
	const light = FILE_ICON_LIGHT_VARIANTS[name];
	return light ? (
		<>
			<img
				alt=""
				aria-hidden="true"
				src={light}
				className="size-4 shrink-0 dark:hidden"
			/>
			<img
				alt=""
				aria-hidden="true"
				src={src}
				className="hidden size-4 shrink-0 dark:block"
			/>
		</>
	) : (
		<img alt="" aria-hidden="true" src={src} className="size-4 shrink-0" />
	);
};

export { FileTypeIcon };
