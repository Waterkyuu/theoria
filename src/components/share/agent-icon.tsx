import { cn } from "cnfast";
import type { AGENT_KINDS } from "@/constants/agent";

/**
 * Support by reicon
 * https://reicon.dev
 */

type Agent = (typeof AGENT_KINDS)[number];

type AgentIcon = {
	/** Agent identifier used to resolve its logo asset. */
	name: Agent;
	/** Rendered icon width in pixels. */
	width?: number;
	/** Rendered icon height in pixels. */
	height?: number;
	/** Additional layout classes; icon color must use an approved semantic token. */
	className?: string;
};

/**
 * Renders external agent artwork as a monochrome mask so logos follow the shared icon palette.
 *
 * @example
 * <AgentIcon name="codex" className="text-mute" />
 */
const AgentIcon = ({ name, width = 24, height = 24, className }: AgentIcon) => {
	const src = `https://cdn.reicon.dev/logos/${name}/original.svg`;

	return (
		<span
			aria-label={name}
			className={cn(
				"inline-block shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] text-ink",
				className,
			)}
			role="img"
			style={{
				width,
				height,
				maskImage: `url("${src}")`,
				WebkitMaskImage: `url("${src}")`,
			}}
		/>
	);
};

export { AgentIcon };
