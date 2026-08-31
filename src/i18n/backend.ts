import { invoke } from "@tauri-apps/api/core";
import { handleError } from "@/utils/error";
import i18n from ".";

/**
 * Synchronizes one i18next language change with the native error translation boundary.
 *
 * @example
 * backendLanguageChanged("zh-CN");
 */
const backendLanguageChanged = (language: string) => {
	invoke("set_backend_locale", { locale: language }).catch((error) => {
		handleError(error, "Failed to synchronize the backend locale");
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
