import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import i18n from "@/i18n";
import BenchmarkEditorPage from "./editor";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
it("retains the saved revision after publication fails so retry uses the latest draft", async () => {
	await i18n.changeLanguage("en-US");
	const document = {
		schemaVersion: 1,
		name: "Answer suite",
		description: "One answer",
		tagId: "code",
		source: null,
		cases: [
			{
				name: "Count",
				prompt: "Return 42",
				timeoutMinutes: 1,
				inputFiles: [],
				checks: [{ kind: "answer", expected: "42" }],
			},
		],
	};
	let revision = 1;
	invoke.mockImplementation(async (command: string) => {
		if (command === "list_benchmark_tags")
			return [{ id: "code", name: "Coding", icon: "Code", isSystem: false }];
		if (command === "save_benchmark_draft") revision++;
		if (command === "publish_benchmark")
			throw new Error("publication unavailable");
		return {
			id: "draft",
			benchmarkId: null,
			document,
			revision,
			updatedAtMs: 1,
		};
	});
	const user = userEvent.setup();
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<MemoryRouter initialEntries={["/benchmark/drafts/draft"]}>
				<Routes>
					<Route
						path="/benchmark/drafts/:draftId"
						element={<BenchmarkEditorPage />}
					/>
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
	await screen.findByDisplayValue("Answer suite");
	await user.click(screen.getByRole("button", { name: "Publish" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith("publish_benchmark", {
			request: { draftId: "draft", expectedRevision: 2 },
		}),
	);
	await user.click(screen.getByRole("button", { name: "Publish" }));
	await waitFor(() =>
		expect(invoke).toHaveBeenCalledWith("save_benchmark_draft", {
			request: { document, draftId: "draft", expectedRevision: 2 },
		}),
	);
	expect(screen.getByDisplayValue("Return 42")).toBeInTheDocument();
});
