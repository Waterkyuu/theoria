import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
	it("matches the Figma sidebar alignment and section geometry", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		const sidebar = screen.getByRole("complementary", {
			name: "工作区侧边栏",
		});
		const brand = within(sidebar).getByRole("button", { name: "theoria" });
		const navigation = screen.getByRole("navigation", { name: "主导航" });
		const tree = screen.getByRole("tree", { name: "工作区" });

		expect(sidebar).toHaveClass(
			"w-[287px]",
			"min-w-[287px]",
			"gap-[9px]",
			"px-[14px]",
			"py-[7px]",
		);
		expect(brand.parentElement).toHaveClass("py-[6px]");
		expect(brand.parentElement).not.toHaveClass("px-[15px]");
		expect(navigation).toHaveClass("h-[132px]", "gap-xs");
		expect(screen.queryByText("本地 Agent 工作台")).not.toBeInTheDocument();
		expect(tree).toHaveClass("overflow-y-auto");
		expect(tree).not.toHaveClass("pt-xxs");
		expect(tree.previousElementSibling).toHaveClass("h-7");
		expect(
			screen.queryByRole("navigation", { name: "应用设置" }),
		).not.toBeInTheDocument();
	});

	it("uses compact Figma rows without tree connector lines", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		const workspaceNavigation = screen.getByRole("button", { name: "新任务" });
		const workspaceToggle = screen.getByRole("button", {
			name: "收起 agent-gauge",
		});
		const tree = screen.getByRole("tree", { name: "工作区" });

		expect(workspaceNavigation).toHaveClass("h-9", "px-sm", "gap-sm");
		expect(workspaceToggle).toHaveClass("focus-visible:ring-inset");
		expect(tree.querySelector(".border-l")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "添加工作区" }),
		).toHaveTextContent("+ 新建");
	});

	it("keeps workspaces unselected on the new task homepage", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		expect(
			screen.getByRole("button", { name: "收起 agent-gauge" }),
		).not.toHaveClass("bg-hairline");
	});

	it("opens and highlights a workspace when its row is selected", async () => {
		const user = userEvent.setup();
		const onNavigate = vi.fn();
		const { rerender } = render(
			<AppShell currentPath="/" onNavigate={onNavigate}>
				<main>content</main>
			</AppShell>,
		);

		await user.click(screen.getByRole("button", { name: "收起 agent-gauge" }));
		expect(onNavigate).toHaveBeenCalledWith("/workspaces/agent-gauge");

		rerender(
			<AppShell currentPath="/workspaces/agent-gauge" onNavigate={onNavigate}>
				<main>content</main>
			</AppShell>,
		);
		expect(
			screen.getByRole("button", { name: "收起 agent-gauge" }),
		).toHaveClass("bg-hairline");
	});

	it("opens a workspace name modal from the new workspace action", async () => {
		const user = userEvent.setup();
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
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

	it("renders the temporary mock conversation with pin and more icons", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
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
		expect(mockConversation).not.toHaveClass("bg-hairline");
		expect(mockConversation).toHaveClass("pl-12");
		expect(mockConversation.querySelectorAll("svg")).toHaveLength(2);
	});

	it("opens rename and delete actions from the mock conversation menu", async () => {
		const user = userEvent.setup();
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
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
			<AppShell currentPath="/workspaces/agent-gauge" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
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
			<AppShell currentPath="/" onNavigate={onNavigate}>
				<main>content</main>
			</AppShell>,
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
