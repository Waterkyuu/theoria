import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPage from ".";

const queryMocks = vi.hoisted(() => ({
	useSkillMountCounts: vi.fn(),
	useSkills: vi.fn(),
}));

vi.mock("@/queries/skill", () => ({
	useSkillMountCounts: queryMocks.useSkillMountCounts,
	useSkills: queryMocks.useSkills,
}));

const SKILLS = [
	{
		id: "skill-1",
		folderName: "repository-map",
		displayName: "Repository Map",
		description: "映射仓库结构和关键入口。",
		sourceType: "local_folder",
		sourcePath: "/tmp/repository-map",
		createdAtMs: 1,
		updatedAtMs: 1,
	},
	{
		id: "skill-2",
		folderName: "test-runner",
		displayName: "Test Runner",
		description: "运行项目测试命令。",
		sourceType: "git",
		sourcePath: null,
		createdAtMs: 2,
		updatedAtMs: 2,
	},
] as const;

describe("SkillsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryMocks.useSkills.mockReturnValue({
			data: SKILLS,
			isLoading: false,
			error: null,
		});
		queryMocks.useSkillMountCounts.mockReturnValue({
			data: { "skill-1": 2 },
			isLoading: false,
			error: null,
		});
	});

	it("renders managed Skill Library records from native storage", () => {
		render(<SkillsPage />);

		expect(screen.getByRole("heading", { name: "技能" })).toBeInTheDocument();
		expect(screen.getAllByRole("row")).toHaveLength(3);
		expect(screen.getByText("repository-map")).toBeInTheDocument();
		expect(screen.getByText("test-runner")).toBeInTheDocument();
		expect(screen.getByText("已挂载 2 个")).toBeInTheDocument();
	});

	it("filters persisted Skills by source and search text", async () => {
		const user = userEvent.setup();
		render(<SkillsPage />);

		await user.click(screen.getByRole("button", { name: "本地" }));
		expect(screen.getByText("repository-map")).toBeInTheDocument();
		expect(screen.queryByText("test-runner")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "全部" }));
		await user.type(
			screen.getByRole("searchbox", { name: "按名称、来源或能力搜索" }),
			"测试命令",
		);
		const table = screen.getByRole("table", { name: "技能库" });
		expect(within(table).getByText("test-runner")).toBeInTheDocument();
		expect(within(table).queryByText("repository-map")).not.toBeInTheDocument();
	});

	it("shows loading and error states instead of demo records", () => {
		queryMocks.useSkills.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
			error: null,
		});
		const { rerender } = render(<SkillsPage />);
		expect(screen.getByRole("status")).toHaveTextContent("正在加载技能");

		queryMocks.useSkills.mockReturnValueOnce({
			data: undefined,
			isLoading: false,
			error: new Error("failed"),
		});
		rerender(<SkillsPage />);
		expect(screen.getByRole("alert")).toHaveTextContent("无法读取技能库");
	});
});
