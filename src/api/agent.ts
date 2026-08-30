import { invokeWithResponseSchema, listenWithResponseSchema } from "@/api/ipc";
import {
	type AgentActivitiesResponse,
	type AgentProcessStates,
	agentActivitiesResponseSchema,
	agentProcessStatesSchema,
} from "@/types/agent";

/** Reads the latest cached task lifecycle snapshot from the native monitor. */
const checkAgentActivities = () =>
	invokeWithResponseSchema(
		"check_agent_activities",
		agentActivitiesResponseSchema,
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
		agentActivitiesResponseSchema,
		listener,
	);

/** Reads one lightweight running-process snapshot for every supported Agent. */
const checkAgentProcesses = () =>
	invokeWithResponseSchema("check_agent_processes", agentProcessStatesSchema);

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
		agentProcessStatesSchema,
		listener,
	);

export {
	checkAgentActivities,
	checkAgentProcesses,
	onAgentActivitiesChanged,
	onAgentProcessStatesChanged,
};
