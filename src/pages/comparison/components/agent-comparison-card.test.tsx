import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { AgentComparisonCard } from "./agent-comparison-card";

describe("AgentComparisonCard", () => {
	beforeEach(async () => {
		await i18n.changeLanguage("zh-CN");
	});

	it("shows the context compaction count for a completed run", () => {
		render(
			<AgentComparisonCard
				agent="codex"
				errorMessage={null}
				isRunning={false}
				numberLocale="zh-CN"
				result={{
					response: "done",
					totalDurationMs: 1_000,
					timeToFirstTokenMs: 100,
					tokenUsage: null,
					thinkingDurationMs: 200,
					compactionCount: 2,
					toolCallCount: 0,
					toolCalls: [],
				}}
			/>,
		);

		expect(screen.getByText("压缩次数").parentElement).toHaveTextContent(
			"压缩次数2",
		);
	});
});
