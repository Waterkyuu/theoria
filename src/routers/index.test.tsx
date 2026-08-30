import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from ".";

vi.mock("@/pages/comparison", () => new Promise(() => {}));
vi.mock("@/pages/workspace", () => ({
	default: ({
		workspaceName,
		taskId,
	}: {
		workspaceName?: string;
		taskId?: string;
	}) => (
		<main>
			workspace composer route
			{workspaceName ? <span>bound:{workspaceName}</span> : null}
			{taskId ? <span>task:{taskId}</span> : null}
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
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("restores the ordinary Task composer from the root route by default", async () => {
		window.history.pushState({}, "", "/");
		render(<AppRouter />);

		expect(
			await screen.findByText("workspace composer route"),
		).toBeInTheDocument();
		expect(window.location.pathname).toBe("/task");
	});

	it("restores the last Workspace composer from the root route", async () => {
		window.localStorage.setItem(
			"theoria:last-task-context",
			JSON.stringify({ scope: "workspace", workspaceId: "docs-lab" }),
		);
		window.history.pushState({}, "", "/");
		render(<AppRouter />);

		expect(
			await screen.findByText("workspace composer route"),
		).toBeInTheDocument();
		expect(screen.getByText("bound:docs-lab")).toBeInTheDocument();
		expect(window.location.pathname).toBe("/workspaces/docs-lab");
	});

	it("opens an ordinary Task detail route", async () => {
		window.history.pushState({}, "", "/task/task-42");
		render(<AppRouter />);

		expect(
			await screen.findByText("workspace composer route"),
		).toBeInTheDocument();
		expect(screen.getByText("task:task-42")).toBeInTheDocument();
	});

	it("opens dynamic Workspace composer and Task detail routes", async () => {
		window.history.pushState({}, "", "/workspaces/research-kit/task/task-84");
		render(<AppRouter />);

		expect(await screen.findByText("bound:research-kit")).toBeInTheDocument();
		expect(screen.getByText("task:task-84")).toBeInTheDocument();
	});

	it("opens the skill library from its dedicated route", async () => {
		window.history.pushState({}, "", "/skills");
		render(<AppRouter />);

		expect(await screen.findByText("skills route")).toBeInTheDocument();
	});
});
