import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EditSkillPage from "./index";

const { readEditorSkill } = vi.hoisted(() => ({ readEditorSkill: vi.fn() }));
vi.mock("@/api/skill", async (original) => ({
	...(await original<typeof import("@/api/skill")>()),
	readEditorSkill,
}));

/** Route parameters select creation or loading while query behavior remains real.
 * @example renderPage("/skills/edit-skill")
 */
const renderPage = (path = "/skills/edit-skill?skillId=skill-1") =>
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/skills/edit-skill" element={<EditSkillPage />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);

// Isolate CodeMirror's browser geometry requirements; file-tree loading is the behavior under test.
vi.mock("@/components/share/code-editor", () => ({ CodeEditor: () => null }));
beforeEach(() => {
	readEditorSkill.mockReset();
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			return this.getAttribute("role") === "separator"
				? new DOMRect(700, 0, 1, 800)
				: new DOMRect(0, 0, 1000, 800);
		},
	);
});
afterEach(() => {
	vi.restoreAllMocks();
});

it("shows loading before exposing editable files", () => {
	readEditorSkill.mockReturnValue(new Promise(() => {}));
	renderPage();
	expect(screen.getByRole("status")).toBeVisible();
	expect(
		screen.queryByRole("button", { name: "保存" }),
	).not.toBeInTheDocument();
});

it("offers retry after a read failure and opens the retrieved skill", async () => {
	readEditorSkill.mockRejectedValueOnce(new Error("Read failed"));
	renderPage();
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"无法读取技能文件",
	);
	expect(
		screen.queryByRole("button", { name: "保存" }),
	).not.toBeInTheDocument();
	readEditorSkill.mockResolvedValue({
		files: { "SKILL.md": "---\nname: demo\ndescription: Existing\n---\n" },
		directories: ["empty"],
		retainedFiles: {},
	});
	await userEvent.click(screen.getByRole("button", { name: "重试" }));
	expect(await screen.findByText("empty")).toBeVisible();
	expect(readEditorSkill).toHaveBeenLastCalledWith("skill-1");
	expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
});

it("opens a new editor without requesting an existing skill", async () => {
	renderPage("/skills/edit-skill");
	expect(await screen.findByRole("button", { name: "保存" })).toBeDisabled();
	expect(readEditorSkill).not.toHaveBeenCalled();
});
