import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

describe("AppSidebar", () => {
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
				.getByRole("button", { name: "已挂载技能0" })
				.querySelectorAll("svg"),
		).toHaveLength(1);
		const addWorkspace = screen.getByRole("button", { name: "添加工作区" });
		const workspaceHeader = tree.previousElementSibling;

		expect(addWorkspace).not.toHaveTextContent("新建");
		expect(workspaceHeader?.querySelectorAll("svg")).toHaveLength(2);
	});

	it("renders an empty Recent region beneath the workspace tree", () => {
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		const tree = screen.getByRole("tree", { name: "工作区" });
		const recent = screen.getByRole("region", { name: "最近" });

		expect(tree.nextElementSibling).toBe(recent);
		expect(within(recent).getByText("最近")).toBeInTheDocument();
		expect(recent.querySelectorAll("svg")).toHaveLength(2);
		expect(within(recent).queryByRole("treeitem")).not.toBeInTheDocument();
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
		expect(onNavigate).toHaveBeenCalledWith("/workspaces/agent-gauge");
	});

	it("opens a workspace name modal from the new workspace action", async () => {
		const user = userEvent.setup();
		render(
			<AppSidebar currentPath="/" onNavigate={vi.fn()}>
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

	it("renders the temporary mock conversation with pin and more icons", () => {
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

		const mockConversation = screen.getByRole("treeitem", {
			name: "当前任务",
		});

		expect(mockConversation).toHaveAttribute("aria-level", "3");
		expect(mockConversation.querySelectorAll("svg")).toHaveLength(2);
	});

	it("opens rename and delete actions from the mock conversation menu", async () => {
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
		expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
	});

	it("collapses the active workspace tree", () => {
		render(
			<AppSidebar currentPath="/workspaces/agent-gauge" onNavigate={vi.fn()}>
				<main>content</main>
			</AppSidebar>,
		);

		fireEvent.click(screen.getByRole("button", { name: "收起 agent-gauge" }));

		expect(
			screen.queryByRole("treeitem", { name: /任务 1/ }),
		).not.toBeInTheDocument();
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
		expect(onNavigate).toHaveBeenCalledWith("/");

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
