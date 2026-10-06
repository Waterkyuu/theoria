/**
 * Formats a measured latency without hiding sub-second precision.
 *
 * @example
 * formatDuration(2450); // "2.45 s"
 */
const formatDuration = (
	milliseconds: number | null,
	unavailable = "—",
	compact = false,
) => {
	if (milliseconds === null) return unavailable;
	if (compact) {
		const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
	}
	if (milliseconds < 1000) {
		return `${milliseconds} ms`;
	}
	return `${(milliseconds / 1000).toFixed(2)} s`;
};

const formatToolPayload = (value: unknown) => {
	if (value === null || value === undefined) return "—";
	return typeof value === "string" ? value : JSON.stringify(value, null, 2);
};

export { formatDuration, formatToolPayload };
