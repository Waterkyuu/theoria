import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppRouter } from ".";

vi.mock("@/pages/comparison", () => new Promise(() => {}));
vi.mock("@/pages/workspace", () => ({
	default: () => <main>workspace composer route</main>,
}));
vi.mock("@/pages/comparison-history", () => ({
	default: () => <main>comparison history route</main>,
}));

describe("AppRouter", () => {
	it("opens the workspace composer at the root route", async () => {
		window.history.pushState({}, "", "/");
		render(<AppRouter />);

		expect(
			await screen.findByText("workspace composer route"),
		).toBeInTheDocument();
	});

	it("renders comparison detail ids through the history route", async () => {
		window.history.pushState({}, "", "/comparison-history/42");
		render(<AppRouter />);

		expect(
			await screen.findByText("comparison history route"),
		).toBeInTheDocument();
	});
});
