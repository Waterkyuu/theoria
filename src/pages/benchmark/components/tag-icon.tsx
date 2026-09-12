import type { ComponentType, SVGProps } from "react";
import {
	AbbrApi,
	AbbrMl,
	AbbrSql,
	Alarm,
	Archive,
	BookOpen,
	Clock,
	Bug,
	Code,
	CodeCompare,
	Database,
	DatabaseMagnifier,
	FileCheck,
	FileMagnifier,
	Folder,
	FolderTree,
	Function,
	Gear,
	GearPlay,
	Globe,
	GraduationCap,
	ListCheck,
	LogoPython,
	Magnifier,
	Rocket,
	Speedometer,
	SquareChartColumn,
	Tag,
	Target,
	TargetDart,
	Terminal,
} from "@gravity-ui/icons";

const BENCHMARK_ICONS: Record<
	string,
	ComponentType<SVGProps<SVGSVGElement>>
> = {
	AbbrApi,
	AbbrMl,
	AbbrSql,
	Alarm,
	Archive,
	BookOpen,
	Bug,
	Clock,
	Code,
	CodeCompare,
	Database,
	DatabaseMagnifier,
	FileCheck,
	FileMagnifier,
	Folder,
	FolderTree,
	Function,
	Gear,
	GearPlay,
	Globe,
	GraduationCap,
	ListCheck,
	LogoPython,
	Magnifier,
	Rocket,
	Speedometer,
	SquareChartColumn,
	Tag,
	Target,
	TargetDart,
	Terminal,
};

type TagIconProps = {
	/** Persisted Gravity export name. */
	name?: string;
};

/**
 * Keeps unknown imports readable with the shared Tag glyph.
 *
 * @example
 * <TagIcon name="Code" />
 */
const TagIcon = ({ name = "Tag" }: TagIconProps) => {
	const Icon = BENCHMARK_ICONS[name] ?? Tag;
	return <Icon aria-hidden="true" className="size-4 shrink-0" />;
};

export { TagIcon, BENCHMARK_ICONS };
