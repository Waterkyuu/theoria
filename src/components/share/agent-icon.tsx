import type { AGENT_KINDS } from "@/constants/agent";

/**
 * Support by reicon
 * https://reicon.dev
 */

type Agent = (typeof AGENT_KINDS)[number];

type AgentIcon = {
	name: Agent;
	width?: number;
	height?: number;
};

const ICON_SLUG_OVERRIDES: Partial<Record<Agent, string>> = {
	traecode: "trae",
};

export const AgentIcon = ({ name, width = 24, height = 24 }: AgentIcon) => {
	const iconSlug = ICON_SLUG_OVERRIDES[name] ?? name;

	return (
		<img
			src={`https://cdn.reicon.dev/logos/${iconSlug}/original.svg`}
			alt={name}
			width={width}
			height={height}
		/>
	);
};
