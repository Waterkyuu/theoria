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
