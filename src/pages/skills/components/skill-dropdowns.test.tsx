import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SkillAddDropdown } from "./skill-dropdowns";

it("offers simple and editor creation beneath the platform submenu", async () => {
	const user = userEvent.setup();
	const onAction = vi.fn();
	render(<SkillAddDropdown isDisabled={false} onAction={onAction} />);
	await user.click(screen.getByRole("button", { name: "添加技能" }));
	await user.click(screen.getByRole("menuitem", { name: "在 Theoria 中创建" }));
	expect(screen.getByRole("menuitem", { name: "简单创建" })).toBeVisible();
	await user.click(screen.getByRole("menuitem", { name: "编辑器创建" }));
	expect(onAction).toHaveBeenCalledWith("editor");
});

it("renders the add skill trigger with the Figma dark action treatment", () => {
	const onAction = vi.fn();
	render(<SkillAddDropdown isDisabled={false} onAction={onAction} />);
	const addButton = screen.getByRole("button", { name: "添加技能" });
	expect(addButton).toHaveClass("h-9");
	expect(addButton).toHaveClass("w-[107px]");
	expect(addButton).toHaveClass("gap-sm");
	expect(addButton).toHaveClass("rounded-md");
	expect(addButton).toHaveClass("bg-surface-dark");
	expect(addButton).toHaveClass("px-[10px]");
	expect(addButton).toHaveClass("py-[9px]");
	expect(addButton).toHaveClass("text-on-dark");
	expect(addButton.querySelector("svg")).toHaveClass("size-4");
});
