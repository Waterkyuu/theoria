import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Composer } from "./composer";

const SKILLS = ["Review", "Testing"].map((name) => ({
	id: name,
	folderName: name,
	displayName: name,
	description: `${name} skill`,
	sourceType: "platform" as const,
	sourcePath: null,
	createdAtMs: 0,
	updatedAtMs: 0,
}));

/**
 * Keeps the real Composer controls available without native environment queries.
 * @example renderComposer(true, SKILLS);
 */
const renderComposer = (
	workspaceSkillsLocked = false,
	availableSkills = SKILLS,
) => {
	const onSubmit = vi.fn().mockResolvedValue(undefined);
	render(
		<Composer
			agentKinds={["codex"]}
			agentProcesses={{
				codex: true,
				claude: false,
				opencode: false,
				workbuddy: false,
			}}
			environmentRuntimes={{
				codex: { status: "checking" },
				claude: { status: "checking" },
				opencode: { status: "checking" },
				workbuddy: { status: "checking" },
			}}
			availableSkills={availableSkills}
			workspaceSkillsLocked={workspaceSkillsLocked}
			isSubmitting={false}
			onSubmit={onSubmit}
		/>,
	);
	return onSubmit;
};

it("keeps skill multiselection when dismissed and submits the selected skills", async () => {
	const user = userEvent.setup();
	const onSubmit = renderComposer();
	await user.click(screen.getByRole("button", { name: "0 个技能" }));
	await user.click(screen.getByRole("menuitemcheckbox", { name: "Review" }));
	await user.click(screen.getByRole("menuitemcheckbox", { name: "Testing" }));
	await user.click(screen.getByRole("menuitemcheckbox", { name: "Review" }));
	await user.keyboard("{Escape}");
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "1 个技能" })).toHaveFocus(),
	);
	await user.click(screen.getByRole("button", { name: "1 个技能" }));
	expect(
		screen.getByRole("menuitemcheckbox", { name: "Testing" }),
	).toHaveAttribute("aria-checked", "true");
	await user.click(
		screen.getByRole("textbox", { name: "任务内容", hidden: true }),
	);
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	await user.type(screen.getByRole("textbox", { name: "任务内容" }), "/");
	await user.click(screen.getByRole("option", { name: /Codex/ }));
	await user.type(
		screen.getByRole("textbox", { name: "任务内容" }),
		"Review code",
	);
	await user.click(screen.getByRole("button", { name: "发送任务" }));
	expect(onSubmit).toHaveBeenCalledWith(
		expect.objectContaining({ skillIds: ["Testing"] }),
	);
});

it("shows mounted skills as selected and locked", async () => {
	const user = userEvent.setup();
	renderComposer(true);
	await user.click(screen.getByRole("button", { name: "2 个技能" }));
	const skill = screen.getByRole("menuitemcheckbox", { name: "Review" });
	expect(skill).toHaveAttribute("aria-checked", "true");
	expect(skill).toHaveAttribute("aria-disabled", "true");
	await user.click(skill);
	expect(skill).toHaveAttribute("aria-checked", "true");
});

it("shows an empty skill menu that can be dismissed with Escape", async () => {
	const user = userEvent.setup();
	renderComposer(false, []);
	await user.click(screen.getByRole("button", { name: "0 个技能" }));
	expect(screen.getByText("暂无可用技能")).toBeVisible();
	await user.keyboard("{Escape}");
	expect(screen.queryByText("暂无可用技能")).not.toBeInTheDocument();
});
