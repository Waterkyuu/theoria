import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import BenchmarkPage from ".";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(async () => {
	await i18n.changeLanguage("en-US");
	invoke.mockReset();
	invoke.mockImplementation(async (command: string) => {
		if (command === "list_benchmark_tags")
			return [{ id: "code", name: "Coding", icon: "Code", isSystem: false }];
		if (command === "list_benchmarks")
			return [
				{
					id: "suite",
					name: "Bug fixing",
					description: "Repair a failing test",
					tagId: "code",
					author: "myself",
					source: null,
					archived: false,
					versionId: "v1",
					versionNumber: 1,
					caseCount: 2,
					createdAtMs: 1,
				},
			];
		return [];
	});
});

it("shows published cards and forwards search and author filters to the catalog", async () => {
	const user = userEvent.setup();
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<MemoryRouter>
				<BenchmarkPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
	expect(
		await screen.findByRole("link", { name: "Bug fixing" }),
	).toBeInTheDocument();
	await user.type(screen.getByRole("searchbox"), "repair");
	await user.click(screen.getByRole("button", { name: "Author" }));
	await user.click(await screen.findByRole("button", { name: "MySelf" }));
	expect(invoke).toHaveBeenLastCalledWith("list_benchmarks", {
		request: {
			search: "repair",
			tagIds: [],
			author: "myself",
			sort: "newest",
			page: 0,
		},
	});
	expect(screen.getByRole("button", { name: "Mount" })).toBeInTheDocument();
});

it("shows a retryable catalog failure instead of an empty library", async () => {
	invoke.mockRejectedValue(new Error("offline"));
	const user = userEvent.setup();
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<MemoryRouter>
				<BenchmarkPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
	expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
	expect(
		screen.queryByText("No benchmarks found. Create one or clear the filters."),
	).not.toBeInTheDocument();
	invoke.mockResolvedValue([]);
	await user.click(screen.getAllByRole("button", { name: "Retry" })[1]);
	expect(
		await screen.findByText(
			"No benchmarks found. Create one or clear the filters.",
		),
	).toBeInTheDocument();
});
