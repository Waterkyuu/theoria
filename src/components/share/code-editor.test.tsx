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
