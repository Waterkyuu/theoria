import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillLibraryTable } from "./skill-library-table";

const SKILLS = [
	{
		id: "skill-1",
		folderName: "repository-map",
		displayName: "Repository Map",
		description: "Maps repository structure.",
		sourceType: "local_folder" as const,
		sourcePath: "/tmp/repository-map",
		createdAtMs: 1,
		updatedAtMs: 1,
		mountedCount: 0,
		name: "repository-map",
		sourceLabel: "文件导入",
	},
];

const PAGINATED_SKILLS = [
	"alpha",
	"beta",
	"gamma",
	"delta",
	"epsilon",
	"zeta",
	"eta",
	"theta",
	"iota",
].map((name, index) => ({
	...SKILLS[0],
	id: `skill-${index + 1}`,
	folderName: name,
	displayName: name,
	name,
}));

describe("SkillLibraryTable", () => {
	it("does not present Skills as owning runtime permissions", () => {
		render(
			<SkillLibraryTable
				isRemovePending={false}
				isUpdatePending={false}
				onManageSkill={vi.fn()}
				onRemoveSkills={vi.fn()}
				onUpdateSkill={vi.fn()}
				skills={SKILLS}
				status={null}
			/>,
		);

		expect(
			screen.queryByRole("columnheader", { name: "权限" }),
		).not.toBeInTheDocument();
		expect(screen.queryByText("读取")).not.toBeInTheDocument();
	});

	it("removes selected Skills only after explicit confirmation", async () => {
		const user = userEvent.setup();
		const removeSkills = vi.fn();
		render(
			<SkillLibraryTable
				isRemovePending={false}
				isUpdatePending={false}
				onManageSkill={vi.fn()}
				onRemoveSkills={removeSkills}
				onUpdateSkill={vi.fn()}
				skills={SKILLS}
				status={null}
			/>,
		);

		expect(screen.queryByLabelText("删除已选技能")).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("checkbox", { name: /^选择 repository-map/ }),
		);

		await user.click(screen.getByLabelText("删除已选技能"));
		const dialog = await screen.findByRole("alertdialog", {
			name: "移除所选技能？",
		});

		expect(removeSkills).not.toHaveBeenCalled();
		await user.click(within(dialog).getByRole("button", { name: "移除技能" }));

		expect(removeSkills).toHaveBeenCalledWith(["skill-1"]);
	});

	it("hides pagination while all Skills fit on the first page", () => {
		render(
			<SkillLibraryTable
				isRemovePending={false}
				isUpdatePending={false}
				onManageSkill={vi.fn()}
				onRemoveSkills={vi.fn()}
				onUpdateSkill={vi.fn()}
				skills={PAGINATED_SKILLS.slice(0, 8)}
				status={null}
			/>,
		);

		expect(
			screen.queryByRole("navigation", { name: "技能分页" }),
		).not.toBeInTheDocument();
	});

	it("moves through Skill pages eight rows at a time", async () => {
		const user = userEvent.setup();
		render(
			<SkillLibraryTable
				isRemovePending={false}
				isUpdatePending={false}
				onManageSkill={vi.fn()}
				onRemoveSkills={vi.fn()}
				onUpdateSkill={vi.fn()}
				skills={PAGINATED_SKILLS}
				status={null}
			/>,
		);

		expect(screen.getByText("alpha")).toBeInTheDocument();
		expect(screen.queryByText("iota")).not.toBeInTheDocument();
		expect(screen.getByText("1 至 8，共 9 条结果")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "下一页" }));

		expect(screen.queryByText("alpha")).not.toBeInTheDocument();
		expect(screen.getByText("iota")).toBeInTheDocument();
		expect(screen.getByText("9 至 9，共 9 条结果")).toBeInTheDocument();
	});
});
