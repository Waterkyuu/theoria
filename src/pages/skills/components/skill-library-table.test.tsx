import { render, screen } from "@testing-library/react";
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
		accessLabel: "读取",
		mountedCount: 0,
		name: "repository-map",
		sourceLabel: "文件导入",
	},
];

describe("SkillLibraryTable", () => {
	it("reveals the delete action after a Skill is selected", async () => {
		const user = userEvent.setup();
		render(
			<SkillLibraryTable
				isUpdatePending={false}
				onManageSkill={vi.fn()}
				onUpdateSkill={vi.fn()}
				skills={SKILLS}
				status={null}
			/>,
		);

		expect(screen.queryByLabelText("删除已选技能")).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("checkbox", { name: /^选择 repository-map/ }),
		);

		expect(screen.getByLabelText("删除已选技能")).toBeInTheDocument();
	});
});
