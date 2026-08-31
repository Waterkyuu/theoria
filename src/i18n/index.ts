import { invoke } from "@tauri-apps/api/core";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { enUS } from "./locales/en-us";
import { zhCN } from "./locales/zh-cn";

const LANGUAGE_STORAGE_KEY = "language";
const initialLanguage =
	localStorage.getItem(LANGUAGE_STORAGE_KEY) || navigator.language;

i18n.use(initReactI18next).init({
	resources: {
		"en-US": enUS,
		"zh-CN": zhCN,
	},
	lng: initialLanguage,
	fallbackLng: "en-US",
	initAsync: false,
	interpolation: {
		escapeValue: false,
	},
});

/**
 * Persists the active language whenever i18next reports a language change.
 *
 * @example
 * i18n.changeLanguage("zh-CN");
 */
i18n.on("languageChanged", (language) => {
	localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
});

type BackendLocaleSetter = (language: string) => Promise<unknown>;

/**
 * Sends one frontend locale update to the native error translation boundary.
 *
 * @example
 * await setBackendLocale("zh-CN");
 */
const setBackendLocale: BackendLocaleSetter = (language) =>
	invoke("set_backend_locale", { locale: language });

/**
 * Keeps native IPC error messages aligned with the active i18next language for
 * the lifetime of the application.
 *
 * @example
 * const stopSynchronization = initializeBackendI18n();
 */
const initializeBackendI18n = (
	setLocale: BackendLocaleSetter = setBackendLocale,
): (() => void) => {
	// Language changes are asynchronous, so synchronization failures stay observable without blocking i18next.
	const languageChanged = (language: string) => {
		setLocale(language).catch((error) => {
			console.error("Failed to synchronize the backend locale", error);
		});
	};

	languageChanged(i18n.resolvedLanguage ?? i18n.language);
	i18n.on("languageChanged", languageChanged);

	return () => {
		i18n.off("languageChanged", languageChanged);
	};
};

export { initializeBackendI18n };
export default i18n;
