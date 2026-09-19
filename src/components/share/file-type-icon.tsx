import { getFileIcon } from "@/utils/file-icon";
import "@/styles/file-type-icon.css";

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
	const { src, light, color } = getFileIcon(path);
	if (color) {
		return (
			<span
				aria-hidden="true"
				className="file-type-icon-tinted size-4 shrink-0"
				style={{ backgroundColor: color, maskImage: `url("${src}")` }}
			/>
		);
	}
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
