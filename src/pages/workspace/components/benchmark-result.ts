/** Maps persisted matrix results to the shared terminal-state palette.
 * @example benchmarkResultClass("passed")
 */
const benchmarkResultClass = (result: string) => {
	if (result === "passed") return "bg-terminal-green/10 text-terminal-green";
	if (result === "failed") return "bg-terminal-red/10 text-terminal-red";
	return "bg-surface-soft text-body";
};

export { benchmarkResultClass };
