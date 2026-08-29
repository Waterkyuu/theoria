/**
 * Support by reicon
 * https://reicon.dev
 */

type Agent =
	| "claude"
	| "codex"
	| "workbuddy"
	| "opencode"
	| "zai"
	| "qoder"
	| "kimi"
	| "deepseek"
	| "antigravity"
	| "grok"
	| "cline";

type AgentIcon = {
	name: Agent;
	width?: number;
	height?: number;
};

export const AgentIcon = ({ name, width = 24, height = 24 }: AgentIcon) => {
	return (
		<img
			src={`https://cdn.reicon.dev/logos/${name}/original.svg`}
			alt={name}
			width={width}
			height={height}
		/>
	);
};
