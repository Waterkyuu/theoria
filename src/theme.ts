type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "theme";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

let systemThemeMediaQuery: MediaQueryList | null = null;

/**
 * Returns the saved theme choice, falling back to the operating-system theme.
 *
 * @example
 * getThemePreference(); // "system"
 */
const getThemePreference = (): ThemePreference => {
	const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);

	if (storedPreference === "light" || storedPreference === "dark") {
		return storedPreference;
	}

	return "system";
};

/**
 * Resolves the user's preference before applying the shared semantic color tokens.
 *
 * @example
 * applyThemePreference("dark");
 */
const applyThemePreference = (preference: ThemePreference) => {
	window.localStorage.setItem(THEME_STORAGE_KEY, preference);
	const isDark =
		preference === "dark" ||
		(preference === "system" && window.matchMedia(SYSTEM_DARK_QUERY).matches);
	const activeTheme = isDark ? "dark" : "light";

	document.documentElement.dataset.theme = activeTheme;
	document.documentElement.style.colorScheme = activeTheme;
};

/** Keeps a system-based preference synchronized when the operating system changes. */
const synchronizeSystemTheme = () => {
	if (getThemePreference() === "system") {
		applyThemePreference("system");
	}
};

/** Applies the saved theme before React renders and subscribes to system changes. */
const initializeTheme = () => {
	if (!systemThemeMediaQuery) {
		systemThemeMediaQuery = window.matchMedia(SYSTEM_DARK_QUERY);
		systemThemeMediaQuery.addEventListener("change", synchronizeSystemTheme);
	}

	applyThemePreference(getThemePreference());
};

export type { ThemePreference };
export { applyThemePreference, getThemePreference, initializeTheme };
