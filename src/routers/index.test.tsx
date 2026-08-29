import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from ".";

vi.mock("@/pages/comparison", () => new Promise(() => {}));
vi.mock("@/pages/workspace", () => ({
	default: ({ workspaceName }: { workspaceName?: string }) => (
		<main>
			workspace composer route
			{workspaceName ? <span>bound:{workspaceName}</span> : null}
		</main>
	),
}));
vi.mock("@/pages/comparison-history", () => ({
	default: () => <main>comparison history route</main>,
}));
vi.mock("@/pages/skills", () => ({
	default: () => <main>skills route</main>,
}));

describe("AppRouter", () => {
	it("opens the workspace composer at the root route", async () => {
		window.history.pushState({}, "", "/");
		render(<AppRouter />);

		expect(
			await screen.findByText("workspace composer route"),
		).toBeInTheDocument();
	});

	it("opens a workspace-bound composer from the workspace route", async () => {
		window.history.pushState({}, "", "/workspaces/agent-gauge");
		render(<AppRouter />);

		expect(
			await screen.findByText("workspace composer route"),
		).toBeInTheDocument();
		expect(screen.getByText("bound:agent-gauge")).toBeInTheDocument();
	});

	it("renders comparison detail ids through the history route", async () => {
		window.history.pushState({}, "", "/comparison-history/42");
		render(<AppRouter />);

		expect(
			await screen.findByText("comparison history route"),
		).toBeInTheDocument();
	});

	it("opens the skill library from its dedicated route", async () => {
		window.history.pushState({}, "", "/skills");
		render(<AppRouter />);

		expect(await screen.findByText("skills route")).toBeInTheDocument();
	});
});
