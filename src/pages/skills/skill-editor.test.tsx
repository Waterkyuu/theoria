import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { SkillEditorPage } from "./skill-editor";

const { mutateAsync, mutation } = vi.hoisted(() => {
	const mutateAsync = vi.fn();
	return { mutateAsync, mutation: { mutateAsync, isPending: false } };
});
vi.mock("@/queries/skill", () => ({ useCreatePlatformSkill: () => mutation }));
// Isolate the third-party editing engine; exercise draft management and persistence through its public value contract.
vi.mock("@/components/share/code-editor", () => ({
	CodeEditor: ({
		path,
		value,
		onChange,
	}: {
		path: string;
		value: string;
		onChange: (value: string) => void;
	}) => (
		<textarea
			aria-label={path}
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
}));

/**
 * Keep routing real so creation success is observed as returning to the library.
 */
const renderEditor = () =>
	render(
		<MemoryRouter>
			<Routes>
				<Route path="/" element={<SkillEditorPage />} />
				<Route path="/skills" element={<h1>技能库</h1>} />
			</Routes>
		</MemoryRouter>,
	);

beforeEach(() => {
	mutateAsync.mockReset();
	mutation.isPending = false;
});

it("starts with frontmatter and saves every file without changing the name", async () => {
	const user = userEvent.setup();
	renderEditor();
	expect(screen.getByRole("textbox", { name: "SKILL.md" })).toHaveValue(
		"---\nname: \ndescription: \n---\n",
	);
	expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
	await user.clear(screen.getByRole("textbox", { name: "SKILL.md" }));
	const manifest =
		"---\nname: Release_Notes\ndescription: Write notes\n---\n\n# Instructions\n";
	await user.type(screen.getByRole("textbox", { name: "SKILL.md" }), manifest);
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"references/guide.md",
	);
	await user.keyboard("{Enter}");
	await user.type(
		screen.getByRole("textbox", { name: "references/guide.md" }),
		"# Guide",
	);
	await user.click(screen.getByRole("button", { name: "预览" }));
	expect(screen.getByRole("heading", { name: "Guide" })).toBeVisible();
	await user.click(screen.getByRole("button", { name: "SKILL.md" }));
	expect(screen.getByRole("textbox", { name: "SKILL.md" })).toHaveValue(
		manifest,
	);
	mutateAsync.mockResolvedValue({});
	await user.click(screen.getByRole("button", { name: "保存" }));
	await waitFor(() =>
		expect(screen.getByRole("heading", { name: "技能库" })).toBeVisible(),
	);
	expect(mutateAsync).toHaveBeenCalledWith({
		files: { "SKILL.md": manifest, "references/guide.md": "# Guide" },
	});
});

it("rejects colliding and escaping paths and remembers the directory side", async () => {
	const user = userEvent.setup();
	renderEditor();
	await user.click(screen.getByRole("button", { name: "目录移到左侧" }));
	expect(screen.getByRole("button", { name: "目录移到右侧" })).toBeVisible();
	expect(localStorage.getItem("skill-editor-directory-side")).toBe("left");
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	const path = screen.getByRole("textbox", { name: "文件路径" });
	for (const invalid of [
		"../escape.md",
		"skill.md",
		"SKILL.md/child",
		"CON.txt",
	]) {
		await user.clear(path);
		await user.type(path, invalid);
		await user.keyboard("{Enter}");
		expect(screen.getByRole("alert")).toHaveTextContent("文件路径无效或已存在");
	}
});

it("keeps the draft when saving fails and prevents repeat submission while pending", async () => {
	const user = userEvent.setup();
	const view = renderEditor();
	const manifest = "---\nname: demo\ndescription: Test\n---\n";
	await user.clear(screen.getByRole("textbox", { name: "SKILL.md" }));
	await user.type(screen.getByRole("textbox", { name: "SKILL.md" }), manifest);
	mutateAsync.mockRejectedValue(new Error("save failed"));
	await user.click(screen.getByRole("button", { name: "保存" }));
	expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
	expect(screen.getByRole("textbox", { name: "SKILL.md" })).toHaveValue(
		manifest,
	);
	mutation.isPending = true;
	view.rerender(
		<MemoryRouter>
			<SkillEditorPage />
		</MemoryRouter>,
	);
	expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
});

it.each(["", "Creates release notes for users."])(
	"previews metadata as labeled values, including an empty description (%s)",
	async (description) => {
		const user = userEvent.setup();
		renderEditor();
		await user.clear(screen.getByRole("textbox", { name: "SKILL.md" }));
		await user.type(
			screen.getByRole("textbox", { name: "SKILL.md" }),
			`---\n\nname: ddd\ndescription: ${description}\n---\n\n# Instructions`,
		);
		await user.click(screen.getByRole("button", { name: "预览" }));
		const metadata = within(screen.getByRole("region", { name: "元数据" }));
		expect(metadata.getAllByRole("term")[0]).toHaveTextContent("name");
		expect(metadata.getAllByRole("term")[1]).toHaveTextContent("description");
		expect(metadata.getAllByRole("definition")[0]).toHaveTextContent("ddd");
		expect(metadata.getAllByRole("definition")[1].textContent).toBe(
			description,
		);
		expect(metadata.queryByText("---")).not.toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Instructions" })).toBeVisible();
	},
);

it("creates empty folders and saves files inside them", async () => {
	const user = userEvent.setup();
	renderEditor();
	await user.clear(screen.getByRole("textbox", { name: "SKILL.md" }));
	await user.type(
		screen.getByRole("textbox", { name: "SKILL.md" }),
		"---\nname: demo\ndescription: Test\n---\n",
	);
	await user.click(screen.getByRole("button", { name: "新建文件夹" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件夹路径" }),
		"references",
	);
	await user.keyboard("{Enter}");
	expect(screen.getByText("references")).toBeVisible();
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"guide.md",
	);
	await user.keyboard("{Enter}");
	expect(
		screen.getByRole("textbox", { name: "references/guide.md" }),
	).toBeVisible();
	await user.click(screen.getByRole("button", { name: "选择根目录" }));
	await user.click(screen.getByRole("button", { name: "新建文件夹" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件夹路径" }),
		"scripts",
	);
	await user.keyboard("{Enter}");
	mutateAsync.mockResolvedValue({});
	await user.click(screen.getByRole("button", { name: "保存" }));
	expect(mutateAsync).toHaveBeenCalledWith({
		files: {
			"SKILL.md": "---\nname: demo\ndescription: Test\n---\n",
			"references/guide.md": "",
		},
		directories: ["references", "scripts"],
	});
});

it("renames a folder and keeps the open file contents under its new path", async () => {
	const user = userEvent.setup();
	renderEditor();
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"references/guide.md",
	);
	await user.keyboard("{Enter}");
	await user.type(
		screen.getByRole("textbox", { name: "references/guide.md" }),
		"# Keep this draft",
	);
	await user.click(screen.getByRole("button", { name: "references 的操作" }));
	await user.click(screen.getByRole("menuitem", { name: "重命名" }));
	const path = screen.getByRole("textbox", { name: "文件夹路径" });
	await user.clear(path);
	await user.type(path, "SKILL.md");
	await user.keyboard("{Enter}");
	expect(screen.getByRole("alert")).toBeVisible();
	await user.clear(path);
	await user.type(path, "docs");
	await user.keyboard("{Enter}");
	expect(screen.getByRole("textbox", { name: "docs/guide.md" })).toHaveValue(
		"# Keep this draft",
	);
	expect(screen.queryByText("references")).not.toBeInTheDocument();
});

it("requires confirmation before deleting a folder and allows replacing the manifest", async () => {
	const user = userEvent.setup();
	renderEditor();
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"references/guide.md",
	);
	await user.keyboard("{Enter}");
	await user.click(screen.getByRole("button", { name: "references 的操作" }));
	await user.click(screen.getByRole("menuitem", { name: "删除" }));
	await user.click(
		within(screen.getByRole("alertdialog")).getByRole("button", {
			name: "取消",
		}),
	);
	expect(
		screen.getByRole("textbox", { name: "references/guide.md" }),
	).toBeVisible();
	await user.click(screen.getByRole("button", { name: "references 的操作" }));
	await user.click(screen.getByRole("menuitem", { name: "删除" }));
	await user.click(
		within(screen.getByRole("alertdialog")).getByRole("button", {
			name: "删除",
		}),
	);
	expect(screen.queryByText("references")).not.toBeInTheDocument();
	expect(screen.getByRole("textbox", { name: "SKILL.md" })).toBeVisible();
	await user.click(screen.getByRole("button", { name: "SKILL.md 的操作" }));
	await user.click(screen.getByRole("menuitem", { name: "删除" }));
	await user.click(
		within(screen.getByRole("alertdialog")).getByRole("button", {
			name: "删除",
		}),
	);
	expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
	expect(screen.getByText("选择或创建文件开始编辑")).toBeVisible();
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"SKILL.md",
	);
	await user.keyboard("{Enter}");
	expect(screen.getByRole("textbox", { name: "SKILL.md" })).toHaveValue("");
});

it("opens actions only from the more button", async () => {
	const user = userEvent.setup();
	renderEditor();
	const file = screen.getByRole("button", { name: "SKILL.md" });
	await user.click(file);
	expect(
		screen.queryByRole("menuitem", { name: "重命名" }),
	).not.toBeInTheDocument();
	await user.pointer({ keys: "[MouseLeft>]", target: file });
	await new Promise((resolve) => setTimeout(resolve, 650));
	expect(
		screen.queryByRole("menuitem", { name: "重命名" }),
	).not.toBeInTheDocument();
	await user.pointer({ keys: "[/MouseLeft]" });
	await user.pointer({ keys: "[MouseRight]", target: file });
	expect(
		screen.queryByRole("menuitem", { name: "重命名" }),
	).not.toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "SKILL.md 的操作" }));
	expect(screen.getByRole("menuitem", { name: "重命名" })).toBeVisible();
	expect(screen.getByRole("menuitem", { name: "删除" })).toBeVisible();
});

it("creates inline in the selected directory and cancels with Escape", async () => {
	const user = userEvent.setup();
	renderEditor();
	await user.click(screen.getByRole("button", { name: "新建文件夹" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件夹路径" }),
		"references",
	);
	await user.keyboard("{Enter}");
	await user.click(screen.getByRole("button", { name: "SKILL.md" }));
	await user.click(screen.getByText("references"));
	await user.click(screen.getByRole("button", { name: "新建文件夹" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件夹路径" }),
		"examples",
	);
	await user.keyboard("{Enter}");
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"guide.md",
	);
	await user.keyboard("{Enter}");
	expect(
		screen.getByRole("textbox", { name: "references/examples/guide.md" }),
	).toBeVisible();
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"cancelled.md",
	);
	await user.keyboard("{Escape}");
	expect(
		screen.queryByRole("textbox", { name: "文件路径" }),
	).not.toBeInTheDocument();
	expect(screen.queryByText("cancelled.md")).not.toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "选择根目录" }));
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"README.md",
	);
	await user.keyboard("{Enter}");
	expect(screen.getByRole("textbox", { name: "README.md" })).toBeVisible();
});
