import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPage from ".";

const queryMocks = vi.hoisted(() => ({
	importSkill: vi.fn(),
	mountWorkspaceSkill: vi.fn(),
	unmountWorkspaceSkill: vi.fn(),
	useSkillMountCounts: vi.fn(),
	useSkills: vi.fn(),
	useWorkspaceSkills: vi.fn(),
	useWorkspaces: vi.fn(),
}));
const dialogMocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: dialogMocks.open }));

vi.mock("@/queries/skill", () => ({
	useImportSkill: () => ({
		mutateAsync: queryMocks.importSkill,
		isPending: false,
		error: null,
	}),
	useSkillMountCounts: queryMocks.useSkillMountCounts,
	useSkills: queryMocks.useSkills,
	useMountWorkspaceSkill: () => ({
		mutateAsync: queryMocks.mountWorkspaceSkill,
		isPending: false,
	}),
	useUnmountWorkspaceSkill: () => ({
		mutateAsync: queryMocks.unmountWorkspaceSkill,
		isPending: false,
	}),
	useWorkspaceSkills: queryMocks.useWorkspaceSkills,
}));

vi.mock("@/queries/workspace", () => ({
	useWorkspaces: queryMocks.useWorkspaces,
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
		dialogMocks.open.mockResolvedValue(
			"/Users/me/.agents/skills/repository-map",
		);
		queryMocks.importSkill.mockResolvedValue(SKILLS[0]);
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
		queryMocks.useWorkspaces.mockReturnValue({
			data: [
				{ id: "workspace-1", name: "Website", sourceKind: "managed" },
				{ id: "workspace-2", name: "API", sourceKind: "external" },
			],
			isLoading: false,
			error: null,
		});
		queryMocks.useWorkspaceSkills.mockImplementation((workspaceId: string) => ({
			data: workspaceId === "workspace-1" ? [SKILLS[0]] : [],
			isLoading: false,
			error: null,
		}));
		queryMocks.mountWorkspaceSkill.mockResolvedValue(SKILLS[0]);
		queryMocks.unmountWorkspaceSkill.mockResolvedValue(undefined);
	});

	it("manages persisted Workspace mounts from the existing table action", async () => {
		const user = userEvent.setup();
		render(<SkillsPage />);

		await user.click(screen.getByRole("button", { name: "管理" }));

		expect(
			screen.getByRole("heading", { name: "管理工作区挂载" }),
		).toBeInTheDocument();
		const website = screen.getByRole("checkbox", { name: "Website" });
		const api = screen.getByRole("checkbox", { name: "API" });
		expect(website).toBeChecked();
		expect(api).not.toBeChecked();

		await user.click(api);
		expect(queryMocks.mountWorkspaceSkill).toHaveBeenCalledWith({
			skillId: "skill-1",
			workspaceId: "workspace-2",
		});
		await user.click(website);
		expect(queryMocks.unmountWorkspaceSkill).toHaveBeenCalledWith({
			skillId: "skill-1",
			workspaceId: "workspace-1",
		});
	});

	it("imports a selected local folder from the existing Add skill action", async () => {
		const user = userEvent.setup();
		render(<SkillsPage />);

		await user.click(screen.getByRole("button", { name: "添加技能" }));

		expect(dialogMocks.open).toHaveBeenCalledWith({
			directory: true,
			multiple: false,
			title: "选择技能文件夹",
		});
		expect(queryMocks.importSkill).toHaveBeenCalledWith(
			"/Users/me/.agents/skills/repository-map",
		);
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
