import { Toast } from "@heroui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from ".";

describe("SettingsPage", () => {
	beforeEach(() => {
		document.documentElement.removeAttribute("data-theme");
	});

	it("applies and remembers the selected dark theme", async () => {
		const user = userEvent.setup();
		const firstRender = render(<SettingsPage />);

		await user.click(
			screen.getByRole("button", { name: "主题，当前：跟随系统" }),
		);
		await user.click(await screen.findByRole("menuitem", { name: "深色" }));

		expect(document.documentElement).toHaveAttribute("data-theme", "dark");
		expect(
			screen.getByRole("button", { name: "主题，当前：深色" }),
		).toBeInTheDocument();

		firstRender.unmount();
		render(<SettingsPage />);

		expect(
			screen.getByRole("button", { name: "主题，当前：深色" }),
		).toBeInTheDocument();
	});

	it("switches the application language from its Dropdown", async () => {
		const user = userEvent.setup();
		const toastSuccess = vi.spyOn(Toast.toast, "success");
		render(<SettingsPage />);

		await user.click(
			screen.getByRole("button", { name: "语言，当前：简体中文" }),
		);
		await user.click(await screen.findByRole("menuitem", { name: "English" }));

		expect(
			screen.getByRole("heading", { name: "App settings", level: 1 }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Language, current: English" }),
		).toBeInTheDocument();
		expect(toastSuccess).toHaveBeenCalledWith("Language changed");
	});
});
