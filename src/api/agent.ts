import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentActivitiesResponse,
	type AgentProcessStates,
	CompiledAgentActivitiesResponseSchema,
	CompiledAgentProcessStatesSchema,
} from "@/types/agent";

/** Reads the latest cached task lifecycle snapshot from the native monitor. */
const checkAgentActivities = () =>
	invokeWithResponseSchema(
		"check_agent_activities",
		CompiledAgentActivitiesResponseSchema,
	);

/**
 * Subscribes to task snapshots emitted after a supported Agent source changes.
 *
 * @example
 * onAgentActivitiesChanged(setAgentActivities);
 */
const onAgentActivitiesChanged = (
	listener: (response: AgentActivitiesResponse) => void,
) =>
	listenWithResponseSchema(
		"agent-activities-changed",
		CompiledAgentActivitiesResponseSchema,
		listener,
	);

/** Reads one lightweight running-process snapshot for every supported Agent. */
const checkAgentProcesses = () =>
	invokeWithResponseSchema(
		"check_agent_processes",
		CompiledAgentProcessStatesSchema,
	);

/**
 * Subscribes to process snapshots emitted only after a supported Agent starts or stops.
 *
 * @example
 * onAgentProcessStatesChanged(setAgentProcessStates);
 */
const onAgentProcessStatesChanged = (
	listener: (states: AgentProcessStates) => void,
) =>
	listenWithResponseSchema(
		"agent-process-states-changed",
		CompiledAgentProcessStatesSchema,
		listener,
	);

export {
	checkAgentActivities,
	checkAgentProcesses,
	onAgentActivitiesChanged,
	onAgentProcessStatesChanged,
};
