import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentIcon } from "@/components/share/agent-icon";

describe("AgentIcon", () => {
	it("maps the TraeCode identifier to the published Trae logo asset", () => {
		render(<AgentIcon name="traecode" />);

		expect(screen.getByRole("img", { name: "traecode" })).toHaveAttribute(
			"src",
			"https://cdn.reicon.dev/logos/trae/original.svg",
		);
	});
});
