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
	await user.click(screen.getByRole("button", { name: "创建文件" }));
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
		await user.click(screen.getByRole("button", { name: "创建文件" }));
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
	await user.click(screen.getByRole("button", { name: "创建文件夹" }));
	expect(screen.getByText("references")).toBeVisible();
	await user.click(screen.getByRole("button", { name: "新建文件" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件路径" }),
		"references/guide.md",
	);
	await user.click(screen.getByRole("button", { name: "创建文件" }));
	expect(
		screen.getByRole("textbox", { name: "references/guide.md" }),
	).toBeVisible();
	await user.click(screen.getByRole("button", { name: "新建文件夹" }));
	await user.type(
		screen.getByRole("textbox", { name: "文件夹路径" }),
		"scripts",
	);
	await user.click(screen.getByRole("button", { name: "创建文件夹" }));
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
