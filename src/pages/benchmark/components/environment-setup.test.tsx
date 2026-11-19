import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { BenchmarkEnvironmentSetup } from "./environment-setup";

const { invoke, openUrl } = vi.hoisted(() => ({
	invoke: vi.fn(),
	openUrl: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

it("detects missing tools and rechecks after preparing the verifier", async () => {
	await i18n.changeLanguage("en-US");
	let prepared = false;
	invoke.mockImplementation(
		async (command: string, input?: { action: string }) => {
			if (command === "repair_benchmark_environment") {
				expect(input?.action).toBe("prepareVerifier");
				prepared = true;
			}
			return {
				harbor: "versionMismatch",
				docker: "ready",
				verifierImage: prepared ? "ready" : "missing",
				dockerInstallUrl:
					"https://docs.docker.com/desktop/setup/install/mac-install/",
			};
		},
	);
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<BenchmarkEnvironmentSetup />
		</QueryClientProvider>,
	);
	const user = userEvent.setup();
	expect(invoke).not.toHaveBeenCalled();
	await user.click(
		screen.getByRole("button", { name: "Set up evaluation environment" }),
	);
	await screen.findByText("A different version is installed");
	await user.click(
		screen.getByRole("button", { name: "Prepare verification image" }),
	);
	await waitFor(() =>
		expect(
			screen.queryByRole("button", { name: "Prepare verification image" }),
		).not.toBeInTheDocument(),
	);
	expect(invoke).toHaveBeenCalledWith("repair_benchmark_environment", {
		action: "prepareVerifier",
	});
});

it("opens official Docker installation without claiming installation completed", async () => {
	await i18n.changeLanguage("en-US");
	invoke.mockImplementation(async () => ({
		harbor: "missing",
		docker: "missing",
		verifierImage: "unavailable",
		dockerInstallUrl:
			"https://docs.docker.com/desktop/setup/install/windows-install/",
	}));
	render(
		<QueryClientProvider client={new QueryClient()}>
			<BenchmarkEnvironmentSetup />
		</QueryClientProvider>,
	);
	const user = userEvent.setup();
	await user.click(
		screen.getByRole("button", { name: "Set up evaluation environment" }),
	);
	await user.click(
		await screen.findByRole("button", { name: "Install Docker" }),
	);
	expect(openUrl).toHaveBeenCalledWith(
		"https://docs.docker.com/desktop/setup/install/windows-install/",
	);
	const dialog = screen.getByRole("dialog", { name: "Evaluation environment" });
	expect(within(dialog).getAllByText("Not installed")).toHaveLength(2);
	expect(
		within(dialog).getByRole("button", { name: "Check again" }),
	).toBeEnabled();
});
