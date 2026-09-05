import {
	FILE_ICON_CONFIGS,
	FILE_ICON_EXTENSIONS,
	FILE_ICON_FILENAMES,
	type FileIconName,
} from "@/constants/file-icons";

/**
 * Resolves exact names and compound suffixes before generic extensions so framework files keep their identity.
 *
 * @example
 * getFileIconName("src/App.tsx")
 */
const getFileIconName = (path: string): FileIconName => {
	const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase();
	const exact = FILE_ICON_FILENAMES.get(name);
	if (exact) return exact;
	if (/^(?:dockerfile|containerfile)(?:\.|$)/.test(name)) return "docker";
	if (name.startsWith(".env.")) return "settings";
	const config = /^([^.]+)\.config\./.exec(name)?.[1];
	const configIcon = config ? FILE_ICON_CONFIGS.get(config) : undefined;
	if (configIcon) return configIcon;
	const parts = name.split(".");
	for (let index = 1; index < parts.length; index++) {
		const extension = parts.slice(index).join(".");
		const icon = FILE_ICON_EXTENSIONS.get(extension);
		if (icon) return icon;
	}
	return "file";
};

export { getFileIconName };
