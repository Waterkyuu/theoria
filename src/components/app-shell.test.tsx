import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
	it("separates global navigation, scrollable workspaces, and app settings", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		expect(screen.getByText("theoria")).toBeInTheDocument();
		expect(
			screen.getByRole("navigation", { name: "主导航" }),
		).toBeInTheDocument();
		expect(screen.getByRole("tree", { name: "工作区" })).toHaveClass(
			"overflow-y-auto",
		);
		expect(
			screen.getByRole("navigation", { name: "应用设置" }),
		).toBeInTheDocument();
	});

	it("renders workspace children at deeper tree levels", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		expect(
			screen.getByRole("treeitem", { name: /agent-gauge/ }),
		).toHaveAttribute("aria-level", "1");
		expect(screen.getByRole("treeitem", { name: /会话 12/ })).toHaveAttribute(
			"aria-level",
			"2",
		);
		expect(
			screen.getByRole("treeitem", {
				name: "历史记录加个图标 重命名 和删除",
			}),
		).toHaveAttribute("aria-level", "3");
	});

	it("collapses the active workspace tree", () => {
		render(
			<AppShell currentPath="/" onNavigate={vi.fn()}>
				<main>content</main>
			</AppShell>,
		);

		fireEvent.click(screen.getByRole("button", { name: "收起 agent-gauge" }));

		expect(
			screen.queryByRole("treeitem", { name: /会话 12/ }),
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
