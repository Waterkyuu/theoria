import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CodeEditor } from "./code-editor";

// JSDOM has no text layout; supply only the geometry contract CodeMirror measures.
beforeAll(() => {
	Object.defineProperty(Range.prototype, "getClientRects", {
		configurable: true,
		value: () => [],
	});
	Object.defineProperty(Range.prototype, "getBoundingClientRect", {
		configurable: true,
		value: () => new DOMRect(),
	});
});

afterAll(() => {
	Reflect.deleteProperty(Range.prototype, "getClientRects");
	Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});

it("reports edits and restores each document when switching files", async () => {
	const user = userEvent.setup();
	const onChange = vi.fn();
	const view = render(
		<CodeEditor path="SKILL.md" value="" onChange={onChange} />,
	);
	await user.click(screen.getByRole("textbox", { name: "SKILL.md" }));
	await user.paste("# Skill instructions");
	await waitFor(() =>
		expect(onChange).toHaveBeenLastCalledWith("# Skill instructions"),
	);
	view.rerender(
		<CodeEditor path="guide.md" value="Guide" onChange={onChange} />,
	);
	expect(screen.getByRole("textbox", { name: "guide.md" })).toHaveTextContent(
		"Guide",
	);
	view.rerender(
		<CodeEditor
			path="SKILL.md"
			value="# Skill instructions"
			onChange={onChange}
		/>,
	);
	expect(screen.getByRole("textbox", { name: "SKILL.md" })).toHaveTextContent(
		"# Skill instructions",
	);
});

it.each([
	["index.js", "const count = 1;", "const"],
	["index.jsx", "const node = <div />;", "const"],
	["index.ts", "interface User { name: string }", "interface"],
	["index.tsx", "const node = <div />;", "const"],
	["main.rs", "fn main() {}", "fn"],
	["main.go", "package main", "package"],
	["Main.java", "public class Main {}", "public"],
	["config.json", '{"enabled": true}', "true"],
	["CONFIG.JSON", '{"enabled": false}', "false"],
])("highlights language tokens in %s", async (path, value, token) => {
	render(<CodeEditor path={path} value={value} onChange={vi.fn()} />);
	await waitFor(() =>
		expect(screen.getByText(token, { selector: "span" })).toBeVisible(),
	);
});

it("keeps unknown file types editable as plain text", async () => {
	const user = userEvent.setup();
	const onChange = vi.fn();
	render(<CodeEditor path="notes.unknown" value="" onChange={onChange} />);
	await user.click(screen.getByRole("textbox", { name: "notes.unknown" }));
	await user.paste("plain text");
	expect(onChange).toHaveBeenLastCalledWith("plain text");
});

it("applies only the active file language during rapid document switches", async () => {
	const onChange = vi.fn();
	const view = render(
		<CodeEditor path="main.rs" value="fn main() {}" onChange={onChange} />,
	);
	view.rerender(
		<CodeEditor
			path="config.json"
			value={'{"enabled": true}'}
			onChange={onChange}
		/>,
	);
	await waitFor(() =>
		expect(screen.getByText("true", { selector: "span" })).toBeVisible(),
	);
	view.rerender(
		<CodeEditor path="main.rs" value="fn main() {}" onChange={onChange} />,
	);
	await waitFor(() =>
		expect(screen.getByText("fn", { selector: "span" })).toBeVisible(),
	);
	expect(onChange).not.toHaveBeenCalled();
});
