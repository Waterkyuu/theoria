import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeBackendI18n } from ".";

describe("backend i18n synchronization", () => {
	afterEach(async () => {
		await i18n.changeLanguage("en-US");
	});

	it("sends the active language when synchronization starts", () => {
		const setLocale = vi.fn().mockResolvedValue(undefined);

		const stopSynchronization = initializeBackendI18n(setLocale);

		expect(setLocale).toHaveBeenCalledWith("zh-CN");
		stopSynchronization();
	});

	it("updates the backend after a language change", async () => {
		const setLocale = vi.fn().mockResolvedValue(undefined);
		const stopSynchronization = initializeBackendI18n(setLocale);
		setLocale.mockClear();

		await i18n.changeLanguage("en-US");

		expect(setLocale).toHaveBeenCalledWith("en-US");
		stopSynchronization();
	});
});
