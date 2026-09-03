import { invoke } from "@tauri-apps/api/core";
import { type EventCallback, listen } from "@tauri-apps/api/event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { checkCodexLogin, onCodexConfigChanged } from "@/api/codex";
import { saveComparisonHistory } from "@/api/comparison";
import { checkQoderLogin } from "@/api/qoder";
import { checkTraeCodeLogin } from "@/api/traecode";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(vi.fn()),
}));

describe("IPC response validation", () => {
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("returns a valid command response", async () => {
		vi.mocked(invoke).mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "account",
		});

		await expect(checkCodexLogin()).resolves.toEqual({
			installed: true,
			loggedIn: true,
			authenticationMethod: "account",
		});
	});

	it("checks Qoder and TraeCode CLI accounts through dedicated commands", async () => {
		vi.mocked(invoke).mockResolvedValue({
			installed: true,
			loggedIn: true,
			authenticationMethod: "account",
		});

		await checkQoderLogin();
		await checkTraeCodeLogin();

		expect(invoke).toHaveBeenNthCalledWith(1, "check_qoder_login", undefined);
		expect(invoke).toHaveBeenNthCalledWith(
			2,
			"check_traecode_login",
			undefined,
		);
	});

	it("rejects a malformed command response", async () => {
		vi.mocked(invoke).mockResolvedValue({
			installed: "yes",
			loggedIn: true,
			authenticationMethod: null,
		});

		await expect(checkCodexLogin()).rejects.toBeInstanceOf(ZodError);
	});

	it("ignores a malformed event response", async () => {
		const listener = vi.fn();
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		await onCodexConfigChanged(listener);
		const eventListener = vi.mocked(listen).mock.calls[0]?.[1] as
			| EventCallback<unknown>
			| undefined;
		eventListener?.({
			event: "codex-config-changed",
			id: 1,
			payload: { model: 42, reasoningEffort: null },
		});

		expect(listener).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledOnce();
	});

	it("rejects a malformed comparison save response", async () => {
		vi.mocked(invoke).mockResolvedValue({ id: "42" });

		await expect(
			saveComparisonHistory({
				query: "Compare agents",
				results: [
					{
						agent: "codex",
						model: null,
						reasoningEffort: null,
						status: "failed",
						errorMessage: "Agent failed",
					},
				],
			}),
		).rejects.toBeInstanceOf(ZodError);
	});
});
