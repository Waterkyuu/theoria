import type { ComponentType, SVGProps } from "react";
import {
	Bug,
	Code,
	Database,
	FileCheck,
	FolderTree,
	Globe,
	ListCheck,
	Tag,
} from "@gravity-ui/icons";
const BENCHMARK_ICONS: Record<
	string,
	ComponentType<SVGProps<SVGSVGElement>>
> = { Bug, Code, Database, FileCheck, FolderTree, Globe, ListCheck, Tag };
type TagIconProps = { /** Persisted Gravity export name. */ name?: string };
/** Keeps unknown imports readable with the shared Tag glyph. @example <TagIcon name="Code" /> */
const TagIcon = ({ name = "Tag" }: TagIconProps) => {
	const Icon = BENCHMARK_ICONS[name] ?? Tag;
	return <Icon aria-hidden="true" className="size-4 shrink-0" />;
};
export { TagIcon, BENCHMARK_ICONS };
