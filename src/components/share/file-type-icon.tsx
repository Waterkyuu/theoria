import { getFileIcon } from "@/utils/file-icon";
import "@/styles/file-type-icon.css";

type FileTypeIconProps = {
	/** Relative file path used to resolve language and framework-specific icons. */
	path: string;
};

/**
 * Uses a bundled SVG as a monochrome mask so every file type shares the muted icon tone.
 *
 * @example
 * <FileTypeIcon
 *   path="src/App.tsx"
 * />
 */
const FileTypeIcon = ({ path }: FileTypeIconProps) => {
	const { src } = getFileIcon(path);

	return (
		<span
			aria-hidden="true"
			className="file-type-icon-tinted size-4 shrink-0 bg-current text-mute"
			style={{
				maskImage: `url("${src}")`,
				WebkitMaskImage: `url("${src}")`,
			}}
		/>
	);
};

export { FileTypeIcon };
