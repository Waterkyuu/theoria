import { useState } from "react";
import { Check, ChevronDown } from "@gravity-ui/icons";
import { Button, Toast } from "@heroui/react";
import { cn } from "cnfast";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/share/page-header";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { handleError } from "@/utils/error";
import i18n from "@/i18n";
import {
	applyThemePreference,
	getThemePreference,
	type ThemePreference,
} from "@/theme";

type LanguageOption = "zh-CN" | "en-US";

const THEME_OPTIONS = ["system", "light", "dark"] as const;
const LANGUAGE_OPTIONS = ["zh-CN", "en-US"] as const;

const SettingsPage = () => {
	const { t } = useTranslation();
	const [themePreference, setThemePreference] =
		useState<ThemePreference>(getThemePreference);
	const activeLanguage: LanguageOption = i18n.resolvedLanguage?.startsWith("zh")
		? "zh-CN"
		: "en-US";

	/**
	 * Applies the selected theme immediately and keeps the Dropdown label in sync.
	 *
	 * @example
	 * changeTheme("dark");
	 */
	const changeTheme = (preference: ThemePreference) => {
		applyThemePreference(preference);
		setThemePreference(preference);
	};

	/**
	 * Uses i18next's existing persistence boundary for the selected application language.
	 *
	 * @example
	 * changeLanguage("en-US");
	 */
	const changeLanguage = async (language: LanguageOption) => {
		try {
			await i18n.changeLanguage(language);
			Toast.toast.success(i18n.t("settings.language.success"));
		} catch (error) {
			handleError(
				error,
				"Language change failed",
				true,
				i18n.t("settings.language.failed"),
			);
		}
	};

	const themeValue = t(`settings.theme.options.${themePreference}`);
	const languageValue = t(`settings.language.options.${activeLanguage}`);

	return (
		<main className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-canvas max-md:h-[calc(100dvh-4rem)]">
			<PageHeader>
				<p className="text-body-sm font-medium text-charcoal">
					{t("settings.title")}
				</p>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-10 sm:py-10">
				<div className="mx-auto max-w-3xl">
					<h1 className="font-primary text-[28px] font-semibold leading-[34px] text-ink">
						{t("settings.title")}
					</h1>
					<p className="mt-sm max-w-xl text-[15px] leading-5 text-charcoal">
						{t("settings.description")}
					</p>

					<div className="mt-8 overflow-hidden rounded-lg border border-hairline bg-surface-card">
						<section className="flex flex-col items-start justify-between gap-lg p-xl sm:flex-row sm:items-center">
							<div className="max-w-lg">
								<h2 className="text-body-md font-semibold text-ink">
									{t("settings.theme.title")}
								</h2>
								<p className="mt-xs text-body-sm text-charcoal">
									{t("settings.theme.description")}
								</p>
							</div>
							<DropdownMenu
								headerKey="settings.theme.menuTitle"
								itemClassName="min-w-40"
								items={THEME_OPTIONS.map((preference) => ({
									icon: (
										<Check
											aria-hidden="true"
											className={cn(
												"size-4",
												themePreference !== preference && "invisible",
											)}
										/>
									),
									id: preference,
									labelKey: `settings.theme.options.${preference}`,
								}))}
								onAction={changeTheme}
								placement="bottom end"
								trigger={
									<Button
										aria-label={t("settings.theme.selectorLabel", {
											value: themeValue,
										})}
										className="h-9 min-w-36 justify-between rounded-md border border-hairline bg-canvas px-md text-body-sm font-medium text-ink shadow-none outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
										variant="ghost"
									>
										{themeValue}
										<ChevronDown
											aria-hidden="true"
											className="size-4 text-mute"
										/>
									</Button>
								}
							/>
						</section>

						<section className="flex flex-col items-start justify-between gap-lg border-t border-hairline p-xl sm:flex-row sm:items-center">
							<div className="max-w-lg">
								<h2 className="text-body-md font-semibold text-ink">
									{t("settings.language.title")}
								</h2>
								<p className="mt-xs text-body-sm text-charcoal">
									{t("settings.language.description")}
								</p>
							</div>
							<DropdownMenu
								headerKey="settings.language.menuTitle"
								itemClassName="min-w-40"
								items={LANGUAGE_OPTIONS.map((language) => ({
									icon: (
										<Check
											aria-hidden="true"
											className={cn(
												"size-4",
												activeLanguage !== language && "invisible",
											)}
										/>
									),
									id: language,
									labelKey: `settings.language.options.${language}`,
								}))}
								onAction={changeLanguage}
								placement="bottom end"
								trigger={
									<Button
										aria-label={t("settings.language.selectorLabel", {
											value: languageValue,
										})}
										className="h-9 min-w-36 justify-between rounded-md border border-hairline bg-canvas px-md text-body-sm font-medium text-ink shadow-none outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
										variant="ghost"
									>
										{languageValue}
										<ChevronDown
											aria-hidden="true"
											className="size-4 text-mute"
										/>
									</Button>
								}
							/>
						</section>
					</div>
				</div>
			</div>
		</main>
	);
};

export default SettingsPage;
