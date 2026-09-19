import { describe, expect, it } from "vitest";
import { findIconColorViolations } from "./check-icon-colors.mjs";

describe("findIconColorViolations", () => {
	it("allows semantic colors and blue folder identity", () => {
		const source = `
			import { FolderFill, FolderOpenFill, Plus, TrashBin } from "@gravity-ui/icons";
			const Example = () => (
				<>
					<Plus className="size-4 text-ink" />
					<Plus className="size-4 text-mute" />
					<TrashBin className="size-4 text-danger" />
					<FolderFill className="size-4 text-blue-300" />
					<FolderOpenFill className="size-4 text-blue-300" />
				</>
			);
		`;

		expect(findIconColorViolations(source, "example.tsx")).toEqual([]);
	});

	it("rejects non-semantic text colors on icon components", () => {
		const source = `
			import { Plus } from "@gravity-ui/icons";
			const Example = () => (
				<>
					<Plus className="size-4 text-blue-300" />
					<span className="text-blue-300">Not an icon</span>
				</>
			);
		`;

		expect(findIconColorViolations(source, "example.tsx")).toEqual([
			expect.objectContaining({ line: 5, color: "text-blue-300" }),
		]);
	});

	it("ignores custom icons and inline SVG paint colors", () => {
		const source = `
			const Example = () => (
				<>
					<AgentIcon className="text-charcoal" name="codex" />
					<svg fill="#fff" style={{ color: "rgb(0, 0, 0)" }}>
						<path stroke="red" />
					</svg>
				</>
			);
		`;

		expect(findIconColorViolations(source, "example.tsx")).toEqual([]);
	});
});
