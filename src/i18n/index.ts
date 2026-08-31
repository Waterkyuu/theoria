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

/**
 * Synchronizes one i18next language change with the native error translation boundary.
 *
 * @example
 * backendLanguageChanged("zh-CN");
 */
const backendLanguageChanged = (language: string) => {
	invoke("set_backend_locale", { locale: language }).catch((error) => {
		console.error("Failed to synchronize the backend locale", error);
	});
};

/**
 * Initializes native IPC error messages with the active i18next language.
 *
 * @example
 * initializeBackendI18n();
 */
const initializeBackendI18n = () => {
	backendLanguageChanged(i18n.resolvedLanguage ?? i18n.language);
};

i18n.on("languageChanged", backendLanguageChanged);

export { initializeBackendI18n };
export default i18n;
