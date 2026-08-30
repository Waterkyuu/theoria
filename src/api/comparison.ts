import { invokeWithResponseSchema } from "@/api/ipc";
import {
	type ComparisonCursor,
	CompiledComparisonHistoryDetailSchema,
	CompiledComparisonHistoryPageSchema,
	CompiledSaveComparisonHistoryResponseSchema,
	type SaveComparisonHistoryRequest,
} from "@/types/comparison";

/**
 * Persists one completed comparison and returns its history identifier.
 * @example await saveComparisonHistory({ query, results });
 */
const saveComparisonHistory = (request: SaveComparisonHistoryRequest) =>
	invokeWithResponseSchema(
		"save_comparison_history",
		CompiledSaveComparisonHistoryResponseSchema,
		{ request },
	);

/**
 * Loads one bounded newest-first page without response bodies.
 * @example await listComparisonHistory(null, 30);
 */
const listComparisonHistory = (
	cursor: ComparisonCursor | null = null,
	limit = 30,
) =>
	invokeWithResponseSchema(
		"list_comparison_history",
		CompiledComparisonHistoryPageSchema,
		{ request: { cursor, limit } },
	);

/**
 * Loads one complete comparison for the history detail surface.
 * @example await getComparisonHistory(42);
 */
const getComparisonHistory = (id: number) =>
	invokeWithResponseSchema(
		"get_comparison_history",
		CompiledComparisonHistoryDetailSchema,
		{ request: { id } },
	);

export { getComparisonHistory, listComparisonHistory, saveComparisonHistory };
