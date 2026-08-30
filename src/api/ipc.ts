import { type InvokeArgs, invoke } from "@tauri-apps/api/core";
import { type EventName, listen } from "@tauri-apps/api/event";
import type * as z from "zod";
import { handleError } from "@/utils/error";

/**
 * Validates an unknown Tauri command response before exposing it to frontend code.
 *
 * @example
 * invokeWithResponseSchema("check_status", statusSchema);
 */
const invokeWithResponseSchema = async <TSchema extends z.ZodType>(
	command: string,
	responseSchema: TSchema,
	args?: InvokeArgs,
): Promise<z.infer<TSchema>> => {
	const response = await invoke<unknown>(command, args);

	return responseSchema.parse(response);
};

/**
 * Drops malformed native event responses so invalid data never reaches state updates.
 *
 * @example
 * listenWithResponseSchema("status-changed", statusSchema, setStatus);
 */
const listenWithResponseSchema = <TSchema extends z.ZodType>(
	eventName: EventName,
	responseSchema: TSchema,
	listener: (response: z.infer<TSchema>) => void,
) =>
	listen<unknown>(eventName, (event) => {
		const response = responseSchema.safeParse(event.payload);

		if (!response.success) {
			handleError(response.error, `Invalid IPC event response: ${event.event}`);
			return;
		}

		listener(response.data);
	});

export { invokeWithResponseSchema, listenWithResponseSchema };
