import { toast } from "@heroui/react";
import { ZodError } from "zod";
import i18n from "@/i18n";

/**
 * Normalizes unknown JavaScript and Tauri IPC errors into a user-safe string.
 *
 * @example
 * getErrorMessage(error, "Request failed");
 */
const getErrorMessage = (
	error: unknown,
	fallback = i18n.t("errors.requestFailed"),
): string => {
	if (error instanceof ZodError) {
		return i18n.t("errors.invalidData");
	}
	if (error instanceof Error && error.message) {
		return error.message;
	}
	if (typeof error === "object" && error !== null && "message" in error) {
		return String(error.message);
	}
	return fallback;
};

/**
 * Keeps diagnostic logging separate from the optional user-facing toast while
 * preserving the original error for callers that need to rethrow or inspect it.
 *
 * @example
 * handleError(error, "Failed to save settings", true, "Settings could not be saved");
 */
const handleError = (
	error: unknown,
	logMessage?: string,
	showToast = false,
	toastMessage?: string,
): unknown => {
	const errorMessage = getErrorMessage(error, toastMessage);
	console.error(logMessage ?? errorMessage, error);

	if (showToast) {
		toast.danger(toastMessage ?? errorMessage);
	}

	return error;
};

export { getErrorMessage, handleError };
