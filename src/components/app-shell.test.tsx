import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
	it("matches the Figma sidebar frame and fixed section geometry", () => {
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
		const settings = screen.getByRole("navigation", { name: "应用设置" });

		expect(sidebar).toHaveClass("w-[287px]", "min-w-[287px]");
		expect(brand.parentElement).toHaveClass("h-[88px]", "px-xl");
		expect(navigation).toHaveClass("h-[116px]", "px-lg");
		expect(screen.queryByText("本地 Agent 工作台")).not.toBeInTheDocument();
		expect(screen.getByRole("tree", { name: "工作区" })).toHaveClass(
			"overflow-y-auto",
		);
		expect(settings).toHaveClass("h-[49px]", "px-lg", "pt-sm");
	});

	it("uses compact Figma rows without tree connector lines", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		const workspaceNavigation = screen.getByRole("button", { name: "工作区" });
		const tree = screen.getByRole("tree", { name: "工作区" });

		expect(workspaceNavigation).toHaveClass("h-8", "px-sm", "gap-sm");
		expect(tree.querySelector(".border-l")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "添加工作区" }),
		).toHaveTextContent("+ 新建");
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

	it("renders workspace groups without bundled demo records", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		expect(
			screen.getByRole("treeitem", { name: /agent-gauge/ }),
		).toHaveAttribute("aria-level", "1");
		expect(screen.getByRole("treeitem", { name: /会话 0/ })).toHaveAttribute(
			"aria-level",
			"2",
		);
		expect(
			screen.queryByText("历史记录加个图标 重命名 和删除"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("提交 GitHub PR")).not.toBeInTheDocument();
		expect(screen.queryByText("research-benchmarks")).not.toBeInTheDocument();
		expect(screen.queryByText("docs-lab")).not.toBeInTheDocument();
	});

	it("collapses the active workspace tree", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		fireEvent.click(screen.getByRole("button", { name: "收起 agent-gauge" }));

		expect(
			screen.queryByRole("treeitem", { name: /会话 0/ }),
		).not.toBeInTheDocument();
	});

	it("opens the global skill library from the fixed navigation", () => {
		const onNavigate = vi.fn();
		render(
			<AppShell currentPath="/" onNavigate={onNavigate}>
				<main>content</main>
			</AppShell>,
		);

		fireEvent.click(screen.getByRole("button", { name: "技能库" }));

		expect(onNavigate).toHaveBeenCalledWith("/skills");
	});
});
