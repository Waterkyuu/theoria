import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import SkillsPage from ".";

describe("SkillsPage", () => {
	it("renders the Figma skill library with temporary mock records", () => {
		render(<SkillsPage />);

		expect(screen.getByRole("heading", { name: "技能" })).toBeInTheDocument();
		expect(screen.getByText("~/.theoria/skills")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "添加技能" }),
		).toBeInTheDocument();
		expect(screen.getAllByRole("row")).toHaveLength(6);
		expect(screen.getByText("repository-map")).toBeInTheDocument();
		expect(screen.getByText("test-runner")).toBeInTheDocument();
		expect(screen.getByText("ui-audit")).toBeInTheDocument();
		expect(screen.getByText("benchmark-evaluator")).toBeInTheDocument();
		expect(screen.getByText("release-notes")).toBeInTheDocument();
	});

	it("filters mock skills by source", async () => {
		const user = userEvent.setup();
		render(<SkillsPage />);

		await user.click(screen.getByRole("button", { name: "本地" }));

		expect(screen.getByText("repository-map")).toBeInTheDocument();
		expect(screen.getByText("ui-audit")).toBeInTheDocument();
		expect(screen.getByText("release-notes")).toBeInTheDocument();
		expect(screen.queryByText("test-runner")).not.toBeInTheDocument();
		expect(screen.queryByText("benchmark-evaluator")).not.toBeInTheDocument();
	});

	it("searches mock skills by name and capability", async () => {
		const user = userEvent.setup();
		render(<SkillsPage />);

		await user.type(
			screen.getByRole("searchbox", { name: "按名称、来源或能力搜索" }),
			"测试命令",
		);

		const table = screen.getByRole("table", { name: "技能库" });
		expect(within(table).getByText("test-runner")).toBeInTheDocument();
		expect(within(table).queryByText("repository-map")).not.toBeInTheDocument();
	});
});
