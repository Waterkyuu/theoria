import { Toast } from "@heroui/react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

const queryMocks = vi.hoisted(() => ({
	createWorkspace: vi.fn(),
	deleteTask: vi.fn(),
	removeWorkspace: vi.fn(),
	setWorkspacePin: vi.fn(),
	useTasks: vi.fn(),
	useWorkspaces: vi.fn(),
	useWorkspaceSkills: vi.fn(),
}));
const dialogMocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: dialogMocks.open }));

vi.mock("@/queries/task", () => ({
	useDeleteTask: () => ({
		mutateAsync: queryMocks.deleteTask,
		isPending: false,
		error: null,
	}),
	useTasks: queryMocks.useTasks,
}));
vi.mock("@/queries/workspace", () => ({
	useCreateWorkspace: () => ({
		mutateAsync: queryMocks.createWorkspace,
		isPending: false,
		error: null,
	}),
	useRemoveWorkspace: () => ({
		mutateAsync: queryMocks.removeWorkspace,
		isPending: false,
		error: null,
	}),
	useSetWorkspacePin: () => ({
		mutateAsync: queryMocks.setWorkspacePin,
		isPending: false,
	}),
	useWorkspaces: queryMocks.useWorkspaces,
}));
vi.mock("@/queries/skill", () => ({
	useWorkspaceSkills: queryMocks.useWorkspaceSkills,
}));

const WORKSPACE_TASK = {
	id: "workspace-task-1",
	workspaceId: "workspace-1",
	title: "当前任务",
	prompt: "Inspect the workspace",
	status: "running",
	configurationLockedAtMs: 1,
	createdAtMs: 1,
	updatedAtMs: 2,
};

const RECENT_TASK = {
	...WORKSPACE_TASK,
	id: "recent-task-1",
	workspaceId: null,
	title: "普通任务",
};

describe("AppSidebar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dialogMocks.open.mockResolvedValue("/Users/me/projects/local-kit");
		queryMocks.createWorkspace.mockResolvedValue({
			id: "workspace-created",
			name: "docs-lab",
			sourceKind: "managed",
			sourcePath: "/managed/docs-lab",
			pinnedAtMs: null,
			createdAtMs: 1,
			updatedAtMs: 1,
		});
		queryMocks.deleteTask.mockResolvedValue(undefined);
		queryMocks.removeWorkspace.mockResolvedValue(undefined);
		queryMocks.setWorkspacePin.mockResolvedValue(undefined);
		queryMocks.useWorkspaces.mockReturnValue({
			data: [
				{
					id: "workspace-1",
					name: "agent-gauge",
					sourceKind: "external",
					sourcePath: "/tmp/agent-gauge",
					pinnedAtMs: null,
					createdAtMs: 1,
					updatedAtMs: 1,
				},
			],
			isLoading: false,
			error: null,
		});
		queryMocks.useTasks.mockImplementation((workspaceId: string | null) => ({
			data: workspaceId ? [WORKSPACE_TASK] : [RECENT_TASK],
			isLoading: false,
			error: null,
		}));
		queryMocks.useWorkspaceSkills.mockReturnValue({
			data: [{ id: "skill-1" }, { id: "skill-2" }],
			isLoading: false,
			error: null,
		});
	});
	it("renders the sidebar navigation regions", () => {
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		expect(
			screen.getByRole("complementary", { name: "工作区侧边栏" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("navigation", { name: "主导航" }),
		).toBeInTheDocument();
		expect(screen.getByRole("tree", { name: "工作区" })).toBeInTheDocument();
		expect(screen.queryByText("本地 Agent 工作台")).not.toBeInTheDocument();
		expect(
			screen.getByRole("navigation", { name: "应用设置" }),
		).toBeInTheDocument();
	});

	it("renders workspace actions and tree item icons", () => {
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		const tree = screen.getByRole("tree", { name: "工作区" });

		expect(
			screen
				.getByRole("button", { name: "收起 agent-gauge" })
				.querySelectorAll("svg"),
		).toHaveLength(1);
		expect(
			screen
				.getByRole("button", { name: "agent-gauge 的更多操作" })
				.querySelectorAll("svg"),
		).toHaveLength(1);
		expect(
			screen.getByRole("button", { name: "任务1" }).querySelectorAll("svg"),
		).toHaveLength(1);
		expect(
			screen.getByRole("button", { name: "基准测试0" }).querySelectorAll("svg"),
		).toHaveLength(1);
		expect(
			screen
				.getByRole("button", { name: "已挂载技能2" })
				.querySelectorAll("svg"),
		).toHaveLength(1);
		const addWorkspace = screen.getByRole("button", { name: "添加工作区" });
		const workspaceHeader = tree.previousElementSibling;

		expect(addWorkspace).not.toHaveTextContent("新建");
		expect(workspaceHeader?.querySelectorAll("svg")).toHaveLength(2);
	});

	it("renders ordinary Tasks directly in Recent beneath the workspace tree", () => {
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		const tree = screen.getByRole("tree", { name: "工作区" });
		const recent = screen.getByRole("region", { name: "最近" });

		expect(tree.nextElementSibling).toBe(recent);
		expect(within(recent).getByText("最近")).toBeInTheDocument();
		expect(recent.querySelectorAll("svg")).toHaveLength(4);
		expect(within(recent).getByText("普通任务")).toBeInTheDocument();
		expect(within(recent).queryByText("History")).not.toBeInTheDocument();
	});

	it("lets the Recent add icon inherit the button hover color", () => {
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		const addRecentTask = screen.getByRole("button", { name: "最近 新任务" });
		const icon = addRecentTask.querySelector("svg");

		expect(addRecentTask).toHaveClass("hover:text-ink");
		expect(icon).not.toHaveClass("text-mute");
	});

	it("uses in-place skeleton rows while Sidebar data is loading", () => {
		queryMocks.useWorkspaces.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
			error: null,
		});
		queryMocks.useTasks.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
			error: null,
		});

		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		expect(
			screen.getAllByRole("status", { name: "正在加载页面" }),
		).toHaveLength(2);
		expect(screen.queryByText("agent-gauge")).not.toBeInTheDocument();
		expect(screen.queryByText("普通任务")).not.toBeInTheDocument();
	});

	it("places the Settings row at the bottom of the sidebar", () => {
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		const sidebar = screen.getByRole("complementary", {
			name: "工作区侧边栏",
		});
		const settings = screen.getByRole("navigation", { name: "应用设置" });

		expect(sidebar.lastElementChild).toBe(settings);
		expect(within(settings).getByText("应用设置")).toBeInTheDocument();
	});

	it("opens a workspace when its row is selected", async () => {
		const user = userEvent.setup();
		const onNavigate = vi.fn();
		render(
			<AppSidebar currentPath="/" onNavigate={onNavigate}>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(screen.getByRole("button", { name: "收起 agent-gauge" }));
		expect(onNavigate).toHaveBeenCalledWith("/workspaces/workspace-1");
	});

	it("opens a workspace name modal from the new workspace action", async () => {
		const user = userEvent.setup();
		const onNavigate = vi.fn();
		render(
			<AppSidebar currentPath="/" onNavigate={onNavigate}>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(screen.getByRole("button", { name: "添加工作区" }));

		const dialog = await screen.findByRole("dialog", { name: "新建工作区" });
		const nameInput = within(dialog).getByRole("textbox", {
			name: "工作区名称",
		});
		const createButton = within(dialog).getByRole("button", { name: "创建" });

		expect(nameInput).toHaveValue("");
		expect(createButton).toBeDisabled();
		await user.type(nameInput, "docs-lab");
		expect(createButton).toBeEnabled();
		await user.click(createButton);

		expect(queryMocks.createWorkspace).toHaveBeenCalledWith({
			name: "docs-lab",
			sourceKind: "managed",
		});
		expect(onNavigate).toHaveBeenCalledWith("/workspaces/workspace-created");
	});

	it("opens the workspace action menu", async () => {
		const user = userEvent.setup();
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(
			screen.getByRole("button", { name: "agent-gauge 的更多操作" }),
		);

		expect(
			await screen.findByRole("menuitem", { name: "置顶" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("menuitem", { name: "重命名" }),
		).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "归档" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "移除" })).toBeInTheDocument();
	});

	it("requires the Workspace name before removing platform-managed files", async () => {
		const user = userEvent.setup();
		const onNavigate = vi.fn();
		const toastSuccess = vi.spyOn(Toast.toast, "success");
		queryMocks.useWorkspaces.mockReturnValueOnce({
			data: [
				{
					id: "workspace-managed",
					name: "docs-lab",
					sourceKind: "managed",
					sourcePath: "/managed/docs-lab",
					pinnedAtMs: null,
					createdAtMs: 1,
					updatedAtMs: 1,
				},
			],
			isLoading: false,
			error: null,
		});
		render(
			<AppSidebar
				currentPath="/workspaces/workspace-managed"
				onNavigate={onNavigate}
			>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(
			screen.getByRole("button", { name: "docs-lab 的更多操作" }),
		);
		await user.click(await screen.findByRole("menuitem", { name: "移除" }));
		const dialog = await screen.findByRole("alertdialog", {
			name: "移除工作区？",
		});
		const confirmButton = within(dialog).getByRole("button", {
			name: "移除工作区",
		});
		expect(dialog).toHaveTextContent("平台托管模板目录");
		expect(confirmButton).toBeDisabled();
		await user.type(within(dialog).getByRole("textbox"), "docs-lab");
		expect(confirmButton).toBeEnabled();
		await user.click(confirmButton);

		expect(queryMocks.removeWorkspace).toHaveBeenCalledWith({
			managedFilesConfirmed: true,
			workspaceId: "workspace-managed",
		});
		expect(toastSuccess).toHaveBeenCalledWith("已移除工作区“docs-lab”。");
		expect(onNavigate).toHaveBeenCalledWith("/task");
	});

	it("registers an imported local Workspace without transferring ownership", async () => {
		const user = userEvent.setup();
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(screen.getByRole("button", { name: "添加工作区" }));
		const dialog = await screen.findByRole("dialog", { name: "新建工作区" });
		const sourceTabs = within(dialog).getByRole("tablist", {
			name: "工作区来源",
		});
		const managedWorkspaceName = within(dialog).getByRole("textbox", {
			name: "工作区名称",
		});
		const externalTab = within(dialog).getByRole("tab", { name: "导入本地" });
		expect(sourceTabs).toHaveAttribute("data-slot", "tabs-list");
		expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
		expect(externalTab).toHaveClass(
			"rounded-md",
			"data-[selected=true]:bg-canvas",
			"data-[selected=true]:text-ink",
		);
		expect(
			sourceTabs.compareDocumentPosition(managedWorkspaceName) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).not.toBe(0);
		await user.click(externalTab);
		const workspaceName = within(dialog).getByRole("textbox", {
			name: "工作区名称",
		});
		expect(workspaceName).toHaveValue("");
		expect(within(dialog).getByText("源文件夹")).toBeInTheDocument();
		expect(
			within(dialog).queryByRole("textbox", { name: "源文件夹" }),
		).not.toBeInTheDocument();
		const sourceFolder = within(dialog).getByRole("button", {
			name: "选择本地文件夹",
		});
		await user.click(sourceFolder);
		expect(dialogMocks.open).toHaveBeenCalledWith({
			directory: true,
			multiple: false,
			title: "选择 Workspace 文件夹",
		});
		expect(sourceFolder).toHaveTextContent("/Users/me/projects/local-kit");
		const createButton = within(dialog).getByRole("button", { name: "创建" });
		expect(createButton).toBeEnabled();
		await user.click(createButton);

		expect(queryMocks.createWorkspace).toHaveBeenCalledWith({
			name: "local-kit",
			sourceKind: "external",
			sourcePath: "/Users/me/projects/local-kit",
		});
	});

	it("renders persisted Workspace Tasks with the original row actions", () => {
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		expect(
			screen.getByRole("treeitem", { name: /agent-gauge/ }),
		).toHaveAttribute("aria-level", "1");
		expect(screen.getByRole("treeitem", { name: /任务 1/ })).toHaveAttribute(
			"aria-level",
			"2",
		);

		const workspaceTask = screen.getByRole("treeitem", {
			name: "当前任务",
		});

		expect(workspaceTask).toHaveAttribute("aria-level", "3");
		expect(workspaceTask.querySelectorAll("svg")).toHaveLength(2);
	});

	it("deletes a Task and its run files from the existing conversation menu", async () => {
		const user = userEvent.setup();
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(
			screen.getByRole("button", { name: "当前任务的更多操作" }),
		);

		expect(
			await screen.findByRole("menuitem", { name: "重命名" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("menuitem", { name: "删除" }));
		const dialog = await screen.findByRole("alertdialog", {
			name: "删除任务？",
		});
		expect(dialog).toHaveTextContent("隔离运行目录和结果文件");
		await user.click(within(dialog).getByRole("button", { name: "删除任务" }));
		expect(queryMocks.deleteTask).toHaveBeenCalledWith("workspace-task-1");
	});

	it("collapses the active workspace tree", () => {
		render(
			<AppSidebar currentPath="/workspaces/workspace-1" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		fireEvent.click(screen.getByRole("button", { name: "收起 agent-gauge" }));

		expect(
			screen.queryByRole("treeitem", { name: /任务 1/ }),
		).not.toBeInTheDocument();
	});

	it("opens Workspace and ordinary Tasks directly without a History route", async () => {
		const user = userEvent.setup();
		const onNavigate = vi.fn();
		render(
			<AppSidebar currentPath="/" onNavigate={onNavigate}>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(screen.getByRole("button", { name: "当前任务" }));
		expect(onNavigate).toHaveBeenCalledWith(
			"/workspaces/workspace-1/task/workspace-task-1",
		);

		await user.click(screen.getByRole("button", { name: "普通任务" }));
		expect(onNavigate).toHaveBeenCalledWith("/task/recent-task-1");
	});

	it("navigates to a new task and lets the user hide and restore the sidebar", async () => {
		const user = userEvent.setup();
		const onNavigate = vi.fn();
		render(
			<AppSidebar currentPath="/" onNavigate={onNavigate}>
				<main>content</main>
			</AppSidebar>,
		);

		await user.click(screen.getByRole("button", { name: "新任务" }));
		expect(onNavigate).toHaveBeenCalledWith("/task");

		await user.click(screen.getByRole("button", { name: "收起侧边栏" }));
		expect(
			screen.queryByRole("complementary", { name: "工作区侧边栏" }),
		).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "展开侧边栏" }));
		expect(
			screen.getByRole("complementary", { name: "工作区侧边栏" }),
		).toBeInTheDocument();
	});
});
