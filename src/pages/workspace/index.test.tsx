import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import WorkspacePage from ".";

describe("WorkspacePage", () => {
	it("renders a desktop conversation workspace with a complete composer", () => {
		render(<WorkspacePage />);

		expect(
			screen.getByRole("heading", { name: "从 agent-gauge 开始" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("textbox", {
				name: "任务内容",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "探索模式" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "已选择 1 个 Agent" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "发送任务" })).toBeDisabled();
	});

	it("opens agent autocomplete when slash is entered and adds a running agent", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.type(screen.getByRole("textbox", { name: "任务内容" }), "/");

		const agents = screen.getByRole("listbox", { name: "已启动的 Agent" });
		expect(agents).toBeInTheDocument();
		await user.click(screen.getByRole("option", { name: /OpenCode/ }));
		expect(
			screen.getByRole("button", { name: "已选择 2 个 Agent" }),
		).toBeInTheDocument();
	});

	it("makes benchmark semantics explicit before a formal run", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.click(screen.getByRole("button", { name: "探索模式" }));
		await user.click(screen.getByRole("option", { name: "基准测试模式" }));

		expect(
			screen.getByText("每个 Agent 从相同内容开始，运行期间彼此隔离。"),
		).toBeInTheDocument();
	});

	it("shows installed and running agents in the environment panel", async () => {
		const user = userEvent.setup();
		render(<WorkspacePage />);

		await user.click(screen.getByRole("button", { name: "查看 Agent 环境" }));

		expect(
			screen.getByRole("dialog", { name: "Agent 环境" }),
		).toBeInTheDocument();
		expect(screen.getByText("3 个已启动")).toBeInTheDocument();
	});
});
