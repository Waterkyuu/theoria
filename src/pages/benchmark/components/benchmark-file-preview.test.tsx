import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { BenchmarkFilePreview } from "./benchmark-file-preview";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// JSDOM has no text layout; supply the geometry that CodeMirror measures.
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

it("shows a read-only highlighted preview for a source file", async () => {
	await i18n.changeLanguage("en-US");
	invoke.mockResolvedValue({
		assetId: "asset-1",
		sizeBytes: 16,
		text: "const count = 1;",
		truncated: false,
	});
	const user = userEvent.setup();
	render(
		<BenchmarkFilePreview
			file={{ path: "src/count.js", assetId: "asset-1" }}
		/>,
	);

	await user.click(screen.getByRole("button", { name: "Preview" }));
	const preview = await screen.findByRole("region", { name: "src/count.js" });
	await waitFor(() => expect(screen.getByText("const")).toBeVisible());
	expect(preview).toHaveTextContent("const count = 1;");
	expect(within(preview).getByRole("textbox")).toHaveAttribute(
		"aria-readonly",
		"true",
	);
});
