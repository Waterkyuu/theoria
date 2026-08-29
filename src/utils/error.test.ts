import { Toast } from "@heroui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import i18n from "@/i18n";
import { getErrorMessage, handleError } from "./error";

vi.mock("@heroui/react", () => ({
	Toast: {
		toast: {
			danger: vi.fn(),
		},
	},
}));

describe("error utilities", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("extracts messages from standard and error-shaped objects", () => {
		expect(getErrorMessage(new Error("Request failed"))).toBe("Request failed");
		expect(getErrorMessage({ message: "IPC failed" })).toBe("IPC failed");
	});

	it("uses localized messages for validation and unknown errors", () => {
		const validation = z.string().safeParse(42);

		expect(validation.success).toBe(false);
		if (validation.success) {
			return;
		}

		expect(getErrorMessage(validation.error)).toBe(
			i18n.t("errors.invalidData"),
		);
		expect(getErrorMessage(null)).toBe(i18n.t("errors.requestFailed"));
	});

	it("logs the original error and optionally shows a friendly message", () => {
		const error = new Error("Sensitive details");
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		expect(handleError(error, "Comparison failed", true, "Please retry")).toBe(
			error,
		);
		expect(consoleError).toHaveBeenCalledWith("Comparison failed", error);
		expect(Toast.toast.danger).toHaveBeenCalledWith("Please retry");
	});
});
